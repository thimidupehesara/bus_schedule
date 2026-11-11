import { describe, expect, it } from 'vitest';
import { buildBoard, colomboParts } from '../board.js';
import {
  DEFAULT_DISPLAY_SETTINGS,
  ScheduleDocumentSchema,
  type BusService,
  type ScheduleDocument,
} from '../schema.js';
import { mockSchedule } from '../../../../apps/tv/src/mock/mock-schedule.js';

const at = (day: number, time: string) =>
  Date.parse(`2026-11-${String(day).padStart(2, '0')}T${time}+05:30`);
const service = (departure: string, overrides: Partial<BusService> = {}): BusService => ({
  ...mockSchedule.services[0]!,
  departure,
  ...overrides,
});
const doc = (
  services: BusService[],
  display: Partial<ScheduleDocument['display']> = {},
): ScheduleDocument => ({
  ...mockSchedule,
  services,
  display: { ...DEFAULT_DISPLAY_SETTINGS, ...display },
});
const rows = (result: ReturnType<typeof buildBoard>) => result.pages.flatMap((page) => page.rows);

describe('Colombo board', () => {
  it('changes date and ISO weekday at 18:30 UTC', () => {
    expect(colomboParts(Date.parse('2026-11-09T18:29:00Z'))).toEqual({
      date: '2026-11-09',
      weekday: 1,
      minutes: 1439,
    });
    expect(colomboParts(Date.parse('2026-11-09T18:31:00Z'))).toEqual({
      date: '2026-11-10',
      weekday: 2,
      minutes: 1,
    });
  });
  it('includes Tuesday midnight from Monday afternoon only in the normal window when in range', () => {
    const overnight = service('00:30', { days: [2] });
    const nearby = service('16:00', { days: [1] });
    expect(
      rows(buildBoard(doc([overnight, nearby]), at(9, '15:37'))).map((row) => row.service),
    ).toEqual([nearby]);
    expect(
      rows(buildBoard(doc([overnight], { lookaheadHours: 9 }), at(9, '15:37')))[0],
    ).toMatchObject({
      dayOffset: 1,
      departureAt: at(10, '00:30'),
    });
  });
  it.each([
    [9, 2, 1],
    [15, 1, 7],
  ] as const)(
    'uses the departure weekday across midnight on November %i',
    (day, tomorrow, today) => {
      const next = service('00:30', { days: [tomorrow] });
      const past = service('00:30', { days: [today] });
      expect(rows(buildBoard(doc([next, past]), at(day, '23:50')))).toEqual([
        {
          service: next,
          dayOffset: 1,
          departureAt: at(day + 1, '00:30'),
          status: 'UPCOMING',
          minutesUntil: 40,
        },
      ]);
    },
  );
  it('keeps Monday late departures in Tuesday grace, then excludes them with zero grace', () => {
    const past = service('23:58', { days: [1] });
    const next = service('00:03', { days: [2] });
    expect(rows(buildBoard(doc([next, past]), at(10, '00:02')))[0]).toMatchObject({
      service: past,
      dayOffset: -1,
      status: 'DEPARTED',
      minutesUntil: -4,
    });
    expect(
      rows(buildBoard(doc([past, next], { departedGraceMinutes: 0 }), at(10, '00:02'))).map(
        (row) => row.service,
      ),
    ).toEqual([next]);
  });
  it('honors grace, soon and lookahead boundaries inclusively', () => {
    const times = ['09:54', '09:55', '09:56', '10:00', '10:15', '10:16', '11:00', '11:01'];
    const result = buildBoard(
      doc(
        times.map((departure) => service(departure)),
        { lookaheadHours: 1, departedGraceMinutes: 5 },
      ),
      at(9, '10:00'),
    );
    expect(
      rows(result).map((row) => [row.service.departure, row.status, row.minutesUntil]),
    ).toEqual([
      ['09:55', 'DEPARTED', -5],
      ['09:56', 'DEPARTED', -4],
      ['10:00', 'SOON', 0],
      ['10:15', 'SOON', 15],
      ['10:16', 'UPCOMING', 16],
      ['11:00', 'UPCOMING', 60],
    ]);
    expect(rows(buildBoard(doc([service('10:15')]), at(9, '09:59:59.999')))[0]?.status).toBe(
      'UPCOMING',
    );
  });
  it('keeps the earliest occurrence, hides inactive rows and breaks time ties by destination then ID', () => {
    const a = service('23:59', { id: 'a', destination: { en: 'Badulla', si: 'Badulla' } });
    const b = service('23:59', { id: 'b', destination: a.destination });
    const c = service('23:59', { id: 'c', destination: { en: 'Kandy', si: 'Kandy' } });
    const input = doc([c, b, { ...a, active: false }, a], { lookaheadHours: 24 });
    const before = structuredClone(input);
    const result = buildBoard(input, at(10, '00:00'), { maxDepartedRows: Infinity });
    expect(rows(result).map((row) => row.service.id)).toEqual(['a', 'b', 'c']);
    expect(rows(result).every((row) => row.dayOffset === -1)).toBe(true);
    expect(input).toEqual(before);
  });
  it.each([
    [0, []],
    [1, [1]],
    [5, [5]],
    [6, [5, 1]],
  ] as const)('pages %i rows', (count, lengths) => {
    const result = buildBoard(
      doc(Array.from({ length: count }, (_, i) => service('10:00', { id: String(i) }))),
      at(9, '10:00'),
    );
    expect(result.totalRows).toBe(count);
    expect(result.pages.map((page) => page.rows.length)).toEqual(lengths);
    result.pages.forEach((page, i) =>
      expect(page).toMatchObject({ pageIndex: i, pageCount: lengths.length }),
    );
    if (count === 0)
      expect(result).toMatchObject({ mode: 'NO_SERVICES', usedFallbackWindow: true });
  });
  it('takes the earliest fallback rows up to two pages, including a departure next week', () => {
    const services = Array.from({ length: 5 }, (_, i) =>
      service(`1${i + 2}:00`, { id: String(i) }),
    );
    const result = buildBoard(
      doc(services.reverse(), { rowsPerPage: 2, lookaheadHours: 1 }),
      at(9, '09:00'),
    );
    expect(result).toMatchObject({ mode: 'NORMAL', usedFallbackWindow: true, totalRows: 4 });
    expect(rows(result).map((row) => row.service.id)).toEqual(['0', '1', '2', '3']);
    const weekly = buildBoard(
      doc([service('08:59', { days: [1] })], { departedGraceMinutes: 0 }),
      at(9, '09:00'),
    );
    expect(rows(weekly)[0]).toMatchObject({ dayOffset: 7, departureAt: at(16, '08:59') });
  });
  it('shows every active service with an unsynced clock, even if now is unusable', () => {
    const input = doc([
      service('23:00', { days: [7] }),
      service('01:00'),
      service('12:00', { active: false }),
    ]);
    const result = buildBoard(input, NaN, { clockSynced: false });
    expect(result).toMatchObject({
      mode: 'CLOCK_UNSYNCED',
      usedFallbackWindow: false,
      totalRows: 2,
    });
    expect(rows(result).map((row) => row.service.departure)).toEqual(['01:00', '23:00']);
    rows(result).forEach((row) =>
      expect(row).toMatchObject({
        dayOffset: 0,
        departureAt: 0,
        minutesUntil: 0,
        status: 'UPCOMING',
      }),
    );
  });
  it('validates the mock against the schema and shows regular-window rows throughout the day', () => {
    expect(ScheduleDocumentSchema.safeParse(mockSchedule).success).toBe(true);
    expect(mockSchedule.services).toHaveLength(36);
    for (const time of [
      '00:00',
      '02:30',
      '05:00',
      '07:30',
      '10:00',
      '12:30',
      '15:00',
      '17:30',
      '20:00',
      '23:59',
    ]) {
      const result = buildBoard(mockSchedule, at(9, time));
      expect(result.totalRows).toBeGreaterThan(0);
      expect(result.usedFallbackWindow).toBe(false);
    }
  });
});

it('caps departed rows across the board, retaining the newest and all upcoming rows', () => {
  const input = doc(
    ['09:50', '09:55', '09:59', '10:01'].map((time, i) => service(time, { id: String(i) })),
  );
  const now = at(9, '10:00');
  expect(rows(buildBoard(input, now)).map((row) => row.service.departure)).toEqual([
    '09:55',
    '09:59',
    '10:01',
  ]);
  expect(
    rows(buildBoard(input, now, { maxDepartedRows: 1 })).map((row) => row.service.departure),
  ).toEqual(['09:59', '10:01']);
  expect(rows(buildBoard(input, now, { maxDepartedRows: Infinity }))).toHaveLength(4);
});

it('uses upcoming fallback when the cap removes every qualifying row', () => {
  const input = doc([service('09:59', { days: [1, 2] })]);
  const result = buildBoard(input, at(9, '10:00'), { maxDepartedRows: 0 });
  expect(result.usedFallbackWindow).toBe(true);
  expect(rows(result)).toMatchObject([{ dayOffset: 1, status: 'UPCOMING' }]);
  expect(
    buildBoard(input, at(9, '10:00'), { clockSynced: false, maxDepartedRows: 0 }).totalRows,
  ).toBe(1);
});
