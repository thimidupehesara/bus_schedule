import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  verifyAccessJwt,
  developmentEmail,
  clearJwksCache,
  checkUserChange,
  validEmail,
  type UserRow,
} from '../auth.js';
import { checkCsrf, readJson } from '../http.js';
const config = { TEAM_DOMAIN: 'test.cloudflareaccess.com', ACCESS_AUD: 'bus-app' };
let pair: CryptoKeyPair, jwk: JsonWebKey;
const encode = (raw: string | Uint8Array) => Buffer.from(raw).toString('base64url');
const now = Date.now();
beforeAll(async () => {
  pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});
beforeEach(clearJwksCache);
async function token(
  patch: Record<string, unknown> = {},
  headerPatch: Record<string, unknown> = {},
) {
  const header = encode(JSON.stringify({ alg: 'RS256', kid: 'test-key', ...headerPatch }));
  const payload = encode(
    JSON.stringify({
      iss: `https://${config.TEAM_DOMAIN}`,
      aud: [config.ACCESS_AUD],
      email: 'STAFF@example.com',
      exp: now / 1000 + 300,
      ...patch,
    }),
  );
  return `${header}.${payload}.${encode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`))))}`;
}
const fetchKeys = () =>
  vi.fn(async () =>
    Response.json({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] }),
  );
describe('Access RS256 validation', () => {
  it('verifies a signed token and caches JWKS', async () => {
    const fetcher = fetchKeys(),
      jwt = await token();
    expect(await verifyAccessJwt(jwt, config, fetcher, now)).toBe('staff@example.com');
    expect(await verifyAccessJwt(jwt, config, fetcher, now)).toBe('staff@example.com');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { aud: ['wrong'] },
    { iss: 'https://evil.example.com' },
    { exp: now / 1000 - 61 },
    { exp: '999999999999' },
    { email: undefined },
    { email: 'bad' },
    { nbf: now / 1000 + 61 },
  ])('rejects claims %j', async (patch) => {
    expect(await verifyAccessJwt(await token(patch), config, fetchKeys(), now)).toBeNull();
  });
  it('allows the documented 60-second expiry skew', async () =>
    expect(
      await verifyAccessJwt(await token({ exp: now / 1000 - 30 }), config, fetchKeys(), now),
    ).toBe('staff@example.com'));
  it('rejects a bad signature', async () => {
    const jwt = (await token()).split('.');
    jwt[2] = encode(new Uint8Array(256));
    expect(await verifyAccessJwt(jwt.join('.'), config, fetchKeys(), now)).toBeNull();
  });
  it('refetches unknown kid and fails closed when it remains absent', async () => {
    const fetcher = fetchKeys();
    expect(
      await verifyAccessJwt(await token({}, { kid: 'missing' }), config, fetcher, now),
    ).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('accepts a newly rotated key after refresh', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ keys: [{ ...jwk, kid: 'old' }] }))
      .mockResolvedValueOnce(Response.json({ keys: [{ ...jwk, kid: 'test-key' }] }));
    expect(await verifyAccessJwt(await token(), config, fetcher, now)).toBe('staff@example.com');
  });
  it.each([
    {},
    { TEAM_DOMAIN: config.TEAM_DOMAIN },
    { ACCESS_AUD: config.ACCESS_AUD },
    { ...config, TEAM_DOMAIN: 'REPLACE_ME' },
    { ...config, ACCESS_AUD: 'REPLACE_ME' },
    { ...config, TEAM_DOMAIN: 'evil.example.com/path' },
  ])('fails closed with invalid configuration %j', async (cfg) =>
    expect(await verifyAccessJwt(await token(), cfg, fetchKeys(), now)).toBeNull(),
  );
  it.each(['none', 'HS256'])('rejects algorithm %s', async (alg) =>
    expect(await verifyAccessJwt(await token({}, { alg }), config, fetchKeys(), now)).toBeNull(),
  );
  it('fails closed on network and malformed token errors', async () => {
    expect(
      await verifyAccessJwt(
        await token(),
        config,
        async () => {
          throw new Error('offline');
        },
        now,
      ),
    ).toBeNull();
    expect(await verifyAccessJwt('bad.bad.bad', config, fetchKeys(), now)).toBeNull();
  });
});
describe('development bypass', () => {
  const cfg = { DEV_BYPASS_AUTH_EMAIL: 'STAFF@example.com' };
  it.each(['http://localhost:8787', 'http://127.0.0.1:8787'])(
    'works only on local host %s',
    (url) => expect(developmentEmail(new Request(url), cfg)).toBe('staff@example.com'),
  );
  it.each([
    'https://mahiyanganaya-bus.example.workers.dev',
    'https://localhost.example.com',
    'https://example.com',
    'http://[::1]',
  ])('refuses deployed or other hostname %s', (url) =>
    expect(developmentEmail(new Request(url), cfg)).toBeNull(),
  );
  it('requires a configured valid email', () =>
    expect(developmentEmail(new Request('http://localhost'), {})).toBeNull());
});
describe('user invariants', () => {
  const admin = { loginId: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' as const };
  const target: UserRow = {
    id: 1,
    login_id: admin.loginId,
    display_name: 'Admin',
    role: 'ADMIN',
    disabled: 0,
    created_at: '',
    last_login_at: null,
  };
  it('cannot disable or demote self', () => {
    expect(() => checkUserChange(admin, target, { disabled: true }, 2)).toThrow('yourself');
    expect(() => checkUserChange(admin, target, { role: 'EDITOR' }, 2)).toThrow('yourself');
  });
  it('cannot disable or demote last admin', () => {
    expect(() =>
      checkUserChange({ ...admin, loginId: 'other@example.com' }, target, { role: 'EDITOR' }, 1),
    ).toThrow('last active');
    expect(() =>
      checkUserChange({ ...admin, loginId: 'other@example.com' }, target, { disabled: true }, 1),
    ).toThrow('last active');
  });
  it.each([
    'bad',
    'a..b@example.com',
    'a@example',
    '.a@example.com',
    'a.@example.com',
    'a@-example.com',
    'a@example.com\n',
  ])('rejects invalid email %s', (email) => expect(validEmail(email)).toBe(false));
});
describe('CSRF and request bodies', () => {
  const headers = {
    Origin: 'https://bus.example.com',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  };
  it('requires exact origin and explicit header on mutations', () => {
    expect(() =>
      checkCsrf(new Request('https://bus.example.com/api/publish', { method: 'POST', headers })),
    ).not.toThrow();
    for (const h of [
      {},
      { Origin: headers.Origin },
      { ...headers, Origin: 'https://evil.example.com' },
      { ...headers, Origin: 'null' },
    ])
      expect(() =>
        checkCsrf(
          new Request('https://bus.example.com/api/publish', { method: 'POST', headers: h }),
        ),
      ).toThrow();
    expect(() => checkCsrf(new Request('https://bus.example.com/api/draft'))).not.toThrow();
  });
  it('rejects wrong content type, invalid JSON, and streamed oversized bodies', async () => {
    await expect(
      readJson(new Request('http://localhost', { method: 'POST', body: '{}' })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(new Request('http://localhost', { method: 'POST', headers, body: '{' })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJson(
        new Request('http://localhost', {
          method: 'POST',
          headers,
          body: 'x'.repeat(1024 * 1024 + 1),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
