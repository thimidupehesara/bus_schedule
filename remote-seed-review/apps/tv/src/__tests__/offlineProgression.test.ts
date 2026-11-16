import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildBoard,
  colomboParts,
  type BusService,
  type ScheduleDocument,
} from '@bus-schedule/shared';
import {
  getTrueNow,
  recordServerTime,
  resetClockSyncForTest,
  getClockOffsetMs,
  probeServerTime,
} from '../data/clockSync.js';
import {
  loadCachedSchedule,
  saveCachedSchedule,
  getBundledSchedule,
  SCHEDULE_STORAGE_KEY,
} from '../data/useSchedule.js';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function makeService(overrides: Partial<BusService> = {}): BusService {
  return {
    id: '3bf7ba85-ebb1-4cbc-996e-8a71d629b7f8',
    destination: { si: 'කොළඹ', en: 'Colombo' },
    origin: { si: 'මහියංගණය', en: 'Mahiyanganaya' },
    via: null,
    operator: 'PVT',
    serviceType: 'NORMAL',
    arrival: null,
    departure: '15:30',
    tripStart: null,
    destinationArrival: null,
    bay: null,
    days: [1, 2, 3, 4, 5, 6, 7],
    active: true,
    ...overrides,
  };
}

function makeSchedule(services: BusService[]): ScheduleDocument {
  return {
    schemaVersion: 1,
    version: 35,
    publishedAt: '2026-11-16T00:00:00.000Z',
    lastVerified: '2026-11-16',
    timezone: 'Asia/Colombo',
    station: {
      name: { si: 'මහියංගන', en: 'Mahiyanganaya Bus Stand' },
      mobileUrl: 'https://mahiyanganaya-bus.workers.dev/qr',
    },
    alert: null,
    display: {
      rowsPerPage: 4,
      dwellSeconds: 10,
      fadeMs: 300,
      departedGraceMinutes: 15,
      soonThresholdMinutes: 15,
      lookaheadHours: 8,
      safeAreaPercent: 1.5,
      pollIntervalSeconds: 180,
      reloadAtLocalTime: '02:30',
    },
    services,
  };
}

describe('Offline Clock & Schedule Progression', () => {
  const originalFetch = globalThis.fetch;
  let mockStorage: Storage;

  beforeEach(() => {
    vi.useFakeTimers();
    resetClockSyncForTest();
    mockStorage = createMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('hydrates schedule from localStorage when fetch fails (offline mode)', async () => {
    // Simulate Wi-Fi completely offline
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (offline)'));

    const testDoc = makeSchedule([
      makeService({ id: '00000000-0000-0000-0000-000000000001', departure: '10:00' }),
      makeService({ id: '00000000-0000-0000-0000-000000000002', departure: '11:00' }),
    ]);

    // Save schedule in cache
    saveCachedSchedule(testDoc);
    expect(mockStorage.getItem(SCHEDULE_STORAGE_KEY)).toBeTruthy();

    // Hydrate
    const hydrated = loadCachedSchedule();
    expect(hydrated).not.toBeNull();
    expect(hydrated?.version).toBe(35);
    expect(hydrated?.services).toHaveLength(2);
  });

  it('falls back to bundled schedule if localStorage cache is empty on cold boot without Wi-Fi', () => {
    mockStorage.clear();
    const fallback = loadCachedSchedule() ?? getBundledSchedule();
    expect(fallback).toBeDefined();
    expect(fallback.services.length).toBeGreaterThan(0);
    expect(fallback.station.name.en).toContain('Mahiyanganaya');
  });

  it('advances live clock by 60 minutes offline and updates board rows progression', () => {
    // 2026-11-16 at 09:30 UTC = 15:00 Asia/Colombo (+05:30)
    const baseTimeUtc = Date.UTC(2026, 10, 16, 9, 30, 0); // 15:00 in Colombo
    vi.setSystemTime(baseTimeUtc);

    // Initial server sync anchored with 0ms offset
    recordServerTime(baseTimeUtc);
    expect(getClockOffsetMs()).toBe(0);

    const doc = makeSchedule([
      makeService({ id: '00000000-0000-0000-0000-000000001510', departure: '15:10' }), // Departs at 15:10 Colombo
      makeService({ id: '00000000-0000-0000-0000-000000001540', departure: '15:40' }), // Departs at 15:40 Colombo
      makeService({ id: '00000000-0000-0000-0000-000000001610', departure: '16:10' }), // Departs at 16:10 Colombo
      makeService({ id: '00000000-0000-0000-0000-000000001640', departure: '16:40' }), // Departs at 16:40 Colombo
    ]);

    // Check board at 15:00
    const colomboBefore = colomboParts(getTrueNow());
    expect(colomboBefore.minutes).toBe(15 * 60); // 15:00
    const boardBefore = buildBoard(doc, getTrueNow());
    const visibleBefore = boardBefore.pages.flatMap((p) => p.rows);

    // At 15:00, bus-1510 is upcoming (in 10 min) and bus-1540 is upcoming (in 40 min)
    expect(visibleBefore.some((r) => r.service.id === '00000000-0000-0000-0000-000000001510')).toBe(true);
    const bus1510Before = visibleBefore.find((r) => r.service.id === '00000000-0000-0000-0000-000000001510');
    expect(bus1510Before?.status).toBe('SOON');

    // Simulate Wi-Fi dropped: fetch fails
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Wi-Fi disconnected'));

    // Advance fake timers by 60 minutes (3,600,000 ms) while completely offline
    vi.advanceTimersByTime(60 * 60 * 1000);

    // Verify displayed TV clock advanced by 60 minutes
    const colomboAfter = colomboParts(getTrueNow());
    expect(colomboAfter.minutes).toBe(16 * 60); // Now 16:00 in Colombo

    // Re-evaluate board at new time
    const boardAfter = buildBoard(doc, getTrueNow());
    const visibleAfter = boardAfter.pages.flatMap((p) => p.rows);

    // At 16:00:
    // bus-1510 departed at 15:10 (>15 min grace ago, so removed or past grace)
    // bus-1540 departed at 15:40 (20 min ago)
    // bus-1610 departs at 16:10 (in 10 min -> SOON!)
    const bus1610After = visibleAfter.find((r) => r.service.id === '00000000-0000-0000-0000-000000001610');
    expect(bus1610After).toBeDefined();
    expect(bus1610After?.status).toBe('SOON');
    expect(bus1610After?.minutesUntil).toBe(10);
  });

  it('handles background probe timeout gracefully without unhandled exceptions', async () => {
    // Mock fetch that respects AbortController signal
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            reject(new Error('The operation was aborted'));
          });
        }
      });
    });

    const probePromise = probeServerTime();

    // Advance past the 5000ms AbortController timeout
    vi.advanceTimersByTime(5000);

    const result = await probePromise;
    expect(result).toBe(false);
  });
});
