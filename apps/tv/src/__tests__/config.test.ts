import { expect, it } from 'vitest';
import { clampPage, departureDay, getColumns } from '../config.js';
import { qrPath } from '../qr.js';

it('preserves column order and assigns the full width with and without Bay', () => {
  expect(getColumns(false).map((column) => column.key)).toEqual([
    'destination',
    'departure',
    'arrival',
    'from',
    'service',
  ]);
  expect(getColumns(true).at(-1)).toEqual({ key: 'bay', width: 8 });
  for (const showBay of [false, true])
    expect(getColumns(showBay).reduce((sum, column) => sum + column.width, 0)).toBeCloseTo(100);
});
it('preserves a valid page index and clamps it when pages disappear', () => {
  expect(clampPage(2, 4)).toBe(2);
  expect(clampPage(2, 2)).toBe(1);
  expect(clampPage(2, 0)).toBe(0);
  expect(clampPage(-1, 4)).toBe(0);
});
it('encodes distinct short URLs and leaves oversized URLs to the text display', () => {
  const first = qrPath('https://example.invalid/');
  expect(first).toMatch(/^M0 0h1v1h-1z/);
  expect(first).not.toBe(qrPath('https://example.invalid/route'));
  expect(qrPath('https://example.invalid/' + 'a'.repeat(100))).toBeNull();
});

it('uses shared bilingual labels for future departures and omits past or same-day pills', () => {
  expect(departureDay(-1, 5)).toBeNull();
  expect(departureDay(0, 5)).toBeNull();
  expect(departureDay(1, 5)).toEqual({ si: 'හෙට', en: 'Tomorrow' });
  expect(departureDay(3, 5)).toEqual({ si: 'සඳුදා', en: 'Monday' });
});
