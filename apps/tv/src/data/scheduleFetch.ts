import { validateScheduleDocument, type ScheduleDocument } from '@bus-schedule/shared';
import { DEFAULT_SAFE_AREA_PERCENT } from '../config.js';
import type { Saved } from './cache.js';
import { clockOffset } from './clock.js';

export function decodeSchedule(body: string): ScheduleDocument {
  const raw: unknown = JSON.parse(body);
  const display = raw && typeof raw === 'object' && 'display' in raw ? raw.display : null;
  const candidate =
    raw &&
    typeof raw === 'object' &&
    display &&
    typeof display === 'object' &&
    !Array.isArray(display) &&
    (!('safeAreaPercent' in display) || display.safeAreaPercent == null)
      ? { ...raw, display: { ...display, safeAreaPercent: DEFAULT_SAFE_AREA_PERCENT } }
      : raw;
  const result = validateScheduleDocument(candidate);
  if (!result.ok) throw new Error('Invalid timetable');
  return result.data;
}

export type Copy = { doc: ScheduleDocument; saved: Saved };
export type FetchResult =
  { ok: false; copy: Copy | null } | { ok: true; copy: Copy; offset: number | null };

export async function fetchSchedule(
  current: Copy | null,
  controller: AbortController,
  request = fetch,
): Promise<FetchResult> {
  const start = Date.now();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = new Headers();
    if (current?.saved.etag) headers.set('If-None-Match', current.saved.etag);
    const response = await request('/schedule.json', {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    const end = Date.now();
    const offset =
      clockOffset(response.headers.get('Date'), start, end) ??
      clockOffset(response.headers.get('X-Server-Time'), start, end);
    const savedAt = end;
    const serverTimeAtSave = offset === null ? null : end + offset;
    if (response.status === 304 && current) {
      return {
        ok: true,
        copy: { ...current, saved: { ...current.saved, savedAt, serverTimeAtSave } },
        offset,
      };
    }
    if (response.status !== 200) return { ok: false, copy: current };
    const schedule = await response.text();
    const doc = decodeSchedule(schedule);
    if (current && doc.version < current.doc.version) return { ok: false, copy: current };
    return {
      ok: true,
      copy: {
        doc,
        saved: { schedule, etag: response.headers.get('ETag'), savedAt, serverTimeAtSave },
      },
      offset,
    };
  } catch {
    return { ok: false, copy: current };
  } finally {
    clearTimeout(timeout);
  }
}
