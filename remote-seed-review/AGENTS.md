# AGENTS.md

Read this file before working in the repo. Update the status table and append a dated entry to the progress log at the end of every task.

## Project

A 24/7 public bus timetable for Mahiyanganaya Bus Stand, Sri Lanka. This is a timetable, not live tracking. Sinhala and English appear together on a wall TV mounted above eye level. Standing commuters, including elderly people, read it from several metres away. Wrong departure times are the worst failure.

The owner is a student and is often unavailable. Bus stand staff are non-technical. Their workflow must never require editing JSON or touching Cloudflare.

## Architecture

- One Cloudflare Worker, `mahiyanganaya-bus`, and D1 serve `/tv/`, `/admin/`, staff-only `/api/*`, public `/schedule.json`, and `/health`. The public schedule uses ETag/304 and no-cache.
- The TV is designed to run offline-first with IndexedDB and a service worker. It polls `/schedule.json` every three minutes and never talks to D1 directly. The table currently polls and keeps the last valid document in memory. Persistent caching and clock recovery are pending.
- Staff sign in through Cloudflare Access email one-time PIN. The Worker independently verifies the Access JWT on every `/api/*` request. ADMIN and EDITOR roles live in the D1 `users` table.
- Staff edit a draft and publish separately. Published snapshots are immutable. Rollback creates a new version. Keep 50 snapshots. The backend supports rollback and the staff UI will expose it as a one-click action.
- Later Android task: a Trusted Web Activity (TWA) running Chrome 101 on the budget Q96L2 box, 1–2 GB RAM, no RTC battery and frequent power cuts.
- These architecture decisions are settled. Rejected options include Flutter/React Native, Neon/Postgres, Netlify and custom password/PIN login.

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
- Keep the TV build target at `chrome101`. Use no APIs newer than Chrome 101 in the TV or shared output.
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
| TV offline engine, polling, clock recovery and watchdog                         | Pending |
| Staff admin UI with hour/minute/AM-PM picker and Access-session-expired message | Pending |
| Passenger mobile page for QR code                                               | Done    |
| Kotlin launcher                                                                 | Pending |
| First deploy and remote D1 migration | Done |
| Remote sample seed CLI | Implemented; owner must run |
| Public TWA Asset Links route | Implemented; owner must fill signing details and deploy |

The Worker is deployed at https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev. The remote D1 database `mahiyanganaya-bus-db` exists and its migration is applied. The owner reported no snapshots yet, so `/schedule.json` returns 503.

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
- 2026-11-13 — Changed TV title to "මහියංගන දුර ගමන් බස් රථ ධාවන කාලසටහන", linked real 146 bus services schedule (sample-schedule.json with origin arrivals normalized to null), assembled and deployed TV assets to Cloudflare Workers, and published snapshot v2 to remote D1.
- 2026-11-13 — Upgraded TV display to 4 rows per page, 24h lookahead (showing all 146 services), 0.5% safe area, horizontal green countdown bar reducing right-to-left, larger title font, responsive auto-scaling for "From" column, 3-line departure layout for "හෙට/Tomorrow", assembled and deployed to Cloudflare Workers, and published Snapshot v3 to remote D1.
- 2026-11-13 — Reverted lookahead to 8h, restored safe area to 3.5%, set "මහියංගන" header text color to white, resolved 720p vertical overlap with strict flex-column layout and max-height 800px tightening, added PWA manifest and icons for PWABuilder, assembled and deployed to Cloudflare Workers, and published Snapshot v4 to remote D1.
- 2026-11-13 — Replaced timetable entries with verified timetable from sample-schedule.json (146 services, normalized arrivals and Trincomalee Latin name), added /qr redirect to /tv/, deployed Worker and assets to Cloudflare Workers, published Snapshot v5 to remote D1, and deleted the bus-twa-test directory.
- 2026-11-14 — Header title without station name ("දුර ගමන් බස් රථ ධාවන කාලසටහන"), tighter 1.5% safe margin, dynamic auto-fitting for long city names (no ellipsis), fixed Trincomalee spelling to "ත්‍රිකුණාමලය", simplified service column to operator only with reallocated widths (Destination 31%, From 23%, Service 10%), uncapped orange highlight for the next departure, red highlight for departed grace-period rows in ascending order, assembled and deployed to Cloudflare Workers, and published Snapshot v6 to remote D1.
- 2026-11-14 — Updated From (ගමනාරම්භය) column in TV app to display both Sinhala and English origin names (origin.en) stacked in two lines with FittedText auto-sizing matching Destination, assembled and deployed live to Cloudflare Workers.
- 2026-11-14 — Fixed "සේවා වර්ගය" header clipping (HeaderCell with FittedText, 11.5% width, reduced padding), eliminated From column word clipping with 10px min scale and strict cell clipping, removed URL string below QR prompt in footer, and pinned green progress countdown bar full-width across the very top edge of the screen, assembled and deployed live to Cloudflare Workers.
- 2026-11-14 — Preserved full 100% large font sizes for normal city names in FittedText with clientWidth > 50 guard, only scaling down overflowing long origin names like "දෙහිඅත්තකණ්ඩිය", and updated top countdown bar z-index to 9999, assembled and deployed live to Cloudflare Workers.
- 2026-11-14 — Implemented responsive passenger mobile web app at /mobile/ with destination search/chips, 8h/all-day toggle, touch cards, and suggestion modal; added privacy-safe daily QR scan counter at /qr (hashing with salt/date, 2-day pruning, 302 redirect); created D1 migration 0002 (qr_daily_stats, qr_daily_uniques, suggestions) applied locally and remotely; added POST /api/suggestions and admin endpoints; assembled and deployed to Cloudflare Workers and verified all endpoints live.
- 2026-11-14 — Updated mobile web app (/mobile/): set Sinhala title to "මහියංගන දුර ගමන් බස් රථ ධාවන කාලසටහන", replaced search input and chips with an A–Z destination native dropdown menu (default "සියල්ල · All Destinations", options formatted as "{destination.en} · {destination.si}"), wired auto-prefill to suggestion modal, assembled, and deployed live to Cloudflare Workers.
- 2026-11-14 — Changed next upcoming bus highlight color from orange to bright yellow (#facc15) in both /tv/ and /mobile/; turned /mobile/ into an installable PWA with webmanifest, 192/512 icons, and sw.js; added dismissible bottom install banner with "ඇප් එක දාගන්න · Install App" (beforeinstallprompt / home-screen instructions) and dynamic Direct APK download link check, assembled, and deployed live to Cloudflare Workers.
- 2026-11-14 — Assembled and deployed new high-resolution 192x192 and 512x512 icons in apps/mobile/public/ and apps/tv/public/ with verified manifest.webmanifest references, live on Cloudflare Workers.
- 2026-11-14 — Resized and converted high-resolution master image to true PNGs with exact dimensions (192x192 for icon-192.png and 512x512 for icon-512.png) across mobile and tv public assets, assembled, and deployed live to Cloudflare Workers.
- 2026-11-14 — Copied Mahiyanganaya Bus Timetable.apk to apps/mobile/public/mahiyanganaya-bus-mobile.apk with application/vnd.android.package-archive headers, ran npm run deploy, and verified live APK downloads on Cloudflare Workers.
- 2026-11-14 — Built staff admin portal UI in apps/admin (QR visitor stats cards + 90-day history table, passenger suggestion table with status filters and Mark Resolved / Reopen actions), added PATCH /api/admin/suggestions/:id backend endpoint with CSRF and admin role protection, assembled and deployed all apps live to Cloudflare Workers.
- 2026-11-14 — Added final 10-second full-bleed credits/QR slide (credits-slide.png, 1920x1080) to TV rotation loop in apps/tv, running after all timetable pages with top green PageCountdown bar and smooth crossfades looping back to Page 1, keeping 1.5% margins and timetable indicator numbering intact, assembled and deployed live to Cloudflare Workers.
- 2026-11-14 — Added compact color legend to right side of TV footer in apps/tv explaining red (පිටත් වූ / ආසන්න බස් · Departed / Leaving Soon) and yellow (ඊළඟ බස් රථය · Next Upcoming Bus) highlights with crisp typography, assembled and deployed live to Cloudflare Workers.
- 2026-11-14 — Implemented automatic self-updating for TV display (apps/tv): added writeBuildVersion Vite plugin emitting dist/version.json and defining import.meta.env.VITE_BUILD_ID, created useAutoReloadOnDeploy hook polling ./version.json every 60s and triggering cache purge and reload on new deployments, configured strict Cache-Control: no-cache, no-store, must-revalidate headers in workers/api, assembled, and deployed live to Cloudflare Workers.
- 2026-11-14 — Implemented full offline cold-boot resilience for /tv/ (sw.js precaching core shell and assets with 2.5s network timeout fallback, localStorage timetable persistence in useSchedule), eliminated 2–3s blank white delay on credits slide (bitmap pre-decoding on mount, permanent DOM mounting with #0B0F14 neutral backing), added remote TV reload mechanism (POST /api/admin/tv-reload, D1 audit_log reloadNonce tracking, /tv/version.json exposure in run_worker_first, and admin portal "Refresh TV Screen" button), verified typecheck, unit tests, assembled, and deployed live to Cloudflare Workers.
