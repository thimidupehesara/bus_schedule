# AGENTS.md

Read this file before working in the repo. Update the status table and append a dated entry to the progress log at the end of every task.

## Project

A 24/7 public bus timetable for Mahiyanganaya Bus Stand, Sri Lanka. This is a timetable, not live tracking. Sinhala and English appear together on a wall TV mounted above eye level. Standing commuters, including elderly people, read it from several metres away. Wrong departure times are the worst failure.

The owner is a student and is often unavailable. Bus stand staff are non-technical. Their workflow must never require editing JSON or touching Cloudflare.

## Architecture

- One Cloudflare Worker, `mahiyanganaya-bus`, and D1 serve `/tv/`, `/admin/`, staff-only `/api/*`, public `/schedule.json`, and `/health`. The public schedule uses ETag/304 and no-cache.
- The TV is designed to run offline-first with IndexedDB and a service worker. It polls `/schedule.json` every three minutes and never talks to D1 directly. The offline engine keeps the last validated timetable and recovers the clock from successful responses.
- Staff sign in through Cloudflare Access email one-time PIN. The Worker independently verifies the Access JWT on every `/api/*` request. ADMIN and EDITOR roles live in the D1 `users` table.
- Staff edit a draft and publish separately. Published snapshots are immutable. Rollback creates a new version. Keep 50 snapshots. The backend supports rollback and the staff UI will expose it as a one-click action.
- Later Android task: a Trusted Web Activity (TWA) running Chrome 101 on the budget Q96L2 box, 1–2 GB RAM, no RTC battery and frequent power cuts.
- These architecture decisions are settled. Rejected options include Flutter/React Native, Neon/Postgres, Netlify and custom password/PIN login.

## TV offline design

- An online first visit precaches the TV shell and saves a validated timetable.
- A /tv/ service worker serves cached navigation after a three-second network timeout.
- The service worker leaves /schedule.json to the app.
- IndexedDB stores the raw schedule and validators; localStorage and memory are fallbacks.
- The TV displays the saved copy before checking for a new version.
- ETag polling retains the last valid version through errors and backs off up to ten minutes.
- The online event triggers a retry; successful responses restore normal polling.
- Server time offsets are session-only; an implausible clock shows the unfiltered board.
- The footer and banner distinguish an offline copy from an old timetable.
- Worker updates, the heartbeat watchdog, and synced daily reloads share a durable loop guard.

## Data rules

- Store 24-hour `HH:mm` in Asia/Colombo. `days` is the ISO weekday of departure. For an evening reader, after-midnight buses belong to the next calendar day.
- Display 12-hour time with English AM/PM and Sinhala පෙ.ව. (AM) / ප.ව. (PM).
- The contract lives in `packages/shared/src/schema.ts`. Preserve the structure of existing exported types.
- Server validation in `service-rules.ts` is authoritative. The admin UI reuses it. Service place labels require Sinhala script in `si` and Latin script in `en`.
- The TV mock deliberately uses English in both fields, loads in development with `?mock`, and is removed from production by tree shaking.

## Display rules

- Use a table, not cards. Aim for 4–6 rows per page, default 5. The schema continues to accept 2–6 for older snapshots. Keep pages stationary with no scrolling, a fade, and a “Page X / Y” indicator. Default dwell is 10 seconds.
- Grey out departed buses and label them “Departed / පිටත් විය” during `departedGraceMinutes` (default 15, max 60). Keep at most `MAX_DEPARTED_ROWS` (2) across the board.
- Tag the next calendar day's buses “Tomorrow / හෙට” and tint departures inside `soonThresholdMinutes`. Do not flash.
- Pair Sinhala with English. Bundle Sinhala and Inter fonts locally. Use the published safe area for TV overscan, with a 2% TV fallback when it is missing. Never label the screen “LIVE”.
- Include a staff-editable alert and a permanent footer with a QR code, short URL, page indicator and countdown. Credits and last-verified date are configurable and hidden by default.
- Force Asia/Colombo time, use the HTTP Date header for clock offset, and run the watchdog reload at 02:30 AM. If the clock appears wrong before syncing (year < 2026), show “Clock syncing...” and the full active schedule in `CLOCK_UNSYNCED` mode.

## Repo map and commands

- `packages/shared` — schema, validation, board engine, time formatting and bilingual labels.
- `apps/tv` — TV timetable table, development fixture and in-memory schedule polling.
- `apps/admin` — staff Vite app, currently a placeholder.
- `workers/api` — Cloudflare Worker, D1 migrations, API and local tools.

Root commands, all invoked with `npm run <script>`:

| Script                                                    | Purpose                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `typecheck`, `lint`, `test`                               | TypeScript, ESLint and Vitest                                                |
| `test:smoke`                                              | Isolated local Wrangler/D1 smoke checks                                      |
| `build`, `assemble`                                       | Build all packages and run Wrangler dry-run, or assemble the app assets only |
| `dev:tv`, `dev:admin`                                     | Vite development servers                                                     |
| `dev:api`                                                 | Assemble and run the local single-origin Worker                              |
| `validate:sample`                                         | Validate the shared sample schedule                                          |
| `user:create`, `user:list`, `user:disable`, `user:enable` | Manage staff accounts locally                                                |
| `db:migrate:local`, `db:seed:local`                       | Migrate or seed local D1                                                     |
| `db:seed:remote` | Owner-only sample seed with interactive confirmation |
| `deploy`                                                  | Owner-only first deployment command. AI tools must never run it              |

## Rules for AI tools

- Work on a feature branch. Never push, deploy, run `wrangler d1 create`, or use `--remote`.
- Never commit secrets or `.dev.vars`. State the reason for any new dependency.
- Support Chrome 52+ on the Q96L2 with a legacy bundle and an ES2015 service worker.
- Keep typecheck, lint, tests and build green. Before handing over, update the table below and append to the progress log.

## Status

| Work                                                                            | Status  |
| ------------------------------------------------------------------------------- | ------- |
| Monorepo and shared schedule contract                                           | Done    |
| Backend auth, draft, publish, rollback and public schedule                      | Done    |
| Shared strict validation                                                        | Done    |
| Board engine, 12-hour formatting and development mock                           | Done    |
| Bilingual labels and departed row cap                                           | Done    |
| TV table UI                                                                     | Done    |
| TV offline engine, polling, clock recovery and watchdog                         | Chrome 52 compatibility restored locally; real box verification pending |
| Staff admin UI with hour/minute/AM-PM picker and Access-session-expired message | Pending |
| Passenger mobile page for QR code                                               | Pending |
| Kotlin launcher                                                                 | Pending |
| First deploy and remote D1 migration | Done |
| Remote sample seed CLI | Implemented; owner must run |
| Public TWA Asset Links route | Implemented; owner must fill signing details and deploy |

The Worker is deployed at https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev. The remote D1 database `mahiyanganaya-bus-db` exists and its migration is applied. The owner seeded a sample snapshot and the public `/schedule.json` returns 200.

The admin time picker must never use free-text time boxes. The backend PR was merged into main at `af9258c`. The local `feature/backend-fixes` branch exists at `75975db` and its commit is included in `feature/schedule-engine` and this feature branch. Local main does not include that commit. The locally known origin/main includes both the backend fixes and the schedule engine. The board labels branch started from the latest local `feature/schedule-engine` tip (`3386654`), which matched the local tracking ref for origin/feature/schedule-engine.

## Open owner items

- Have a native speaker review all Sinhala text and place spellings, especially `labels.ts`, `known-places.ts`, weekday names in `time-format.ts`, and the differing default station and sample names.
- Decide if Sinhala AM/PM belongs before or after the number. `SI_TIME_SUFFIX_AFTER_NUMBER` currently puts it after.
- Owner to test Cloudflare Access on a throwaway Worker. Verify that `/schedule.json`, `/tv/` and `/health` stay public while `/admin/*` and `/api/*` are protected on workers.dev. If this fails, use a custom domain or split the public and protected routes into two Workers.
- Name the second ADMIN (the owner's father), decide who maintains the staff email allow-list, and set the real `mobileUrl`.
- Backend review verified in this branch: expired alerts are disabled on rollback with a bilingual notice, forced JWKS refresh has a 60-second cooldown per issuer, duplicate email returns `409 DUPLICATE_EMAIL`, and only `/workers/api/public/` is ignored by the public-directory rule.
- If the owner wants 30 minutes for the default departure grace, change that default in `DEFAULT_DISPLAY_SETTINGS`. The allowed range already supports it.

## Progress log

- 2026-11-11 — Scaffolded monorepo and shared data contract (`acef6de`).
- 2026-11-11 — Implemented the Worker, D1, Access auth, validation and schedule publishing (`0aa2505`).
- 2026-11-12 — Fixed historical rollback, JWKS cooldown, duplicate emails and the public ignore rule (`75975db`).
- 2026-11-12 — Added Colombo board engine, 12-hour formatting and TV development mock (`3386654`).
- 2026-11-12 — Widened departure grace range, updated defaults, capped departed rows and added bilingual labels and this handover.

- 2026-11-12 — Built and browser-checked the TV table on feature/tv-table-ui. TV config defines COLUMNS, SHOW_BAY_COLUMN (false), and CREDITS (placeholder). Preview flags: ?mock=1, &now=2026-11-12T23:50, &rows=3–6, &alert=critical, and ?unavailable=1. The QR encoder supports serialized URLs up to 106 bytes. Physical viewing-distance and Android box checks remain open. See [TV screenshots](docs/screenshots/README.md).

- 2026-11-12 — Polished the TV header and footer on feature/tv-polish. The Sinhala title is one line, the clock stacks English over Sinhala meridiem, and the footer shows the Thimidu credit and a dwell countdown. Reduced motion uses a static ring with whole seconds. A temporary local browser check verified an 80-character Sinhala destination with a via line at 1920×1080 and 1280×720.

- 2026-11-12 — Updated TV proportions and text fitting on feature/tv-polish-2. The TV fills the viewport, falls back to a 2% safe area, and gives the clock and two-line date more room. Arrival and departure use the same size; From values are Sinhala only. Via and empty credits are hidden by default. Verified long names and title with 3, 5 and 6 rows at 1920×1080, 1366×768 and 1280×720.

- 2026-11-13 — Added the guarded owner-only sample seed and public code-served TWA Asset Links route on feature/remote-seed. Recorded the existing deployment and remote D1 migration and updated the TV target to Chrome 101 in a TWA.
- 2026-11-12 — TV display polish (feature/tv-polish-3). Written by Antigravity; previous branches were written by Codex. Changes: (1) FitText rewrite — pure `computeFit` in fitText.ts (unit-tested), re-measures on layout change, fonts.ready, and debounced resize (150 ms); scales to TEXT_MIN_SCALE=0.65, then ellipsis-truncates; Sinhala diacritics never clipped (line-height ≥ 1.45, overflow hidden on the cell box only). (2) Countdown bar — circular ring replaced by an 8 px full-width green progress line at the absolute screen bottom using CSS scaleX transition; reduced-motion shows static bar + whole-seconds text from one timer. (3) Departed rows — departure cell shows "පිටත් විය · Departed" badge (from LABELS.departed) instead of the AM/PM meridiem. (4) Header — AM/PM block enlarged to 1.4 rem bold; gap between title and clock block is at least 3 vw; 1.5 vh gap between masthead and table header row. (5) Stress fixture — `?mock=1&stress=1` loads 25-char English and 80-char Sinhala names, tree-shaken from production. typecheck, lint, 175 tests, build and production grep all pass.

- 2026-11-12 — TV TWA test & static schedule loading (feature/twa-tv-schedule). [DONE]
  (1) Exported mock schedule into valid apps/tv/public/schedule.json.
  (2) Updated apps/tv/src/data/useSchedule.ts to fetch `${import.meta.env.BASE_URL}schedule.json` by default, preserved `?mock=1` support, and captured error message.
  (3) Updated apps/tv/src/App.tsx to display caught error.message in small muted monospace text on timetable unavailable screen using flexbox without gap-* or CSS Grid.
  (4) Preserved @vitejs/plugin-legacy (targets: chrome >= 52), abortcontroller-polyfill, and base: '/tv/'.
  (5) Built apps/tv production assets and copied to T:\New folder\bus-twa-test\public\tv.
  (6) Cleaned up T:\New folder\bus-twa-test\src\index.ts (removed ?mock=1 injection/redirect, direct asset fetch, kept assetlinks.json) and deployed via wrangler. Verified live endpoints for /tv/schedule.json, /tv/, and assetlinks.json.

- 2026-11-13 — Repaired the offline engine merge. Restored live schedule polling, saved timetable startup, clock recovery, guarded reloads and service worker generation while retaining the TV layout and Worker configuration.

- 2026-11-13 — Restored the TV legacy bundle, added the manifest and icons, removed unsupported service worker syntax, and paused automatic reloads while offline.

- 2026-11-13 — Restored row-based sizing fallbacks, centered the page indicator and kept one bottom bar. The live four-service sample fits on one page. The bar stays steady on a single page and counts down on rotating pages.
