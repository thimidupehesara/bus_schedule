import { type BoardRow } from '@bus-schedule/shared';
export const TV_ROWS_PER_PAGE = 4;
export const TV_DWELL_SECONDS = 10;
export function paginateRows(rows: BoardRow[]): BoardRow[][] {
  const pages: BoardRow[][] = [];
  for (let index = 0; index < rows.length; index += TV_ROWS_PER_PAGE) pages.push(rows.slice(index, index + TV_ROWS_PER_PAGE));
  return pages;
}
