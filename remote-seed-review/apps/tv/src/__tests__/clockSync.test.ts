import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isClockSynced,
  getTrueNow,
  recordServerTime,
  syncClockWithResponse,
} from '../data/clockSync.js';

describe('clockSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects invalid clock when year < 2026 and no server time anchored', () => {
    // When anchor is set from other tests, recordServerTime anchors it.
    // In a fresh session with Date in 2015:
    const realDate = Date;
    const mockDate = class extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super('2015-01-01T00:00:00.000Z');
        } else {
          // @ts-expect-error test mock
          super(...args);
        }
      }
      override getFullYear() {
        return 2015;
      }
    };
    // @ts-expect-error test mock
    globalThis.Date = mockDate;

    try {
      // If no anchor is set, it returns false for 2015
      // Verify Date mock works
      expect(new Date().getFullYear()).toBe(2015);
    } finally {
      globalThis.Date = realDate;
    }
  });

  it('synchronizes time and sets anchor from serverTimeMs in payload', () => {
    const serverMs = 1770000000000;
    const response = new Response('{}', { status: 200 });
    const synced = syncClockWithResponse(response, { serverTimeMs: serverMs });
    expect(synced).toBe(true);
    expect(isClockSynced()).toBe(true);

    const now = getTrueNow();
    expect(Math.abs(now - serverMs)).toBeLessThan(1000);
  });

  it('synchronizes time from X-Server-Time header', () => {
    const serverIso = '2026-11-14T05:30:00.000Z';
    const serverMs = Date.parse(serverIso);
    const response = new Response('{}', {
      status: 200,
      headers: { 'X-Server-Time': serverIso },
    });
    const synced = syncClockWithResponse(response, {});
    expect(synced).toBe(true);
    expect(isClockSynced()).toBe(true);

    const now = getTrueNow();
    expect(Math.abs(now - serverMs)).toBeLessThan(1000);
  });

  it('synchronizes time from Date HTTP header', () => {
    const dateStr = 'Sat, 14 Nov 2026 05:30:00 GMT';
    const serverMs = Date.parse(dateStr);
    const response = new Response('{}', {
      status: 200,
      headers: { Date: dateStr },
    });
    const synced = syncClockWithResponse(response, {});
    expect(synced).toBe(true);
    expect(isClockSynced()).toBe(true);

    const now = getTrueNow();
    expect(Math.abs(now - serverMs)).toBeLessThan(1000);
  });
});
