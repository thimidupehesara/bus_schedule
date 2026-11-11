# Mahiyanganaya Bus Stand timetable

Sinhala + English static timetable, not live tracking. The backend is implemented;
`apps/tv` and `apps/admin` remain placeholder pages. The actual display, staff
editing/Users screens, offline cache, and Kotlin launcher are separate tasks.
Do not treat the sample timetable as an approved public timetable.

## Local development

Use Node **24** and npm **11** (`node:sqlite` is used by integration tests).

```sh
npm install
npm run db:migrate:local
npm run user:create -- owner@example.com "Owner" ADMIN
npm run db:seed:local
npm run dev:api
```

Before starting the local API, create ignored `workers/api/.dev.vars` with:

```dotenv
DEV_BYPASS_AUTH_EMAIL=owner@example.com
```

The bypass is accepted only when the **request URL hostname** is exactly
`localhost` or `127.0.0.1`; the user must still exist and be enabled in D1.
It is ignored on every deployed hostname even if accidentally configured there.
Keep local dev bound to loopback. No passwords, application PINs, login pages,
cookies, or application sessions exist. Real authentication is Cloudflare Access
email one-time PIN, with independent JWT verification on every API request.

Open `http://localhost:8787/tv/` and `/admin/`. Both are placeholders. Requests to
`/api/auth/me` show the local identity. Metadata and service writes require
`Origin: http://localhost:8787`, `X-Requested-With: XMLHttpRequest`, and
`Content-Type: application/json`. See [the API contract](docs/API.md).

`db:seed:local` refuses to overwrite an existing version 1. It publishes the shared
sample as SEED, not as approved transport data. Never run it against production.
The first draft is initialized lazily from the live snapshot; without one, it
uses an empty timetable, default display settings, no alert, today's Colombo
date, and a placeholder `https://example.invalid` mobile URL. Set the real URL.

## Validation and build

```sh
npm run typecheck
npm run lint
npm test
npm run test:smoke
npm run build
```

Build compiles shared code, builds both Vite apps, assembles
`workers/api/public/{tv,admin}`, then runs **only** Wrangler's deploy dry-run.
TV target stays `chrome109`. There is no SPA fallback; future UI routing must use
hash routes or no router. `npm run deploy` is a separate, explicit real deployment.
Generated assets, local databases, environment files, and secret files are ignored.

Smoke uses Wrangler's **local dev API** (equivalent to local `wrangler dev`) and
real local D1 migrations. It creates isolated `.wrangler/smoke-*` databases and
stops each local workerd instance through Wrangler, avoiding Windows process-tree
termination. It checks assets, authentication, roles, CSRF, draft isolation,
validation, ETags, publication and rollback. RSA JWT signature/claim tests run in
Vitest with generated keys; no Cloudflare account is used. Password/PIN rate
limits and cookie checks are inapplicable to Access-only authentication.

For a sandbox that disallows Wrangler's user-profile config/log directory, set
`XDG_CONFIG_HOME` to an absolute ignored directory within this checkout before
running the commands (PowerShell example):

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.wrangler/config'
$env:WRANGLER_SEND_METRICS = 'false'
```

This redirects local tooling state, not production configuration. On a normal
owner workstation use the default config directory so `wrangler login` is found.

## FIRST DEPLOY — owner performs manually

No deployment, remote command, account provisioning, or push is performed by this
implementation. Finish the real TV/admin UIs before a staff handover; the final
publish-from-admin step below requires that separate UI task.

1. Run `npx wrangler login` from `workers/api`.
2. Run `npx wrangler d1 create mahiyanganaya-bus-db`. Paste the returned
   `database_id` into `workers/api/wrangler.toml`, replacing the placeholder.
3. From `workers/api`, run
   `npx wrangler d1 migrations apply mahiyanganaya-bus-db --remote`.
4. From the repository root, run
   `npm run user:create -- owner@example.com "Owner" ADMIN --remote`.
   The CLI requires typing **YES** before any remote operation. This bootstraps
   the first ADMIN. There are no credentials to generate or store.
5. From the root, run `npm run deploy` once. The worker name is
   `mahiyanganaya-bus`. Unconfigured Access vars cause all API authentication to
   fail closed with 401. Keep the admin HTML free of secrets.
6. In Cloudflare Zero Trust, create/select your team. Record the team domain
   (`your-team.cloudflareaccess.com`, no scheme or trailing slash).
7. In Zero Trust **Settings → Authentication → Login methods**, enable **One-time
   PIN**. Use only this login method for this application. Staff receive their
   code from Cloudflare; the Worker never handles the code.
8. In **Access → Applications → Add an application → Self-hosted**, create one
   application with public hostname/path entries covering this origin's
   `/admin/*` and `/api/*`. Also protect the bare `/admin` and `/api` paths if the
   dashboard's wildcard does not include them. Use the same application for both
   paths so the Worker accepts one audience tag. If the dashboard requires
   separate applications, use the `/api/*` application's AUD for the API Worker.
9. Add an **Allow** policy whose **Include → Emails** list contains the exact
   staff email addresses, including the first administrator. Do not add an
   Everyone/Bypass policy to the staff paths. Choose an appropriate Access
   session duration and require the One-time PIN identity provider.
10. Open the application's configuration/overview and copy **Application Audience
    (AUD) Tag**. Set `TEAM_DOMAIN` and `ACCESS_AUD` under `[vars]` in
    `workers/api/wrangler.toml`; these are configuration values, not secrets.
11. Run `npm run deploy` again. Remove any local bypass variable from production
    configuration even though remote hostnames ignore it.
12. In a private browser, check `/schedule.json`, `/tv/`, and `/health` remain open
    **without login**. `/schedule.json` returns 503 + Retry-After until the first
    publication. Check `/admin/` and **`/api/auth/me`** require the emailed code.
    (`/api/me` in the brief was a typo; that endpoint is not defined.) After
    authentication, an email absent/disabled in D1 must receive 403 from the API.
13. Once the real admin UI is available, enter and verify the actual timetable,
    review every warning and Sinhala spelling, preview, then publish from that
    page. Confirm the TV shows the correct day and time, including midnight.

**VERIFY in current Cloudflare docs:** dashboard labels, plan/seat limits,
multiple public hostname entries, Access's matching of bare paths and wildcards,
AUD placement, and One-time PIN setup can change. In particular, verify how
path-scoped Access applications apply to **workers.dev** and whether path-level
exclusions are supported there. Do not use a whole-worker Access switch if it
would also protect the public TV/schedule/health paths. Prefer a custom domain
with path-scoped self-hosted Access if workers.dev cannot provide that split.
Check every reachable hostname, including preview URLs. The API verifies JWTs
even if a route is accidentally left outside Access; admin HTML relies on Access
being configured correctly, while containing no private data itself.

References (review again at deployment):
[Workers and Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/),
[self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/),
[one-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/),
[JWT validation](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/),
[asset routing](https://developers.cloudflare.com/workers/static-assets/binding/).

## RECOVERY

- **Cannot log in:** check the exact email in two places: the Cloudflare Access
  Allow policy AND the application's `users` table. Also check disabled status,
  team domain, AUD and Access identity-provider configuration. A different
  working ADMIN can use the future Users screen. If every admin is locked out,
  the owner can use `user:list` / `user:enable` / `user:create` with `--remote`
  and typed YES. The CLI and database refuse removal of the last active ADMIN.
- **Add staff:** an ADMIN creates the user and role in the Users screen, and the
  owner adds the email to Access's policy in the dashboard. Both are necessary.
  **Remove staff:** disable the user in the Users screen (API access stops on
  the next request) AND remove their email from the Access policy. The 20-user
  limit includes disabled records. Access policy management remains a dashboard
  responsibility; this backend cannot change it.
- **Bad publish:** select a retained good version in History, review, and confirm
  rollback. Rollback produces a new, higher version and replaces the draft.
  It never decrements/reuses versions. Only the newest 50 snapshots are retained.
  Strict validation still applies: an expired enabled alert or newly invalid
  old data blocks rollback; import/edit a corrected document and publish instead.
- **Backend down:** the intended TV implementation keeps its last validated
  IndexedDB/service-worker copy and retries every three minutes. It must never
  substitute an empty/error response for a known good schedule. Offline caching
  is not implemented in the current placeholder; complete and test that UI task
  before using this on a station TV. Without an initial cached schedule, show
  unavailable status rather than invented times.

See [architecture](docs/ARCHITECTURE.md), [API contract](docs/API.md), and
[implementation decisions](docs/BACKEND.md) for concurrency and operational limits.
