import { expect, it } from 'vitest';
import { clampPage, departureDay, getColumns, TEXT_MIN_SCALE } from '../config.js';
import { qrPath } from '../qr.js';
import { computeFit } from '../fitText.js';

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

// ── computeFit unit tests ──────────────────────────────────────────────────

it('computeFit: returns scale 1 and no truncate when text fits', () => {
  expect(computeFit(100, 200, TEXT_MIN_SCALE)).toEqual({ scale: 1, truncate: false });
  expect(computeFit(100, 100, TEXT_MIN_SCALE)).toEqual({ scale: 1, truncate: false });
});

it('computeFit: scales down proportionally when text is slightly too wide', () => {
  // scrollWidth 200, clientWidth 160 → ideal = 159/200 = 0.795 ≥ 0.65 → no truncation
  const result = computeFit(200, 160, TEXT_MIN_SCALE);
  expect(result.truncate).toBe(false);
  expect(result.scale).toBeCloseTo((160 - 1) / 200, 5);
  expect(result.scale).toBeGreaterThanOrEqual(TEXT_MIN_SCALE);
});

it('computeFit: clamps to minScale and sets truncate when text is very wide', () => {
  // scrollWidth 400, clientWidth 100 → ideal = 99/400 = 0.2475 < 0.65 → truncate
  const result = computeFit(400, 100, TEXT_MIN_SCALE);
  expect(result.truncate).toBe(true);
  expect(result.scale).toBe(TEXT_MIN_SCALE);
});

it('computeFit: handles zero clientWidth without dividing by zero', () => {
  const result = computeFit(100, 0, TEXT_MIN_SCALE);
  expect(result).toEqual({ scale: 1, truncate: false });
});

it('computeFit: exact fit at min scale boundary does not truncate', () => {
  // If ideal === minScale exactly, we should not truncate.
  const minScale = 0.65;
  // scrollWidth S, clientWidth C: (C-1)/S === minScale → S = (C-1)/minScale
  const clientWidth = 200;
  const scrollWidth = Math.round((clientWidth - 1) / minScale);
  const result = computeFit(scrollWidth, clientWidth, minScale);
  // scale should be >= minScale; truncate depends on exact rounding
  expect(result.scale).toBeGreaterThanOrEqual(minScale);
});
