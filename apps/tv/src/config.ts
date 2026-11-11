import { dayLabel, LABELS, type Weekday } from '@bus-schedule/shared';

export const SHOW_BAY_COLUMN = false;
export const CREDITS = { si: 'නිර්මාණය: <team name>', en: 'Built by <team name>' };

export const COLUMNS = [
  { key: 'destination', width: 30 },
  { key: 'departure', width: 17 },
  { key: 'arrival', width: 15 },
  { key: 'from', width: 20 },
  { key: 'service', width: 18 },
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
