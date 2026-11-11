import type { BusService, ScheduleDocument, Weekday } from './schema.js';

export type BoardStatus = 'DEPARTED' | 'SOON' | 'UPCOMING';
export interface BoardRow {
  service: BusService;
  departureAt: number;
  dayOffset: -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  status: BoardStatus;
  minutesUntil: number;
}
export interface BoardPage {
  pageIndex: number;
  pageCount: number;
  rows: BoardRow[];
}
export interface BoardResult {
  mode: 'NORMAL' | 'CLOCK_UNSYNCED' | 'NO_SERVICES';
  pages: BoardPage[];
  usedFallbackWindow: boolean;
  totalRows: number;
}

export const MAX_DEPARTED_ROWS = 2;

const MINUTE = 60_000;
const DAY = 1440 * MINUTE;
const COLOMBO_OFFSET = 330 * MINUTE;
const DAY_OFFSETS = [-1, 0, 1, 2, 3, 4, 5, 6, 7] as const;
const isoWeekday = (date: Date): Weekday => (date.getUTCDay() || 7) as Weekday;
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const compareServices = (a: BusService, b: BusService): number =>
  compare(a.destination.en, b.destination.en) || compare(a.id, b.id);

export function colomboParts(epochMs: number): { date: string; weekday: Weekday; minutes: number } {
  const shifted = new Date(epochMs + COLOMBO_OFFSET);
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: isoWeekday(shifted),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function paginate(
  rows: BoardRow[],
  size: number,
  mode: BoardResult['mode'],
  usedFallbackWindow: boolean,
): BoardResult {
  const pageCount = Math.ceil(rows.length / size);
  const pages = Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageIndex,
    pageCount,
    rows: rows.slice(pageIndex * size, (pageIndex + 1) * size),
  }));
  return { mode, pages, usedFallbackWindow, totalRows: rows.length };
}

export function buildBoard(
  doc: ScheduleDocument,
  nowMs: number,
  opts?: { clockSynced?: boolean; maxDepartedRows?: number },
): BoardResult {
  const { rowsPerPage, departedGraceMinutes, soonThresholdMinutes, lookaheadHours } = doc.display;
  const services = doc.services.filter((service) => service.active);
  if (opts?.clockSynced === false) {
    const rows = services
      .sort((a, b) => compare(a.departure, b.departure) || compareServices(a, b))
      .map<BoardRow>((service) => ({
        service,
        departureAt: 0,
        dayOffset: 0,
        status: 'UPCOMING',
        minutesUntil: 0,
      }));
    return paginate(rows, rowsPerPage, 'CLOCK_UNSYNCED', false);
  }

  const midnight = Math.floor((nowMs + COLOMBO_OFFSET) / DAY) * DAY;
  const first = nowMs - departedGraceMinutes * MINUTE;
  const last = nowMs + lookaheadHours * 60 * MINUTE;
  const dates = DAY_OFFSETS.map((dayOffset) => {
    const shiftedMidnight = midnight + dayOffset * DAY;
    return {
      dayOffset,
      weekday: isoWeekday(new Date(shiftedMidnight)),
      start: shiftedMidnight - COLOMBO_OFFSET,
    };
  });
  const rows: BoardRow[] = [];
  const fallback: BoardRow[] = [];
  for (const service of services) {
    const departureMinutes =
      Number(service.departure.slice(0, 2)) * 60 + Number(service.departure.slice(3));
    let foundNormal = false;
    for (const { dayOffset, weekday, start } of dates) {
      if (!service.days.includes(weekday)) continue;
      const departureAt = start + departureMinutes * MINUTE;
      if (departureAt < first) continue;
      if (departureAt > nowMs + 7 * DAY) break;
      const minutesUntil = (departureAt - nowMs) / MINUTE;
      const status =
        minutesUntil < 0 ? 'DEPARTED' : minutesUntil <= soonThresholdMinutes ? 'SOON' : 'UPCOMING';
      const row: BoardRow = { service, departureAt, dayOffset, minutesUntil, status };
      if (!foundNormal && departureAt <= last) {
        rows.push(row);
        foundNormal = true;
      }
      if (status !== 'DEPARTED') {
        fallback.push(row);
        break;
      }
    }
  }

  const order = (a: BoardRow, b: BoardRow) =>
    a.departureAt - b.departureAt || compareServices(a.service, b.service);
  const requestedCap = opts?.maxDepartedRows ?? MAX_DEPARTED_ROWS;
  const cap = Number.isNaN(requestedCap)
    ? MAX_DEPARTED_ROWS
    : Math.max(0, Math.floor(requestedCap));
  const departed = rows
    .filter((row) => row.status === 'DEPARTED')
    .sort((a, b) => b.departureAt - a.departureAt || compareServices(a.service, b.service))
    .slice(0, cap);
  const visible = [...departed, ...rows.filter((row) => row.status !== 'DEPARTED')];
  if (visible.length) return paginate(visible.sort(order), rowsPerPage, 'NORMAL', false);
  const next = fallback.sort(order).slice(0, rowsPerPage * 2);
  return paginate(next, rowsPerPage, next.length ? 'NORMAL' : 'NO_SERVICES', true);
}
