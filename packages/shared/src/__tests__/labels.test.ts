import { expect, it } from 'vitest';
import { meridiemBilingual, serviceLabel } from '../labels.js';

it.each([
  ['00:30', { clock: '12:30', en: 'AM', si: 'පෙ.ව.' }],
  ['13:05', { clock: '1:05', en: 'PM', si: 'ප.ව.' }],
])('pairs both meridiem labels for %s', (time, expected) => {
  expect(meridiemBilingual(time)).toEqual(expected);
});

it('keeps the operator code alongside the translated service type', () => {
  expect(serviceLabel('CTB', 'EXPRESS')).toEqual({
    operator: 'CTB',
    type: { si: 'අධිවේගී', en: 'Express' },
  });
});
