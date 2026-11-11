import { expect, it } from 'vitest';
import { dayLabel, formatTime12, to12h, to24h } from '../time-format.js';

it.each([
  ['00:00', '12:00 AM', '12:00 පෙ.ව.'],
  ['00:30', '12:30 AM', '12:30 පෙ.ව.'],
  ['11:59', '11:59 AM', '11:59 පෙ.ව.'],
  ['12:00', '12:00 PM', '12:00 ප.ව.'],
  ['12:30', '12:30 PM', '12:30 ප.ව.'],
  ['13:00', '1:00 PM', '1:00 ප.ව.'],
  ['23:59', '11:59 PM', '11:59 ප.ව.'],
])('formats %s in both languages', (time, en, si) => {
  expect(formatTime12(time, 'EN')).toBe(en);
  expect(formatTime12(time, 'SI')).toBe(si);
});

it('round trips every minute', () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const input = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const value = to12h(input);
      expect(to24h(value.hour, Number(value.minute), value.meridiem)).toBe(input);
    }
  }
});

it('rejects out-of-range and fractional picker values', () => {
  for (const hour of [0, 13, 1.5, NaN]) expect(() => to24h(hour, 0, 'AM')).toThrow(RangeError);
  for (const minute of [-1, 60, 0.5, Infinity])
    expect(() => to24h(1, minute, 'PM')).toThrow(RangeError);
});

it('labels relative days and uses the reference weekday for longer offsets', () => {
  expect(dayLabel(0)).toBeNull();
  expect(dayLabel(-1)).toEqual({ en: 'Yesterday', si: 'ඊයේ' });
  expect(dayLabel(1)).toEqual({ en: 'Tomorrow', si: 'හෙට' });
  expect(dayLabel(2, 6)).toEqual({ en: 'Monday', si: 'සඳුදා' });
  expect(dayLabel(7, 4)).toEqual({ en: 'Thursday', si: 'බ්‍රහස්පතින්දා' });
  expect(dayLabel(2)).toMatchObject({ en: 'In 2 days' });
});
