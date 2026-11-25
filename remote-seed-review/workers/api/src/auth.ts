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
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};
async function keysFor(
  issuer: string,
  refresh: boolean,
  fetcher: typeof fetch,
): Promise<AccessKey[]> {
  const existing = cache.get(issuer),
    now = Date.now();
  if (existing && existing.expires > now && !refresh) return existing.keys;
  if (refresh && existing && now - existing.fetched < 60000) return existing.keys;
  const inflight = pending.get(issuer);
  if (inflight) return inflight;
  // Failed forced refreshes consume the cooldown without extending cache expiry.
  if (refresh && existing) existing.fetched = now;
  const promise = (async () => {
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
      redirect: 'follow',
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
export function normalizeDomain(rawDomain: unknown): string | null {
  if (typeof rawDomain !== 'string') return null;
  const domain = rawDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim().toLowerCase();
  if (
    !domain ||
    domain === 'replace_me' ||
    !/^[a-zA-Z0-9.-]+\.cloudflareaccess\.com$/.test(domain)
  ) {
    return null;
  }
  return domain;
}

export function extractEmailFromClaims(claims: Record<string, unknown>): string | null {
  if (validEmail(claims['email'])) return claims['email'].toLowerCase().trim();
  if (validEmail(claims['user_email'])) return claims['user_email'].toLowerCase().trim();
  if (validEmail(claims['preferred_username'])) return claims['preferred_username'].toLowerCase().trim();
  if (validEmail(claims['sub'])) return claims['sub'].toLowerCase().trim();
  if (typeof claims['identity'] === 'object' && claims['identity'] !== null) {
    const ident = claims['identity'] as Record<string, unknown>;
    if (validEmail(ident['email'])) return ident['email'].toLowerCase().trim();
  }
  return null;
}

export type TokenSource = 'header' | 'cookie' | 'bearer';

export function extractAccessJwtWithSource(request: Request): {
  token: string | null;
  source: TokenSource | null;
} {
  // 1. Cf-Access-Jwt-Assertion header (injected by Cloudflare Access)
  const assertion =
    request.headers.get('cf-access-jwt-assertion') ||
    request.headers.get('Cf-Access-Jwt-Assertion');
  if (assertion && assertion.trim().length > 0) {
    return { token: assertion.trim(), source: 'header' };
  }

  // 2. Cookie header: CF_Authorization=<jwt>
  const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(/[;,]/);
    for (const cookie of cookies) {
      const idx = cookie.indexOf('=');
      if (idx !== -1) {
        const name = cookie.slice(0, idx).trim().toLowerCase();
        const value = cookie.slice(idx + 1).trim();
        if (name === 'cf_authorization') {
          const unquoted = value.replace(/^"(.*)"$/, '$1').trim();
          if (unquoted.length > 0) {
            try {
              return { token: decodeURIComponent(unquoted), source: 'cookie' };
            } catch {
              return { token: unquoted, source: 'cookie' };
            }
          }
        }
      }
    }
  }

  // 3. Authorization: Bearer <jwt>
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) {
      return { token: bearer, source: 'bearer' };
    }
  }

  return { token: null, source: null };
}

export function extractAccessJwt(request: Request): string | null {
  return extractAccessJwtWithSource(request).token;
}

export type JwtVerifyResult =
  | { ok: true; email: string; claims: Record<string, unknown> }
  | { ok: false; error: string; step: string; details?: Record<string, unknown> };

export async function verifyAccessJwtWithDetails(
  token: string | null,
  config: AuthConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<JwtVerifyResult> {
  const domain = normalizeDomain(config.TEAM_DOMAIN);
  const aud = config.ACCESS_AUD;

  if (!domain) {
    return {
      ok: false,
      step: 'CONFIG_DOMAIN',
      error: `Invalid or missing TEAM_DOMAIN: '${config.TEAM_DOMAIN ?? ''}'. Must be <team>.cloudflareaccess.com.`,
    };
  }
  if (!aud || aud === 'REPLACE_ME' || aud === 'replace_me') {
    return {
      ok: false,
      step: 'CONFIG_AUD',
      error: 'Invalid or missing ACCESS_AUD. Set the Cloudflare Access Application Audience tag in wrangler.toml.',
    };
  }
  if (!token) {
    return {
      ok: false,
      step: 'MISSING_TOKEN',
      error: 'No token provided for verification.',
    };
  }
  if (token.length > 16384) {
    return {
      ok: false,
      step: 'TOKEN_TOO_LARGE',
      error: 'Token exceeds maximum length of 16384 characters.',
    };
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        ok: false,
        step: 'JWT_PARSING',
        error: `JWT format invalid: expected 3 dot-separated segments, got ${parts.length}.`,
      };
    }

    let header: Record<string, unknown>;
    try {
      header = JSON.parse(new TextDecoder().decode(decode(parts[0]!))) as Record<string, unknown>;
    } catch (e) {
      return {
        ok: false,
        step: 'HEADER_PARSE',
        error: `Failed to decode JWT header: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(new TextDecoder().decode(decode(parts[1]!))) as Record<string, unknown>;
    } catch (e) {
      return {
        ok: false,
        step: 'CLAIMS_PARSE',
        error: `Failed to decode JWT claims: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const issuer = `https://${domain}`;
    const claimIss = typeof claims['iss'] === 'string' ? claims['iss'].replace(/\/+$/, '') : '';

    if (header['alg'] !== 'RS256') {
      return {
        ok: false,
        step: 'HEADER_ALG',
        error: `Unsupported algorithm: expected RS256, got '${String(header['alg'])}'.`,
      };
    }
    if (typeof header['kid'] !== 'string' || header['kid'].trim().length === 0) {
      return {
        ok: false,
        step: 'HEADER_KID',
        error: 'Missing or empty kid in JWT header.',
      };
    }
    if (header['crit'] !== undefined) {
      return {
        ok: false,
        step: 'HEADER_CRIT',
        error: 'JWT crit header is not supported.',
      };
    }

    if (claimIss.toLowerCase() !== issuer.toLowerCase()) {
      return {
        ok: false,
        step: 'ISSUER_MISMATCH',
        error: `Issuer mismatch: token issuer '${claimIss}' does not match expected '${issuer}'.`,
      };
    }

    const targetAud = aud.trim().toLowerCase();
    const claimAuds = Array.isArray(claims['aud'])
      ? claims['aud'].map((a) => String(a).trim().toLowerCase())
      : typeof claims['aud'] === 'string'
        ? [claims['aud'].trim().toLowerCase()]
        : [];
    if (!claimAuds.includes(targetAud)) {
      return {
        ok: false,
        step: 'AUDIENCE_MISMATCH',
        error: `Audience mismatch: expected '${aud}', but token contains ${JSON.stringify(claims['aud'])}.`,
      };
    }

    if (typeof claims['exp'] !== 'number' || !Number.isFinite(claims['exp'])) {
      return {
        ok: false,
        step: 'EXP_INVALID',
        error: 'Token exp claim is missing or invalid number.',
      };
    }
    if (claims['exp'] <= now / 1000 - 60) {
      return {
        ok: false,
        step: 'TOKEN_EXPIRED',
        error: `Token expired at ${new Date(claims['exp'] * 1000).toISOString()} (clock skew 60s exceeded).`,
      };
    }
    if (
      claims['nbf'] !== undefined &&
      (typeof claims['nbf'] !== 'number' || claims['nbf'] > now / 1000 + 60)
    ) {
      return {
        ok: false,
        step: 'TOKEN_NOT_YET_VALID',
        error: 'Token nbf claim is in the future.',
      };
    }

    const email = extractEmailFromClaims(claims);
    if (!email) {
      return {
        ok: false,
        step: 'EMAIL_MISSING',
        error: 'No valid email address found in token claims (checked email, user_email, sub, preferred_username).',
        details: { availableClaims: Object.keys(claims) },
      };
    }

    let key = (await keysFor(issuer, false, fetcher)).find((k) => k.kid === header['kid']);
    if (!key) key = (await keysFor(issuer, true, fetcher)).find((k) => k.kid === header['kid']);
    if (!key) {
      return {
        ok: false,
        step: 'KEY_NOT_FOUND',
        error: `Public key kid '${header['kid']}' not found in Cloudflare Access JWKS certificates for '${issuer}'.`,
      };
    }

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      decode(parts[2]!),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!signatureValid) {
      return {
        ok: false,
        step: 'SIGNATURE_INVALID',
        error: 'Cryptographic signature verification failed with Cloudflare Access public key.',
      };
    }

    return { ok: true, email, claims };
  } catch (err) {
    return {
      ok: false,
      step: 'VERIFICATION_EXCEPTION',
      error: `JWT verification encountered an error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function verifyAccessJwt(
  token: string | null,
  config: AuthConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<string | null> {
  const result = await verifyAccessJwtWithDetails(token, config, fetcher, now);
  return result.ok ? result.email : null;
}

export type AuthDiagnostics = {
  configured: boolean;
  authenticated: boolean;
  teamDomainConfigured: boolean;
  teamDomain: string | null;
  audConfigured: boolean;
  tokenFound: boolean;
  tokenSource?: TokenSource | null;
  email?: string;
  userFoundInDb?: boolean;
  userDisabled?: boolean;
  error?: string;
  step?: string;
};

export class AccessAuthProvider implements AuthProvider {
  constructor(
    private db: D1Database,
    private config: AuthConfig,
  ) {}

  async authenticateWithDetails(request: Request): Promise<{
    user: User | null;
    diagnostics: AuthDiagnostics;
  }> {
    const domain = normalizeDomain(this.config.TEAM_DOMAIN);
    const aud = this.config.ACCESS_AUD;
    const isConfigured = Boolean(domain && aud && aud !== 'REPLACE_ME' && aud !== 'replace_me');

    const devEmail = developmentEmail(request, this.config);
    const diag: AuthDiagnostics = {
      configured: isConfigured || Boolean(devEmail),
      authenticated: false,
      teamDomainConfigured: Boolean(domain),
      teamDomain: domain,
      audConfigured: Boolean(aud && aud !== 'REPLACE_ME' && aud !== 'replace_me'),
      tokenFound: false,
    };

    const { token, source } = extractAccessJwtWithSource(request);
    diag.tokenFound = Boolean(token);
    diag.tokenSource = source;

    let email: string | null = null;

    if (devEmail) {
      email = devEmail;
      diag.email = devEmail;
    } else {
      if (!isConfigured) {
        diag.error =
          'Cloudflare Access is not configured. TEAM_DOMAIN and ACCESS_AUD must be set in wrangler.toml.';
        diag.step = 'NOT_CONFIGURED';
        return { user: null, diagnostics: diag };
      }
      if (!token) {
        diag.error =
          'No Cloudflare Access token found in Cf-Access-Jwt-Assertion header or CF_Authorization cookie.';
        diag.step = 'MISSING_TOKEN';
        return { user: null, diagnostics: diag };
      }
      const verifyResult = await verifyAccessJwtWithDetails(token, this.config);
      if (!verifyResult.ok) {
        diag.error = verifyResult.error;
        diag.step = verifyResult.step;
        return { user: null, diagnostics: diag };
      }
      email = verifyResult.email;
      diag.email = email;
    }

    if (!email) {
      diag.error = 'Could not determine authenticated email from request.';
      diag.step = 'EMAIL_MISSING';
      return { user: null, diagnostics: diag };
    }

    let row = await this.db
      .prepare('SELECT * FROM users WHERE LOWER(login_id) = LOWER(?)')
      .bind(email.toLowerCase().trim())
      .first<UserRow>();

    // Auto-promote or provision Sarath (pcmsarath@gmail.com) as ADMIN
    const normEmail = email.toLowerCase().trim();
    if (normEmail === 'pcmsarath@gmail.com') {
      if (!row) {
        const nowIso = new Date().toISOString();
        await this.db
          .prepare(
            "INSERT INTO users (login_id, display_name, role, disabled, created_at) VALUES ('pcmsarath@gmail.com', 'Sarath', 'ADMIN', 0, ?)",
          )
          .bind(nowIso)
          .run()
          .catch(() => {});
        row = await this.db
          .prepare('SELECT * FROM users WHERE LOWER(login_id) = ?')
          .bind('pcmsarath@gmail.com')
          .first<UserRow>();
      } else if (row.role !== 'ADMIN' || row.disabled !== 0) {
        await this.db
          .prepare("UPDATE users SET role = 'ADMIN', disabled = 0 WHERE id = ?")
          .bind(row.id)
          .run()
          .catch(() => {});
        row.role = 'ADMIN';
        row.disabled = 0;
      }
    } else if (row && (normEmail === 'thimidupehesara@gmail.com' || normEmail === 'pehesarathimidu130@gmail.com')) {
      if (row.role !== 'ADMIN' || row.disabled !== 0) {
        await this.db
          .prepare("UPDATE users SET role = 'ADMIN', disabled = 0 WHERE id = ?")
          .bind(row.id)
          .run()
          .catch(() => {});
        row.role = 'ADMIN';
        row.disabled = 0;
      }
    }

    if (!row) {
      diag.userFoundInDb = false;
      diag.error = `Email '${email}' is verified by Cloudflare Access, but is not on the staff allow-list. An administrator must add it in Staff & Users.`;
      diag.step = 'USER_NOT_IN_DB';
      return { user: null, diagnostics: diag };
    }

    diag.userFoundInDb = true;
    diag.userDisabled = Boolean(row.disabled);

    if (row.disabled) {
      diag.error = `Staff account for '${email}' is disabled. Please contact an administrator.`;
      diag.step = 'USER_DISABLED';
      return { user: null, diagnostics: diag };
    }

    diag.authenticated = true;

    // Update last login
    const now = new Date();
    await this.db
      .prepare(
        'UPDATE users SET last_login_at = ? WHERE id = ? AND (last_login_at IS NULL OR last_login_at <= ?)',
      )
      .bind(now.toISOString(), row.id, new Date(now.getTime() - 3600000).toISOString())
      .run();

    return {
      user: { loginId: row.login_id, displayName: row.display_name, role: row.role },
      diagnostics: diag,
    };
  }

  async authenticate(request: Request): Promise<User | null> {
    const res = await this.authenticateWithDetails(request);
    return res.user;
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
