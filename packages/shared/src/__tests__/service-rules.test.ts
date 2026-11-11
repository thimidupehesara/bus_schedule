import { describe, it, expect } from 'vitest';
import { BusServiceSchema, type BusService } from '../schema.js';
import {
  normalizeServiceInput,
  validateServiceStrict,
  validateAlertStrict,
  validateLastVerified,
  colomboDate,
} from '../service-rules.js';
import { findClosestKnownPlace } from '../known-places.js';
import sample from '../sample-schedule.json' with { type: 'json' };
const service = (): BusService => ({
  ...BusServiceSchema.parse(sample.services[0]),
  arrival: '08:00',
  departure: '08:30',
  bay: 'A1',
});
const context = { station: sample.station, services: [] as BusService[] };
const check = (patch: Record<string, unknown>) =>
  validateServiceStrict({ ...service(), ...patch }, context);
describe('strict service rules', () => {
  it('accepts the baseline', () => expect(check({}).errors).toEqual([]));
  it.each(['5:30', '0530', '5.30', '෦෫:෩෦', '٠٥:٣٠', '۰۵:۳۰'])('normalizes %s', (time) => {
    expect(normalizeServiceInput({ departure: time })).toEqual({ departure: '05:30' });
  });
  it.each(['530pm', '25:00', '24:10', '530', '5:3', '12:60', '', null, undefined])(
    'rejects ambiguous or invalid departure %s',
    (departure) => {
      const result = validateServiceStrict(
        normalizeServiceInput({ ...service(), departure }),
        context,
      );
      expect(
        result.errors.some(
          (i) => i.field === 'departure' && /[\u0D80-\u0DFF]/.test(i.message_si) && i.message_en,
        ),
      ).toBe(true);
    },
  );
  it.each(['tripStart', 'destinationArrival', 'arrival'])('validates optional %s', (field) =>
    expect(check({ [field]: '24:00' }).errors.length).toBeGreaterThan(0),
  );
  it.each([
    [0, false, false],
    [89, false, false],
    [90, false, true],
    [180, false, true],
    [181, true, false],
  ])('checks wait %i minutes', (gap, error, warning) => {
    const departure = `${String(8 + Math.floor(Number(gap) / 60)).padStart(2, '0')}:${String(Number(gap) % 60).padStart(2, '0')}`;
    const result = check({ departure });
    expect(result.errors.some((e) => e.code === 'WAIT_TOO_LONG')).toBe(error);
    expect(result.warnings.some((e) => e.code === 'LONG_WAIT')).toBe(warning);
  });
  it('wraps arrival across midnight', () =>
    expect(check({ arrival: '23:30', departure: '00:15' }).errors).toEqual([]));
  it.each(['destination', 'origin', 'via'])(
    'checks both scripts and whitespace for %s',
    (field) => {
      for (const text of [
        { si: 'Colombo', en: 'Colombo' },
        { si: 'කොළඹ A', en: 'Colombo' },
        { si: 'කොළඹ é', en: 'Colombo' },
        { si: 'කොළඹ', en: 'කොළඹ' },
        { si: 'කොළඹ', en: 'Colombo1' },
        { si: ' කොළඹ', en: 'Colombo' },
        { si: 'කොළඹ', en: 'New  Town' },
        { si: 'කොළඹ', en: 'Colombo ' },
        { si: '', en: 'Colombo' },
        { si: 'කොළඹ', en: 'x'.repeat(81) },
      ])
        expect(check({ [field]: text }).errors.length).toBeGreaterThan(0);
      expect(check({ [field]: { si: 'මහනුවර', en: "St. Mary's-Town" } }).errors).toEqual([]);
    },
  );
  it('rejects identical endpoints and the station name', () => {
    expect(
      check({ origin: service().destination }).errors.some((e) => e.code === 'SAME_PLACE'),
    ).toBe(true);
    expect(
      check({ destination: sample.station.name }).errors.some((e) => e.code === 'STATION_NAME'),
    ).toBe(true);
    expect(
      check({ origin: sample.station.name }).errors.some((e) => e.code === 'STATION_NAME'),
    ).toBe(true);
  });
  it.each([
    { operator: 'BUS' },
    { serviceType: 'AC' },
    { days: [] },
    { days: [0] },
    { days: [8] },
    { days: [1, 1] },
    { bay: 'ABCDE' },
    { bay: 'A 1' },
    { bay: '' },
  ])('rejects %j', (patch) => expect(check(patch).errors.length).toBeGreaterThan(0));
  it('allows a hyphenated bay', () => expect(check({ bay: 'A-1' }).errors).toEqual([]));
  it('rejects oversized day collections before allocating per-element errors', () => {
    expect(check({ days: Array(10000).fill('bad') }).errors).toHaveLength(1);
    expect(check({ days: Array(10000).fill('bad') }).errors[0]?.code).toBe('TOO_MANY_DAYS');
  });
  it('rejects duplicates only on overlapping days and includes the existing id', () => {
    const s = service(),
      other = { ...s, id: crypto.randomUUID(), days: [2] as BusService['days'] };
    expect(
      validateServiceStrict(s, { ...context, services: [other] }).errors[0]?.message_en,
    ).toContain(other.id);
    expect(
      validateServiceStrict({ ...s, days: [1] }, { ...context, services: [other] }).errors,
    ).toEqual([]);
    expect(validateServiceStrict(s, { ...context, services: [s] }).errors).toEqual([]);
  });
  it('warns about unknown places with a closest spelling', () => {
    expect(findClosestKnownPlace('Colmbo').en).toBe('Colombo');
    expect(
      check({ destination: { si: 'කොළඹ', en: 'Colmbo' } }).warnings.find(
        (w) => w.code === 'UNKNOWN_PLACE',
      )?.message_en,
    ).toContain('Colombo');
  });
  it('warns on overnight times and later tripStart', () => {
    const codes = check({ arrival: null, departure: '03:59', tripStart: '22:00' }).warnings.map(
      (w) => w.code,
    );
    expect(codes).toContain('OVERNIGHT');
    expect(codes).toContain('TRIP_START_AFTER');
    expect(
      check({ arrival: null, departure: '04:00' }).warnings.some((w) => w.code === 'OVERNIGHT'),
    ).toBe(false);
  });
  it('warns about similar services on other days and bay collisions', () => {
    const s = { ...service(), days: [1] as BusService['days'] };
    const other = {
      ...s,
      id: crypto.randomUUID(),
      departure: '08:34',
      days: [1, 2] as BusService['days'],
    };
    const codes = validateServiceStrict(s, { ...context, services: [other] }).warnings.map(
      (w) => w.code,
    );
    expect(codes).toContain('SIMILAR_OTHER_DAYS');
    expect(codes).toContain('BAY_COLLISION');
  });
  it('checks bay weekday rollover across Sunday midnight', () => {
    const s = { ...service(), arrival: null, departure: '23:58', days: [7] as BusService['days'] };
    const other = {
      ...s,
      id: crypto.randomUUID(),
      departure: '00:02',
      days: [1] as BusService['days'],
    };
    expect(
      validateServiceStrict(s, { ...context, services: [other] }).warnings.some(
        (w) => w.code === 'BAY_COLLISION',
      ),
    ).toBe(true);
    expect(
      validateServiceStrict(s, { ...context, services: [{ ...other, days: [7] }] }).warnings.some(
        (w) => w.code === 'BAY_COLLISION',
      ),
    ).toBe(false);
  });
});
describe('strict metadata', () => {
  const now = new Date('2026-11-11T20:00:00Z');
  const alert = {
    enabled: true,
    severity: 'INFO',
    text: { si: 'දැනුම්දීම', en: 'Notice' },
    expiresAt: '2026-11-12T20:00:00Z',
  };
  it('allows null, disabled empty text, never-expiring and 140 character alerts', () => {
    expect(validateAlertStrict(null, now)).toEqual([]);
    expect(
      validateAlertStrict(
        { ...alert, enabled: false, text: { si: '', en: '' }, expiresAt: '2020-01-01T00:00:00Z' },
        now,
      ),
    ).toEqual([]);
    expect(
      validateAlertStrict(
        { ...alert, text: { si: 'අ'.repeat(140), en: 'a'.repeat(140) }, expiresAt: null },
        now,
      ),
    ).toEqual([]);
  });
  it.each([
    { text: { si: '', en: 'Notice' } },
    { text: { si: 'දැනුම්දීම', en: ' ' } },
    { text: { si: 'අ'.repeat(141), en: 'Notice' } },
    { expiresAt: '2026-11-11T20:00:00Z' },
    { expiresAt: 'no' },
    { severity: 'BAD' },
  ])('rejects invalid alert %j', (patch) =>
    expect(validateAlertStrict({ ...alert, ...patch }, now).length).toBeGreaterThan(0),
  );
  it('uses the Colombo calendar day', () => {
    expect(colomboDate(now)).toBe('2026-11-12');
    expect(validateLastVerified('2026-11-12', now)).toEqual([]);
    for (const date of ['2026-11-13', '2026-02-30', '2025-02-29', '11-12-2026', '2026-1-1'])
      expect(validateLastVerified(date, now).length).toBeGreaterThan(0);
    expect(validateLastVerified('2024-02-29', now)).toEqual([]);
  });
});
