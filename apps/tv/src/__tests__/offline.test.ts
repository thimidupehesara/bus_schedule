import { afterEach, expect, it, vi } from 'vitest';
import sample from '../../../../packages/shared/src/sample-schedule.json' with { type: 'json' };
import { getSaved, setSaved } from '../data/cache.js';
import { clockOffset, clockState, plausibleClock } from '../data/clock.js';
import { pollDelay, showOfflineNotice, showStaleWarning } from '../data/freshness.js';
import { mayReload } from '../data/reload.js';
import { decodeSchedule, fetchSchedule } from '../data/scheduleFetch.js';

const now = Date.parse('2026-11-13T12:00:00Z');
const raw = JSON.stringify({ ...sample, version: 2 });
const current = {
  doc: decodeSchedule(raw),
  saved: { schedule: raw, etag: '"v2"', savedAt: now, serverTimeAtSave: now },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('uses midpoint offset, rejects implausible device dates, and trusts a session sync', () => {
  expect(clockOffset(new Date(now + 5000).toUTCString(), now, now + 2000)).toBe(4000);
  expect(clockOffset('invalid', now, now)).toBeNull();
  const publishedAt = new Date(now).toISOString();
  expect(plausibleClock(Date.UTC(1970, 0, 1), publishedAt)).toBe(false);
  expect(plausibleClock(now - 300_001, publishedAt)).toBe(false);
  expect(plausibleClock(now - 300_000, publishedAt)).toBe(true);
  expect(clockState(now, null, publishedAt).clockSynced).toBe(false);
  expect(clockState(0, now, publishedAt)).toEqual({ now, clockSynced: true, clockPlausible: true });
});

it('tests notice, stale warning, reload guard and bounded backoff', () => {
  expect(showOfflineNotice(null)).toBe(true);
  expect(showOfflineNotice(30 * 60_000)).toBe(false);
  expect(showOfflineNotice(30 * 60_000 + 1)).toBe(true);
  const publishedAt = new Date(now - 73 * 3_600_000).toISOString();
  expect(showStaleWarning(true, now, publishedAt)).toBe(true);
  expect(showStaleWarning(false, now, publishedAt)).toBe(false);
  expect(showStaleWarning(true, now, new Date(now).toISOString())).toBe(false);
  expect(mayReload(null, now)).toBe(true);
  expect(mayReload(now, now - 60_000)).toBe(false);
  expect(mayReload(now, now + 600_000)).toBe(true);
  expect(pollDelay(180, 0, 0.5)).toBe(185_000);
  expect(pollDelay(180, 1, 0)).toBe(360_000);
  expect(pollDelay(180, 3, 1)).toBe(600_000);
});

it('revalidates with the saved ETag and preserves the document on 304', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 304 }));
  const result = await fetchSchedule(current, new AbortController(), request);
  expect(request).toHaveBeenCalledWith(
    '/schedule.json',
    expect.objectContaining({ cache: 'no-store' }),
  );
  expect(new Headers(request.mock.calls[0]?.[1]?.headers).get('If-None-Match')).toBe('"v2"');
  expect(result.copy?.doc).toBe(current.doc);
  expect(result.ok).toBe(true);
});

it('replaces the saved body and ETag only on a valid current or newer 200', async () => {
  const body = JSON.stringify({ ...sample, version: 3 });
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(body, {
        headers: { ETag: '"v3"', 'X-Server-Time': new Date(now).toISOString() },
      }),
    );
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const result = await fetchSchedule(current, new AbortController(), request);
  expect(result).toMatchObject({
    ok: true,
    offset: 0,
    copy: { doc: { version: 3 }, saved: { schedule: body, etag: '"v3"' } },
  });
});

it.each([
  [200, '{invalid'],
  [200, '{}'],
  [200, JSON.stringify({ ...sample, version: 1 })],
  [503, ''],
])('keeps the saved copy on a rejected response (%s)', async (status, body) => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));
  const result = await fetchSchedule(current, new AbortController(), request);
  expect(result.ok).toBe(false);
  expect(result.copy).toBe(current);
});

it('keeps the saved copy when a request times out', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  const result = fetchSchedule(current, new AbortController(), request);
  await vi.advanceTimersByTimeAsync(8000);
  expect(await result).toEqual({ ok: false, copy: current });
});

it('writes the four keys in IndexedDB and falls back to localStorage on failure', async () => {
  const values = new Map<string, unknown>();
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
  });
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = {
        onsuccess: () => {},
        result: {
          close: () => {},
          transaction: () => {
            const tx = {
              oncomplete: () => {},
              objectStore: () => ({
                get: (key: string) => ({ result: values.get(key) }),
                put: (value: unknown, key: string) => values.set(key, value),
              }),
            };
            queueMicrotask(() => tx.oncomplete());
            return tx;
          },
        },
      };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  });
  await setSaved(current.saved);
  expect([...values.keys()]).toEqual(['schedule', 'etag', 'savedAt', 'serverTimeAtSave']);
  expect(await getSaved()).toEqual([current.saved]);
  vi.stubGlobal('indexedDB', {
    open: () => {
      throw new Error('disabled');
    },
  });
  await setSaved(current.saved);
  expect(await getSaved()).toEqual([current.saved]);
});
