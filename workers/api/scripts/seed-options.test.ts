import { expect, it } from 'vitest';
import {
  assertEmptySnapshots,
  isHttpsUrl,
  parseSeedArgs,
  verifySnapshotResult,
} from './seed-options.js';

it('requires explicit remote mode and keeps the local npm command local', () => {
  expect(parseSeedArgs([])).toEqual({ remote: false });
  expect(parseSeedArgs(['--remote'])).toEqual({ remote: true });
  expect(parseSeedArgs(['--remote', '--mobile-url', 'https://example.test/'])).toEqual({
    remote: true,
    mobileUrl: 'https://example.test/',
  });
  expect(() => parseSeedArgs(['--mobile-url', 'https://example.test/'])).toThrow(
    /requires --remote/,
  );
  expect(() => parseSeedArgs(['--local', '--remote'])).toThrow(/local-only/);
  expect(() => parseSeedArgs(['--remote', '--mobile-url'])).toThrow(/Usage/);
  expect(() => parseSeedArgs(['--remote', '--mobile-url', 'http://example.test/'])).toThrow(
    /HTTPS/,
  );
});

it('accepts only absolute HTTPS URLs', () => {
  expect(isHttpsUrl('https://example.test/path')).toBe(true);
  for (const value of [
    'http://example.test',
    '/path',
    'https://',
    'https:/example.test',
    'not a URL',
  ])
    expect(isHttpsUrl(value)).toBe(false);
});

it('permits only a verified zero count', () => {
  expect(() => verifySnapshotResult([{ success: true, results: [{ n: 0 }] }])).not.toThrow();
  expect(() => assertEmptySnapshots(3)).toThrow(/already has 3 snapshot/);
  expect(() => assertEmptySnapshots('0')).toThrow(/could not verify/i);
  expect(() => verifySnapshotResult([{ success: false, results: [{ n: 0 }] }])).toThrow(
    /did not succeed/,
  );
});
