import { dayLabel, LABELS, type Weekday } from '@bus-schedule/shared';

export const SHOW_BAY_COLUMN = false;
export const SHOW_LAST_VERIFIED = false;
export const CREDITS_NAME: string = '';
export const SHOW_VIA = false;
export const STALE_NOTICE_MINUTES = 30;
export const STALE_WARNING_HOURS = 72;

export const DEFAULT_SAFE_AREA_PERCENT = 2;
export const WEEKDAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const TEXT_MIN_SCALE = 0.7;
export const TV_TYPE = {
  '--type-floor': '2.407407vh',
  '--title-size': '4.1vh',
  '--clock-size': '6.11vh',
  '--date-size': '3.37vh',
  '--row-padding': '0.04',
  '--row-divider': '1px',
  '--time-scale': '0.55',
  '--time-width-cap': '5.25vw',
  '--header-row-min': '6.4vh',
  '--destination-si-scale': '0.39',
  '--destination-en-scale': '0.25',
  '--from-scale': '0.30',
  '--support-scale': '0.19',
} as const;
export const CREDITS_PREFIX = 'නිර්මාණය:';

// Owner must review these additional Sinhala strings.
export const COPY = {
  loading: { si: 'කාලසටහන පූරණය වෙමින් පවතී', en: 'Loading timetable' },
  empty: { si: 'නියමිත බස් ගමන් නොමැත', en: 'No buses scheduled' },
  fallback: { si: 'ඊළඟ පිටත්වීම් පෙන්වයි', en: 'Showing next departures' },
  qr: { si: 'දුරකථනයෙන් කාලසටහන බලන්න', en: 'Scan to view the timetable on your phone' },
};

export const COLUMNS = [
  { key: 'destination', width: 26 },
  { key: 'departure', width: 19 },
  { key: 'arrival', width: 19 },
  { key: 'from', width: 19 },
  { key: 'service', width: 17 },
] as const;

export function getColumns(showBay = SHOW_BAY_COLUMN) {
  const scale = showBay ? 0.92 : 1;
  const columns = COLUMNS.map(({ key, width }) => ({ key, width: width * scale }));
  return showBay ? [...columns, { key: 'bay' as const, width: 8 }] : columns;
}

export function clampPage(index: number, pageCount: number): number {
  return Math.max(0, Math.min(index, pageCount - 1));
}

export function departureDay(dayOffset: number, weekday: Weekday) {
  if (dayOffset < 1) return null;
  return dayOffset === 1 ? LABELS.tomorrow : dayLabel(dayOffset, weekday);
}
