export function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(value) && URL.parse(value)?.protocol === 'https:';
}

export function parseSeedArgs(args: string[]): { remote: boolean; mobileUrl?: string } {
  if (args[0] === '--local' && args.length > 1)
    throw new Error('Seed is local-only and accepts no flags.');
  if (args.length === 0 || args[0] === '--local') return { remote: false };
  if (args[0] !== '--remote') throw new Error('Remote seeding requires --remote.');
  if (args.length === 1) return { remote: true };
  const mobileUrl = args[2];
  if (args.length !== 3 || args[1] !== '--mobile-url' || mobileUrl === undefined)
    throw new Error('Usage: --remote [--mobile-url <https URL>]');
  if (!isHttpsUrl(mobileUrl)) throw new Error('--mobile-url must be a valid HTTPS URL.');
  return { remote: true, mobileUrl };
}

export function assertEmptySnapshots(count: unknown): void {
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
    throw new Error('Could not verify the remote snapshot count. No changes made.');
  if (count > 0)
    throw new Error(`Remote database already has ${count} snapshot(s). No changes made.`);
}

export function verifySnapshotResult(result: unknown): void {
  if (!Array.isArray(result) || result.length !== 1)
    throw new Error('Unexpected Wrangler result. No changes made.');
  const [query] = result as { success?: boolean; results?: { n?: unknown }[] }[];
  if (query?.success !== true || !Array.isArray(query.results) || query.results.length !== 1)
    throw new Error('Remote snapshot count query did not succeed. No changes made.');
  assertEmptySnapshots(query.results[0]?.n);
}
