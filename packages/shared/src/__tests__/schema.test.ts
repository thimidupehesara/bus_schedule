import { describe, it, expect } from 'vitest';
import { validateScheduleDocument, DEFAULT_DISPLAY_SETTINGS } from '../schema.js';
import sampleSchedule from '../sample-schedule.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('validateScheduleDocument — valid inputs', () => {
  it('passes the sample-schedule.json without errors', () => {
    const result = validateScheduleDocument(sampleSchedule);
    expect(result.ok).toBe(true);
  });

  it('accepts a midnight-crossing time like "00:30"', () => {
    const doc = structuredClone(sampleSchedule);
    // departure of service 0 is already "01:00"; set it to "00:30"
    (doc as Record<string, unknown>)['services'] = (sampleSchedule.services as unknown[]).map(
      (s, i) => (i === 0 ? { ...(s as object), departure: '00:30' } : s),
    );
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(true);
  });

  it('exports DEFAULT_DISPLAY_SETTINGS with correct values', () => {
    expect(DEFAULT_DISPLAY_SETTINGS.rowsPerPage).toBe(5);
    expect(DEFAULT_DISPLAY_SETTINGS.dwellSeconds).toBe(10);
    expect(DEFAULT_DISPLAY_SETTINGS.departedGraceMinutes).toBe(15);
    expect(DEFAULT_DISPLAY_SETTINGS.reloadAtLocalTime).toBe('02:30');
  });
});

// ---------------------------------------------------------------------------
// Failure cases
// ---------------------------------------------------------------------------

describe('validateScheduleDocument — invalid inputs', () => {
  it('rejects time "24:10" (hour out of range)', () => {
    const doc = structuredClone(sampleSchedule);
    (doc.services[0] as Record<string, unknown>)['departure'] = '24:10';
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('departure'))).toBe(true);
    }
  });

  it('rejects duplicate service ids', () => {
    const doc = structuredClone(sampleSchedule);
    // Make service[1] have the same id as service[0]
    (doc.services[1] as Record<string, unknown>)['id'] = doc.services[0]!.id;
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
    }
  });

  it('rejects rowsPerPage = 9 (exceeds max of 6)', () => {
    const doc = structuredClone(sampleSchedule);
    (doc.display as Record<string, unknown>)['rowsPerPage'] = 9;
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('rowsPerPage'))).toBe(true);
    }
  });

  it('rejects a non-https mobileUrl', () => {
    const doc = structuredClone(sampleSchedule);
    (doc.station as Record<string, unknown>)['mobileUrl'] = 'http://mahiyanganaya.bustand.lk';
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('mobileUrl'))).toBe(true);
    }
  });

  it('rejects 301 services (exceeds max of 300)', () => {
    const baseService = sampleSchedule.services[0]!;
    const extraServices = Array.from({ length: 301 }, (_, i) => ({
      ...baseService,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    }));
    const doc = {
      ...sampleSchedule,
      services: extraServices,
    };
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('services'))).toBe(true);
    }
  });

  it('rejects time "25:00" (hour out of range)', () => {
    const doc = structuredClone(sampleSchedule);
    (doc.services[0] as Record<string, unknown>)['departure'] = '25:00';
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
  });

  it('rejects time "9:00" (missing leading zero)', () => {
    const doc = structuredClone(sampleSchedule);
    (doc.services[0] as Record<string, unknown>)['departure'] = '9:00';
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
  });

  it('error messages include field path like services[N].field', () => {
    const doc = structuredClone(sampleSchedule);
    (doc.services[2] as Record<string, unknown>)['departure'] = '99:99';
    const result = validateScheduleDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /services\[2\]\.departure/.test(e))).toBe(true);
    }
  });
});

it.each([0, 15, 60, 61])('validates a departed grace of %i minutes', (departedGraceMinutes) => {
  const result = validateScheduleDocument({
    ...sampleSchedule,
    display: { ...sampleSchedule.display, departedGraceMinutes },
  });
  expect(result.ok).toBe(departedGraceMinutes <= 60);
});
