import { describe, it, expect, vi } from 'vitest';
import { parseDaysField, ALL_DAYS, WEEKDAYS_LIST, WEEKENDS_LIST, detectColumns, parseSpreadsheet, parseService } from '../import-timetable.js';
import { safeJson, normalizeDayNum } from '../App.js';

describe('CSV / Excel Days Column Parsing', () => {
  it('maps "Every day" to all 7 days', () => {
    expect(parseDaysField('Every day')).toEqual(ALL_DAYS);
    expect(parseDaysField('every day')).toEqual(ALL_DAYS);
  });

  it('maps "Daily" to all 7 days', () => {
    expect(parseDaysField('Daily')).toEqual(ALL_DAYS);
    expect(parseDaysField('daily')).toEqual(ALL_DAYS);
  });

  it('maps "All" and "All days" to all 7 days', () => {
    expect(parseDaysField('All')).toEqual(ALL_DAYS);
    expect(parseDaysField('all')).toEqual(ALL_DAYS);
    expect(parseDaysField('All days')).toEqual(ALL_DAYS);
  });

  it('maps "සෑම දිනකම" to all 7 days', () => {
    expect(parseDaysField('සෑම දිනකම')).toEqual(ALL_DAYS);
  });

  it('maps blank, null, or unmapped value to all 7 days', () => {
    expect(parseDaysField('')).toEqual(ALL_DAYS);
    expect(parseDaysField('   ')).toEqual(ALL_DAYS);
    expect(parseDaysField(undefined)).toEqual(ALL_DAYS);
    expect(parseDaysField(null)).toEqual(ALL_DAYS);
  });

  it('maps empty array [] to all 7 days (never empty, preventing TV no buses scheduled error)', () => {
    expect(parseDaysField([])).toEqual(ALL_DAYS);
  });

  it('normalizes "Weekdays" to Monday through Friday', () => {
    expect(parseDaysField('Weekdays')).toEqual(WEEKDAYS_LIST);
    expect(parseDaysField('weekday')).toEqual(WEEKDAYS_LIST);
    expect(parseDaysField('සතියේ දින')).toEqual(WEEKDAYS_LIST);
  });

  it('normalizes "Weekends" to Saturday and Sunday', () => {
    expect(parseDaysField('Weekends')).toEqual(WEEKENDS_LIST);
    expect(parseDaysField('weekend')).toEqual(WEEKENDS_LIST);
    expect(parseDaysField('සති අන්ත')).toEqual(WEEKENDS_LIST);
  });

  it('converts numeric arrays [1, 2, 3] to weekday codes', () => {
    expect(parseDaysField([1, 2, 3])).toEqual(['MON', 'TUE', 'WED']);
  });
});

describe('Active Column & Default Status Parsing', () => {
  it('detects Active column from CSV/Excel headers', () => {
    const headers = ['Destination (Sinhala)', 'Destination (English)', 'Departure Time', 'Arrival Time', 'From (Sinhala)', 'From (English)', 'Operator', 'Service Type', 'Days', 'Active'];
    const mapping = detectColumns(headers);
    expect(mapping.active).toBe(9);
    expect(mapping.destSi).toBe(0);
    expect(mapping.destEn).toBe(1);
    expect(mapping.dep).toBe(2);
    expect(mapping.days).toBe(8);
  });

  it('parses imported spreadsheet rows with Active="True" as active: true', () => {
    const headers = ['Destination (Sinhala)', 'Destination (English)', 'Departure Time', 'Arrival Time', 'From (Sinhala)', 'From (English)', 'Operator', 'Service Type', 'Days', 'Active'];
    const mapping = detectColumns(headers);
    const rows = [
      ['කොළඹ', 'Colombo', '06:00', '10:00', 'මහියංගනය', 'Mahiyanganaya', 'SLTB', 'NORMAL', 'Every day', 'True'],
      ['මහනුවර', 'Kandy', '07:30', '', 'මහියංගනය', 'Mahiyanganaya', 'PRIVATE', 'NORMAL', 'Every day', 'False'],
      ['බදුල්ල', 'Badulla', '08:00', '', 'මහියංගනය', 'Mahiyanganaya', 'PRIVATE', 'NORMAL', 'Every day', ''],
    ];
    const services = parseSpreadsheet(rows, mapping);
    expect(services).toHaveLength(3);
    expect(services[0]!.active).toBe(true);
    expect(services[0]!.days).toEqual(ALL_DAYS);
    expect(services[1]!.active).toBe(false);
    expect(services[2]!.active).toBe(true); // Empty active defaults to true!
  });

  it('defaults active to true when active column is not present in file', () => {
    const headers = ['Destination (English)', 'Departure time'];
    const mapping = detectColumns(headers);
    const rows = [
      ['Colombo', '06:00'],
      ['Kandy', '07:30'],
    ];
    const services = parseSpreadsheet(rows, mapping);
    expect(services[0]!.active).toBe(true);
    expect(services[1]!.active).toBe(true);
  });
});

describe('normalizeDayNum', () => {
  it('converts codes and numbers to 1..7', () => {
    expect(normalizeDayNum('MON')).toBe(1);
    expect(normalizeDayNum('SUN')).toBe(7);
    expect(normalizeDayNum(1)).toBe(1);
    expect(normalizeDayNum(7)).toBe(7);
    expect(normalizeDayNum('invalid')).toBe(0);
  });
});

describe('safeJson helper', () => {
  it('parses valid JSON response cleanly', async () => {
    const res = new Response(JSON.stringify({ ok: true, version: 10 }), {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await safeJson<{ ok: boolean; version: number }>(res);
    expect(data.ok).toBe(true);
    expect(data.version).toBe(10);
  });

  it('rejects HTML responses and triggers session-expired event without throwing SyntaxError', async () => {
    const dispatchMock = vi.fn();
    (globalThis as any).window = { dispatchEvent: dispatchMock };

    const htmlRes = new Response('<!DOCTYPE html><html><body>Login</body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });

    await expect(safeJson(htmlRes)).rejects.toThrow(/session expired|HTML/i);
    expect(dispatchMock).toHaveBeenCalled();
    delete (globalThis as any).window;
  });
});

describe('Via Route Column Parsing', () => {
  it('detects Via column from various header aliases', () => {
    expect(detectColumns(['Destination (English)', 'Departure time', 'Via']).via).toBe(2);
    expect(detectColumns(['Destination (English)', 'Departure time', 'Via Route']).via).toBe(2);
    expect(detectColumns(['Destination (English)', 'Departure time', 'හරහා']).via).toBe(2);
    expect(detectColumns(['Destination (English)', 'Departure time', 'මාර්ගය']).via).toBe(2);
  });

  it('parses imported spreadsheet rows with Via route', () => {
    const headers = ['Destination (English)', 'Departure time', 'Via'];
    const mapping = detectColumns(headers);
    const rows = [
      ['Colombo', '06:00', 'Kaduruwela'],
      ['Kandy', '07:30', ''],
      ['Trincomalee', '08:00', 'Polonnaruwa'],
    ];
    const services = parseSpreadsheet(rows, mapping);
    expect(services).toHaveLength(3);
    expect(services[0]!.via).toBe('Kaduruwela');
    expect(services[1]!.via).toBeNull();
    expect(services[2]!.via).toEqual({ si: 'පොළොන්නරුව', en: 'Polonnaruwa' });
  });

  it('defaults via to null when via column is absent', () => {
    const headers = ['Destination (English)', 'Departure time'];
    const mapping = detectColumns(headers);
    const rows = [['Colombo', '06:00']];
    const services = parseSpreadsheet(rows, mapping);
    expect(services[0]!.via).toBeNull();
  });
});

it.each([undefined, 'Every day'])('defaults spreadsheet Days=%s and absent Active to all active weekdays', (days) => {
  const headers = ['Destination (English)', 'Departure time', ...(days ? ['Days'] : [])];
  const row = ['Colombo', '06:00', ...(days ? [days] : [])];
  const [service] = parseSpreadsheet([row], detectColumns(headers));
  expect(service?.active).toBe(true);
  expect(service?.days).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
});
