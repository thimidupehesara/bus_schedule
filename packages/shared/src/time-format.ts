import type { TimeHHmm, Weekday } from './schema.js';

export type TimeStyle = 'EN' | 'SI';
export interface Time12 {
  hour: number;
  minute: string;
  meridiem: 'AM' | 'PM';
}
export const SI_AM = 'පෙ.ව.';
export const SI_PM = 'ප.ව.';
export const SI_TIME_SUFFIX_AFTER_NUMBER = true;

export function to12h(hhmm: TimeHHmm): Time12 {
  const hour = Number(hhmm.slice(0, 2));
  return { hour: hour % 12 || 12, minute: hhmm.slice(3), meridiem: hour < 12 ? 'AM' : 'PM' };
}

export function formatTime12(hhmm: TimeHHmm, style: TimeStyle): string {
  const { hour, minute, meridiem } = to12h(hhmm);
  const time = `${hour}:${minute}`;
  if (style === 'EN') return `${time} ${meridiem}`;
  const suffix = meridiem === 'AM' ? SI_AM : SI_PM;
  return SI_TIME_SUFFIX_AFTER_NUMBER ? `${time} ${suffix}` : `${suffix} ${time}`;
}

export function to24h(hour12: number, minute: number, meridiem: 'AM' | 'PM'): TimeHHmm {
  if (
    !Number.isInteger(hour12) ||
    hour12 < 1 ||
    hour12 > 12 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    (meridiem !== 'AM' && meridiem !== 'PM')
  ) {
    throw new RangeError('Invalid 12-hour time');
  }
  const hour = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Owner must review spelling.
const WEEKDAYS = [
  { en: 'Monday', si: 'සඳුදා' },
  { en: 'Tuesday', si: 'අඟහරුවාදා' },
  { en: 'Wednesday', si: 'බදාදා' },
  { en: 'Thursday', si: 'බ්‍රහස්පතින්දා' },
  { en: 'Friday', si: 'සිකුරාදා' },
  { en: 'Saturday', si: 'සෙනසුරාදා' },
  { en: 'Sunday', si: 'ඉරිදා' },
];

/** Pass the current Colombo weekday to resolve future offsets to weekday names. */
export function dayLabel(
  dayOffset: number,
  todayWeekday?: Weekday,
): { en: string; si: string } | null {
  if (!Number.isSafeInteger(dayOffset) || dayOffset < -1 || dayOffset === 0) return null;
  if (dayOffset === -1) return { en: 'Yesterday', si: 'ඊයේ' };
  if (dayOffset === 1) return { en: 'Tomorrow', si: 'හෙට' };
  if (todayWeekday === undefined)
    return { en: `In ${dayOffset} days`, si: `දින ${dayOffset} කින්` };
  const label = WEEKDAYS[(todayWeekday - 1 + (dayOffset % 7)) % 7]!;
  return { ...label };
}
