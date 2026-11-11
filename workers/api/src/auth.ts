import { ApiError } from './http.js';
export type Role = 'ADMIN' | 'EDITOR';
export type User = { loginId: string; displayName: string; role: Role };
export interface AuthProvider {
  authenticate(request: Request): Promise<User | null>;
}
export interface AuthConfig {
  TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_BYPASS_AUTH_EMAIL?: string;
}
export type UserRow = {
  id: number;
  login_id: string;
  display_name: string;
  role: Role;
  disabled: number;
  created_at: string;
  last_login_at: string | null;
};
export const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export const validEmail = (email: unknown): email is string =>
  typeof email === 'string' &&
  email.length <= 254 &&
  EMAIL.test(email) &&
  !email.split('@')[0]!.includes('..') &&
  !email.startsWith('.') &&
  !email.includes('.@');
type AccessKey = JsonWebKey & { kid: string };
type KeyCache = { keys: AccessKey[]; expires: number; fetched: number };
const cache = new Map<string, KeyCache>();
const pending = new Map<string, Promise<AccessKey[]>>();
const decode = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
};
async function keysFor(
  issuer: string,
  refresh: boolean,
  fetcher: typeof fetch,
): Promise<AccessKey[]> {
  const existing = cache.get(issuer),
    now = Date.now();
  if (existing && existing.expires > now && !refresh) return existing.keys;
  const inflight = pending.get(issuer);
  if (inflight) return inflight;
  const promise = (async () => {
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Key fetch failed');
    const data = (await response.json()) as { keys?: AccessKey[] };
    if (!Array.isArray(data.keys)) throw new Error('Invalid keys');
    const keys = data.keys.filter(
      (k) =>
        k.kty === 'RSA' &&
        typeof k.kid === 'string' &&
        (!k.alg || k.alg === 'RS256') &&
        (!k.use || k.use === 'sig'),
    );
    if (cache.size >= 8 && !cache.has(issuer)) cache.delete(cache.keys().next().value!);
    cache.set(issuer, { keys, expires: now + 3600000, fetched: now });
    return keys;
  })();
  pending.set(issuer, promise);
  try {
    return await promise;
  } finally {
    pending.delete(issuer);
  }
}
export function clearJwksCache(): void {
  cache.clear();
  pending.clear();
}
export function developmentEmail(request: Request, config: AuthConfig): string | null {
  const hostname = new URL(request.url).hostname;
  return (hostname === 'localhost' || hostname === '127.0.0.1') &&
    validEmail(config.DEV_BYPASS_AUTH_EMAIL)
    ? config.DEV_BYPASS_AUTH_EMAIL.toLowerCase()
    : null;
}
export async function verifyAccessJwt(
  token: string | null,
  config: AuthConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<string | null> {
  const { TEAM_DOMAIN: domain, ACCESS_AUD: aud } = config;
  if (
    !domain ||
    !aud ||
    domain === 'REPLACE_ME' ||
    aud === 'REPLACE_ME' ||
    !/^[a-zA-Z0-9-]+\.cloudflareaccess\.com$/.test(domain) ||
    !token ||
    token.length > 16384
  )
    return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]!))) as Record<
      string,
      unknown
    >;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1]!))) as Record<
      string,
      unknown
    >;
    const issuer = `https://${domain}`;
    if (
      header['alg'] !== 'RS256' ||
      typeof header['kid'] !== 'string' ||
      header['crit'] !== undefined
    )
      return null;
    if (
      claims['iss'] !== issuer ||
      !(Array.isArray(claims['aud']) ? claims['aud'].includes(aud) : claims['aud'] === aud) ||
      typeof claims['exp'] !== 'number' ||
      !Number.isFinite(claims['exp']) ||
      claims['exp'] <= now / 1000 - 60 ||
      (claims['nbf'] !== undefined &&
        (typeof claims['nbf'] !== 'number' || claims['nbf'] > now / 1000 + 60)) ||
      !validEmail(claims['email'])
    )
      return null;
    let key = (await keysFor(issuer, false, fetcher)).find((k) => k.kid === header['kid']);
    if (!key) key = (await keysFor(issuer, true, fetcher)).find((k) => k.kid === header['kid']);
    if (!key) return null;
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        decode(parts[2]!),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      ))
    )
      return null;
    return claims['email'].toLowerCase();
  } catch {
    return null;
  }
}
export class AccessAuthProvider implements AuthProvider {
  constructor(
    private db: D1Database,
    private config: AuthConfig,
  ) {}
  async authenticate(request: Request): Promise<User | null> {
    const email =
      developmentEmail(request, this.config) ??
      (await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), this.config));
    if (!email) return null;
    const row = await this.db
      .prepare('SELECT * FROM users WHERE login_id = ? COLLATE NOCASE')
      .bind(email)
      .first<UserRow>();
    if (!row || row.disabled)
      throw new ApiError(403, 'NOT_ALLOWED', 'Your email is not on the allow-list.');
    const now = new Date();
    await this.db
      .prepare(
        'UPDATE users SET last_login_at = ? WHERE id = ? AND (last_login_at IS NULL OR last_login_at <= ?)',
      )
      .bind(now.toISOString(), row.id, new Date(now.getTime() - 3600000).toISOString())
      .run();
    return { loginId: row.login_id, displayName: row.display_name, role: row.role };
  }
}
export function requireAdmin(user: User): void {
  if (user.role !== 'ADMIN')
    throw new ApiError(403, 'ADMIN_REQUIRED', 'Administrator role required.');
}
export function checkUserChange(
  actor: User,
  target: UserRow,
  patch: { role?: Role; disabled?: boolean },
  activeAdmins: number,
): void {
  const removesAdmin = patch.role === 'EDITOR' || patch.disabled === true;
  if (actor.loginId.toLowerCase() === target.login_id.toLowerCase() && removesAdmin)
    throw new ApiError(409, 'SELF_CHANGE', 'You cannot disable or demote yourself.');
  if (target.role === 'ADMIN' && !target.disabled && removesAdmin && activeAdmins <= 1)
    throw new ApiError(
      409,
      'LAST_ADMIN',
      'The last active administrator cannot be disabled or demoted.',
    );
}
