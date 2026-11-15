import { describe, expect, it } from 'vitest';
import type { BoardRow, BusService } from '@bus-schedule/shared';
import { paginateRows, TV_DWELL_SECONDS } from '../pagination.js';

function makeService(overrides: Partial<BusService> = {}): BusService {
  return {
    id: 'test-service-1',
    destination: { si: 'කොළඹ', en: 'Colombo' },
    origin: { si: 'මහියංගණය', en: 'Mahiyanganaya' },
    via: null,
    operator: 'PVT',
    serviceType: 'NORMAL',
    arrival: null,
    departure: '08:30',
    tripStart: null,
    destinationArrival: null,
    bay: null,
    days: [1, 2, 3, 4, 5, 6, 7],
    active: true,
    ...overrides,
  };
}

function makeRow(overrides: Partial<BoardRow> = {}): BoardRow {
  return {
    service: makeService(),
    departureAt: 1731553800000,
    dayOffset: 0,
    status: 'UPCOMING',
    minutesUntil: 30,
    ...overrides,
  };
}

describe('Fixed TV pagination', () => {
  it('keeps four rows even when all rows have tomorrow or weekday badges', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow({ dayOffset: ((i % 3) as 0 | 1 | 2) }));
    const pages = paginateRows(rows);
    expect(pages.map(page => page.length)).toEqual([4, 4, 2]);
    expect(pages.flat()).toEqual(rows);
    expect(TV_DWELL_SECONDS).toBe(10);
  });
  it('handles an empty schedule', () => expect(paginateRows([])).toEqual([]));
});
