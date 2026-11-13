# Backend implementation decisions and remaining risks

- AUTH_MODE: **Cloudflare Access email one-time PIN only**. PBKDF2 iterations:
  **not applicable**; there are no password hashes, application PINs, sessions,
  login/logout endpoints, or application auth cookies.
- Hosting: one Worker, `mahiyanganaya-bus`, with static `/tv/` and `/admin/` assets,
  no SPA fallback, Chrome 109 TV target. Asset-first security headers come from
  generated `_headers`; API and schedule headers are set in the Worker.
- D1: prescribed tables plus a tiny CHECK-constrained transaction guard and three
  user-invariant triggers. D1 batch rollback semantics are documented by
  [Cloudflare](https://developers.cloudflare.com/d1/worker-api/d1-database/).
  Read/validate/hash outside the transaction, then check captured draft revision,
  maximum version, actor enabled status and role inside the same batch before
  writing. Failure aborts all work; no partial publication or reusable version.
- Existing exported TypeScript types remain structurally unchanged. Alert text
  validation was widened from 80 to 140 chars; empty text is allowed only for
  disabled banners by strict validation. Null expiry still means never expires.
- Interpreted the conflicting wait-time wording as warning at 90–180 minutes,
  error above 180. Exact duplicate rules include inactive services. Cloning needs
  overrides to avoid an exact duplicate; it never invents a time.
- Sample and known-place suggestions are unverified data, not authoritative
  station information. The empty draft uses a visibly invalid placeholder mobile
  URL; the owner must set the actual address before public use.
- Restored the deleted shared/API scaffold files from HEAD to preserve the
  existing contract. The pre-existing lockfile changes were retained as input to
  npm's dependency resolution. No new runtime library was added. Wrangler was
  upgraded from 3.x to 4.160.0 (dev-only) for the required assets configuration;
  tsx already existed. Node 24 is now explicit because tests use its built-in
  SQLite support and modern Wrangler requires a recent Node runtime.
- Smoke uses Wrangler's programmatic local dev API to close workerd reliably on
  Windows. The initial CLI process-tree shutdown was blocked in the sandbox;
  the programmatic version passes without process-tree termination. Local
  tooling config/logs were redirected to ignored `.wrangler/config` for tests.
- No Cloudflare account changes, remote D1 execution, real deploy, or push were
  performed. Manual Access delivery, dashboard policy matching, deployed
  workers.dev/custom-domain behavior, and Android device behavior remain owner
  acceptance checks. Only existing placeholder UIs were built.

## Security and operational limits

Access controls the email challenge and its session lifetime. The Worker checks
RS256 signature, issuer, AUD, expiry, optional nbf, email, and local role on every
API request. JWKS failures fail closed, so a Cloudflare key-fetch outage can block
new staff requests; published schedules remain public. Unknown-kid forced refreshes
have a minimum 60-second per-issuer cooldown, including failed attempts. There is
no distributed application rate limiter. Access/WAF policies
should gate invalid-token traffic before it reaches the Worker. Do not log JWTs
or enable request-header logging. There is no sensitive auth material in audit
rows or API error details.

Admin HTML relies on the configured edge Access policy; the API still fails
closed if Access is omitted. Do not insert private data into static assets. CSRF
checks assume HTTPS and same-origin hosting, and cannot protect a compromised
allowed staff browser. User removal requires both local disable and Access policy
removal. Audit logs are append-only by application convention, not tamper-proof
against a database owner, and currently have no retention/export UI.

Concurrent writes are guarded; sequential full-service PUTs are last-write-wins
because the required endpoint has no client revision. A future admin UI must
refresh before saves and always preview the latest revision before publishing.
Rollback blocks schema corruption, automatically disables expired enabled alerts,
and returns newer strict-rule failures as non-blocking bilingual warnings.
Snapshot retention is 50; take owner-managed D1 backups for longer-term recovery.
The current placeholder TV has no offline safety yet; do not deploy it as the
station's operational display until the separate UI/cache task is complete.

## Sinhala spellings the owner must review

Review **every** bilingual pair in `packages/shared/src/known-places.ts`, plus
all names in the sample schedule and the default station name. These suggestions
are explicitly labelled unreviewed. Particularly check Trincomalee,
Dehiattakandiya, Akkaraipattu, Kudurewela/Kaduruwela and Girandurukotte: local or
transliterated spellings may differ. No place is blocked solely for missing this
list; a warning proposes the closest edit-distance match.

| English         | Proposed Sinhala — owner review required |
| --------------- | ---------------------------------------- |
| Colombo         | කොළඹ                                     |
| Kandy           | මහනුවර                                   |
| Ampara          | අම්පාර                                   |
| Batticaloa      | මඩකලපුව                                  |
| Trincomalee     | ත්රිකුණාමලය                             |
| Jaffna          | යාපනය                                    |
| Akkaraipattu    | අක්කරපත්තුව                              |
| Dehiattakandiya | දෙහිඅත්තකණ්ඩිය                           |
| Mihintale       | මිහින්තලේ                                |
| Maharagama      | මහරගම                                    |
| Kurunegala      | කුරුණෑගල                                 |
| Anuradhapura    | අනුරාධපුරය                               |
| Badulla         | බදුල්ල                                   |
| Bibile          | බිබිල                                    |
| Kantale         | කන්තලේ                                   |
| Polonnaruwa     | පොළොන්නරුව                               |
| Mahiyanganaya   | මහියංගනය                                 |
| Kudurewela      | කදුරුවෙල                                 |
| Monaragala      | මොණරාගල                                  |
| Passara         | පස්සර                                    |
| Girandurukotte  | ගිරාඳුරුකෝට්ටේ                           |
| Hasalaka        | හසලක                                     |

## Dependency audit at completion

`npm audit` reports 14 advisories in the inherited dependency graph (10 moderate,
2 high, 2 critical). `npm audit --omit=dev` reports one high advisory for Zod 3:
[oversized collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
The Worker now bounds service count (300) and weekday count (7) **before** Zod
traversal, as well as limiting JSON bodies to 1 MiB; shared wrapper validators
also short-circuit oversized collections. This mitigates the reported allocation
path here, but does not make the installed dependency advisory disappear. Use the
bounded wrapper validators for untrusted input rather than calling the exported
raw Zod schemas directly. A Zod 4 migration needs separate contract compatibility
review; no forced major dependency upgrades were applied.

The critical advisories are in inherited Vitest/tinypool development tooling.
This task uses `vitest run`, not a network-exposed test UI. Do not expose test/dev
servers. Upgrade that toolchain in a separate maintenance change before enabling
untrusted test-server access. These findings are explicitly outstanding; the
backend checks being green do not mean the dependency audit is clean.

## Changed-file manifest

New files:

- `packages/shared/src/known-places.ts`
- `packages/shared/src/service-rules.ts`
- `packages/shared/src/__tests__/service-rules.test.ts`
- `workers/api/migrations/0001_init.sql`
- `workers/api/src/auth.ts`
- `workers/api/src/http.ts`
- `workers/api/src/schedule.ts`
- `workers/api/src/store.ts`
- `workers/api/src/__tests__/api.test.ts`
- `workers/api/src/__tests__/auth.test.ts`
- `workers/api/src/__tests__/database.ts`
- `workers/api/src/__tests__/schedule.test.ts`
- `workers/api/scripts/local-tools.ts`
- `workers/api/scripts/user-cli.ts`
- `workers/api/scripts/seed.ts`
- `workers/api/scripts/smoke.ts`
- `scripts/assemble-assets.ts`
- `tsconfig.scripts.json`
- `docs/API.md`
- `docs/BACKEND.md`

Modified files:

- `.gitignore`, `.nvmrc`, `package.json`, `package-lock.json`
- `eslint.config.mjs`, `vitest.config.ts`
- `packages/shared/src/schema.ts`, `packages/shared/src/index.ts`
- `workers/api/src/index.ts`, `workers/api/package.json`
- `workers/api/tsconfig.json`, `workers/api/wrangler.toml`
- `apps/tv/vite.config.ts`, `apps/admin/vite.config.ts`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`

Other initially deleted scaffold files were restored byte-equivalently to HEAD
and therefore do not appear as commit changes. Generated public assets, build
outputs, local SQLite databases, npm cache and Wrangler logs are untracked/ignored.

## Verification output

Final local checks on 2026-11-11 (Node 24, npm 11):

```text
npm run typecheck  -> exit 0 (workspace build + CLI/asset script typecheck)
npm run lint       -> exit 0
npm test           -> Test Files 5 passed (5); Tests 127 passed (127)
npm run test:smoke -> Smoke: 16 checks passed
npm run build      -> Total Upload: 182.08 KiB / gzip: 36.57 KiB
                      --dry-run: exiting now. (exit 0)
```

Local migration, user create/list/disable/enable, and SEED bootstrap were also
exercised successfully. That manual CLI check left a local sample database with
`local-admin@example.com` and `local-editor@example.com` test identities; it is
ignored and has no connection to production. No local bypass file was committed.
