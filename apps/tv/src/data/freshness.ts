import { STALE_NOTICE_MINUTES, STALE_WARNING_HOURS } from '../config.js';

export function showOfflineNotice(ageMs: number | null): boolean {
  return ageMs === null || ageMs > STALE_NOTICE_MINUTES * 60_000;
}

export function showStaleWarning(offline: boolean, now: number, publishedAt: string): boolean {
  return offline && now - Date.parse(publishedAt) > STALE_WARNING_HOURS * 3_600_000;
}

export function pollDelay(seconds: number, failures: number, jitter: number): number {
  const delay = seconds * 1000 * 2 ** Math.min(failures, 10) + jitter * 10_000;
  return failures ? Math.min(delay, 600_000) : delay;
}
