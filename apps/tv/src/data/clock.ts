export function clockOffset(serverTime: string | null, start: number, end: number): number | null {
  const server = serverTime === null ? NaN : Date.parse(serverTime);
  return Number.isFinite(server) && end >= start ? server - (start + end) / 2 : null;
}

export function plausibleClock(now: number, publishedAt: string): boolean {
  return new Date(now).getUTCFullYear() >= 2026 && now >= Date.parse(publishedAt) - 300_000;
}

export function clockState(now: number, offset: number | null, publishedAt: string) {
  return {
    now: now + (offset ?? 0),
    clockSynced: offset !== null,
    clockPlausible: offset !== null || plausibleClock(now, publishedAt),
  };
}
