MAHIYANGANAYA LONG-DISTANCE BUS TIMETABLE SYSTEM
============================================================
Repository guide | Inspected: 16 November 2026 (Asia/Colombo)
Git repository root: T:\New folder\
Application workspace: T:\New folder\remote-seed-review\

1. PROJECT OVERVIEW
------------------------------------------------------------
A public, bilingual Sinhala/English timetable for Mahiyanganaya Bus
Stand, Sri Lanka. It serves three audiences:

* Wall TV: a large, stationary departure table readable from several
  metres away, including by elderly commuters.
* Commuters: a responsive mobile website, installable PWA, and a
  separately packaged downloadable Android APK.
* Staff: an authenticated dashboard for editing, reviewing and
  publishing timetables, alerts, display settings and staff accounts.

This is scheduled transport information, not GPS/live vehicle tracking.
Departure labels are calculated from scheduled times and the clock;
they are not confirmation that a bus has physically arrived or left.
Staff work through the dashboard without editing JSON or Cloudflare.

The owner's verified schedule contains 136 bilingual services. A public
read on 16 November 2026 confirmed live version 35 with 136/136 active.
The supplied admin screenshot also shows version 35 and All (136).
These are dated observations, not permanently fixed counts or versions.
Operational accuracy still depends on staff verifying departure times.

Operators supported: CTB and PVT (Private).
Service categories supported: NORMAL, SEMI_LUXURY, LUXURY and EXPRESS.
The public snapshot inspected contains NORMAL and LUXURY entries;
support for a category does not mean that category is currently used.

============================================================
VISUAL PREVIEWS & APPLICATION SCREENSHOTS
============================================================

1. Wall TV Departure Timetable (/tv/)
   Mounted above eye level at Mahiyanganaya Bus Stand. High-contrast,
   stationary 4-row layout with bilingual Sinhala/English destinations,
   12-hour departure/arrival times, live next-bus tinting, and QR code:

   ![Wall TV Departure Timetable](<./Screenshot 2026-11-16 111040.png>)

2. Commuter Mobile PWA & Direct Android APK Download (/mobile/)
   Responsive mobile web application with bilingual search, destination
   filtering, departure status, and one-click Android APK installer:

   ![Commuter Mobile Web App](<./WhatsApp Image 2026-11-16 at 11.03.06 AM (1).jpeg>)
   ![Direct APK Download Modal](<./WhatsApp Image 2026-11-16 at 11.03.06 AM.jpeg>)

3. Staff Admin Dashboard (/admin/)
   Authenticated Cloudflare Access portal for non-technical staff: draft
   timetable editing, bulk spreadsheet importing, safety validation gates,
   and 1-click publishing to live TV displays:

   ![Staff Admin Dashboard](<./Screenshot 2026-11-16 111125.png>)


2. PRODUCTION URLS AND PUBLIC ENDPOINTS
------------------------------------------------------------
Production origin:
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev

Requested main commuter address:
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/
  IMPORTANT: returned HTTP 404 during this inspection. The checked-in
  assembly does not place a mobile index or redirect at the origin root.

Working commuter/mobile address (HTTP 200 during inspection):
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/mobile/

Wall TV display:
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/

Staff admin dashboard:
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/admin/

Requested direct Android APK address:
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/mahiyanganaya-bus-mobile.apk
  IMPORTANT: a HEAD request returned HTTP 404 during inspection.

Working Android APK download (HEAD returned HTTP 200):
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/mobile/mahiyanganaya-bus-mobile.apk
  Served as application/vnd.android.package-archive with an attachment
  filename. Assembly places it under /mobile/, not the origin root.

Public timetable (HTTP 200 during inspection):
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/schedule.json
  Published snapshot only; Cache-Control: no-cache; ETag and conditional
  304 responses. Date/X-Server-Time headers support clock correction.
  If no snapshot exists, returns 503 NOT_PUBLISHED with Retry-After: 60.

Public health/time probe (HTTP 200 during inspection):
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/health
  Returns time and serverTimeMs. This is not a full database health test.

Public TV control/version metadata (HTTP 200 during inspection):
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/version.json
  Includes buildId, reloadNonce/forceReloadToken, serverTimeMs and tvHold.
  Uses no-store/no-cache headers; the TV service worker bypasses caching.

QR handoff:
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/qr
  Records daily scan statistics and redirects to /mobile/ with HTTP 302.

Android Digital Asset Links:
https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/.well-known/assetlinks.json
  Code-served association between this origin and Android package/signing
  identities. Source: workers/api/src/assetlinks.ts.

URL statuses above are point-in-time public checks. No staff session,
private dashboard data, production writes or deployment were used.

3. ARCHITECTURE
------------------------------------------------------------
                    Cloudflare public origin
                              |
       +----------------------+----------------------+
       |                      |                      |
  /tv/ Wall TV          /mobile/ + APK          /admin/ Staff UI
  React + SW            React + PWA            Cloudflare Access
  cached timetable      destination filter     email one-time PIN
       |                      |                      |
       +---- GET /schedule.json --------------------|-----+
       |                      |                      |     |
       | GET /tv/version.json |       authenticated /api/* |
       |                      |          draft/preview/    |
       |                      |          publish/rollback  |
       v                      v                      v     v
       +---------------------------------------------------+
       | Single Cloudflare Worker: mahiyanganaya-bus         |
       | Static ASSETS + routes + JWT/CSRF + validation      |
       | Public POST /api/suggestions is a special exception|
       +--------------------------+------------------------+
                                  | DB binding
                                  v
       +---------------------------------------------------+
       | Cloudflare D1 (SQLite): mahiyanganaya-bus-db         |
       | users | draft_services/meta | snapshots/live_pointer|
       | audit_log | QR stats/uniques | suggestions | settings|
       +---------------------------------------------------+

Shared TypeScript package supplies schema, bilingual labels, time
formatting, service rules and the schedule board engine. Browsers never
connect directly to D1. Only published snapshots reach public clients.

Build flow:
  packages/shared -> three Vite builds -> workers/api/public/
                                      |-- tv/
                                      |-- admin/
                                      `-- mobile/ (includes APK)
  Worker TypeScript + assembled assets -> Wrangler -> Cloudflare

4. LANGUAGES, FRAMEWORKS AND TOOLING
------------------------------------------------------------
Frontend:
* TypeScript and React 18, ReactDOM, Vite 6, HTML5 and CSS3.
* Responsive clamp() typography, CSS layout and fitted bilingual text.
* Tailwind CSS/PostCSS/Autoprefixer tooling in the TV and admin packages.
* Noto Sans Sinhala Unicode font and Inter bundled locally in the TV
  through @fontsource, avoiding a runtime font CDN dependency.
* Web app manifests and service workers for TV/mobile installation and
  caching. Cache Storage plus localStorage are the implemented caches;
  IndexedDB mentioned in early architecture notes is not implemented.
* Admin dynamically imports the bundled xlsx library for spreadsheet
  parsing; it does not require an external spreadsheet-script CDN.

Backend/database:
* TypeScript in Cloudflare Workers' edge serverless runtime.
* Wrangler 4 tooling; compatibility_date = 2026-11-11.
* Cloudflare D1, a serverless SQLite database, bound as DB.
* Static assets bound as ASSETS; no separate frontend hosting required.
* SQL migrations live under workers/api/migrations/.

Shared/runtime quality:
* Zod 3 schemas and authoritative custom service validation.
* TypeScript 5, ESLint 9, Vitest 2 and tsx development tools.
* Node.js 24 (.nvmrc; package requires >=24), npm workspaces. Existing
  setup documentation recommends npm 11; integration tests use node:sqlite.
* TV output explicitly targets chrome101 for the budget Android TV box.

5. TIMETABLE MODEL AND ENGINEERING FEATURES
------------------------------------------------------------
Data contract:
  packages/shared/src/schema.ts is the shared contract. Services have
  bilingual destination/origin, optional via, operator, serviceType,
  arrival, departure, optional tripStart/destinationArrival/bay, days
  and active. Up to 300 services are accepted, with unique UUID IDs.

  Times are stored as 24-hour HH:mm in Asia/Colombo. Public presentation
  uses 12-hour time with AM/PM and පෙ.ව./ප.ව. Arrival means arrival at
  Mahiyanganaya stand, not arrival at the final destination. Nullable
  arrival is valid for services starting at the stand.

  Weekdays accept ISO numbers 1-7 and MON-SUN codes. After-midnight
  departures belong to the next calendar day relative to an evening
  reader; days always identify the actual departure weekday.

Validation and import:
  service-rules.ts is authoritative and reused by admin. Place labels
  require Sinhala script in si and Latin script in en. Known-place
  normalization, duplicate/route checks and warnings help staff review.
  The admin importer accepts Excel (.xlsx/.xls), CSV, TSV/text and JSON
  variants, with bilingual column recognition and automatic mapping.
  Daily/Every day/blank days normalize to all seven weekdays; supported
  weekday/weekend labels map to subsets. Missing active defaults true.
  Staff can bulk-add rows, replace/import services, activate all buses,
  inspect rejection reasons and use duplicate-cleanup helpers.

Draft vs. live:
  Edits change draft data only. Preview validates and shows the difference
  from the published snapshot. Publishing creates a new immutable
  snapshot and updates the live pointer. Rollback creates another version
  rather than mutating historical content. Retention keeps 50 snapshots
  with live/latest protection. D1 batches and revision guards protect
  concurrent writes; audit records retain operational history.
  Expired rollback alerts are disabled with a bilingual notice.

CPU-limit work:
  The progress log records publish-preview HTTP 503/exceededCpu at a
  10 ms budget on 15 November. Changes reduce exception-heavy weekday
  parsing, reuse validation, index route/bay comparisons, skip irrelevant
  day combinations, cache nearest-place matching and count busy hours in
  one pass. This documents the incident and implementation, not a new
  benchmark or a promise that every request always finishes under 10 ms.

Wall TV:
  ![Wall TV Timetable Interface](<./Screenshot 2026-11-16 111040.png>)

  Fixed four-row page capacity, 10-second dwell, 300 ms fade, stationary
  pages, Page X / Y and a green countdown bar. The final partial page can
  contain fewer buses. A credits/QR image slide follows timetable pages.
  Columns: Destination, Departure, Arrival, From and Service/operator.
  Dynamic fitting preserves long Sinhala/English names; normal timetable
  pages have a QR footer and red/yellow departure-status legend.
  Next bus is highlighted yellow; departed/leaving-soon styling uses red.
  Tomorrow / හෙට marks next-calendar-day departures. Departed grace and
  soon thresholds control time-derived statuses; departed rows are capped
  at two across the board. The display does not flash or claim GPS data.

  The observed live settings were: 4 rows, 10-second dwell, 300 ms fade,
  15-minute departed grace, 15-minute soon threshold, 8-hour lookahead,
  1.5% safe area and 180-second schedule polling. The shared schema still
  permits 2-6 rows and its default is 5; the actual TV overrides this to 4.

Offline, updates and clock recovery:
  The TV persists its last validated schedule in localStorage and retains
  it when polling fails. The service worker caches the shell/assets and
  schedule, with a 2.5-second navigation fallback. Offline use requires a
  prior successful load; cached timetables may be older than production.
  Version/control checks run every 2.5 seconds while online, allowing
  deployment refresh, manual staff refresh and page/credits hold control.
  Schedule polling is separate (normally 180 seconds).
  Server time from JSON or HTTP headers is anchored to performance.now().
  A pre-2026 device clock without sync shows a syncing message and a full
  active schedule without misleading departed highlights. Reconnection
  probes the server again. This supports boxes without an RTC battery.
  reloadAtLocalTime = 02:30 exists in the contract/live settings, but no
  scheduled 02:30 watchdog execution was found in the current TV source.
  Do not infer that behavior from the older status table alone.

Commuter mobile:
  ![Commuter Mobile Web App](<./WhatsApp Image 2026-11-16 at 11.03.06 AM (1).jpeg>)
  ![Direct APK Download Prompt](<./WhatsApp Image 2026-11-16 at 11.03.06 AM.jpeg>)

  Bilingual A-Z destination dropdown, Next 8 Hours/Full Day views, route
  cards, departure/arrival times, operator badges and next-bus emphasis.
  Includes passenger feedback, install prompt/home-screen guidance and
  an APK download link. Portrait standalone PWA manifest uses 192/512
  icons. Local schedule persistence and a service worker provide caching.

Staff dashboard:
  ![Staff Admin Dashboard](<./Screenshot 2026-11-16 111125.png>)

  Bus List, Publish to TV, Alert Banner, TV Presentation Control, Staff &
  Users, Display Settings, Reports & Passenger Feedback. Supports search,
  day/operator/status filters, create/edit/duplicate/delete, bulk import,
  diff/rejection review and history/rollback functions. Time entry uses
  hour/minute/AM-PM selectors rather than free-text time fields. Access
  expiration and account errors are presented with sign-in actions.

6. HOSTING, AUTHENTICATION AND API
------------------------------------------------------------
Worker: mahiyanganaya-bus
D1 database: mahiyanganaya-bus-db
Configuration: remote-seed-review/workers/api/wrangler.toml

Cloudflare Access email one-time PIN is the staff authentication layer.
The intended Access policy protects /admin/ and staff API routes. The
Worker independently validates the JWT signature/issuer/audience/expiry
and checks the D1 user allow-list, enabled state and ADMIN/EDITOR role.
It accepts Access assertion headers/cookies and supported bearer tokens.
Staff writes enforce same-origin CSRF checks and JSON handling. ADMIN
restrictions apply to account management and selected settings/import
operations. Database triggers protect the last active admin and user cap.

Exception: POST /api/suggestions is deliberately public and routed before
staff authentication. External Access rules must preserve this exception
and leave public TV/mobile/schedule/health/QR/asset-links routes accessible.
The repository alone cannot prove the deployed Zero Trust policy setup;
this task did not sign in or audit that external configuration.

Useful staff API groups (see workers/api/src/index.ts for exact methods):
  GET  /api/auth/me                  session/identity diagnostics
  GET  /api/draft                    current editable document
  POST /api/publish/preview          validation and diff
  POST /api/publish                  new live snapshot
  GET  /api/snapshots                snapshot history
  POST /api/rollback                 publish historical content as new version
  POST /api/draft/import             bulk import
  POST /api/draft/activate-all        activate services
  POST /api/draft/deduplicate         duplicate cleanup
  POST /api/draft/discard            discard draft edits
       /api/draft/alert, /display, /station, /last-verified
       /api/admin/users              staff account management
       /api/admin/qr-stats            QR reports
       /api/admin/suggestions         passenger feedback management
  POST /api/admin/tv-reload           refresh TV
  GET/POST /api/admin/tv-hold         presentation control

Migration inventory:
  0001_init.sql: users, draft_services, draft_meta, snapshots, live_pointer,
    audit_log, mutation_guard, indexes and user-protection triggers.
  0002_mobile_qr_suggestions.sql: qr_daily_stats, qr_daily_uniques,
    suggestions and indexes. QR unique identifiers use a dated salted hash;
    short-lived unique records are pruned, rather than retaining raw IPs.
  0003_settings.sql: key/value settings for presentation control.

7. ANDROID APK / TWA PACKAGING: EVIDENCE AND LIMITS
------------------------------------------------------------
The repository contains exported PWABuilder Android delivery packages.
Each of the three package folders includes Readme.html pointing to
https://docs.pwabuilder.com/#/builder/android?id=publish and contains:
  Mahiyanganaya Bus Timetable.apk
  Mahiyanganaya Bus Timetable.aab
  assetlinks.json
  signing.keystore and signing-key-info.txt (private local signing files)

Package identities recorded by their assetlinks.json files:
  Mahiyanganaya Mobile APK/
    lk.mahiyanganaya.busmobile
  Mahiyanganaya TV APK/
    lk.mahiyanganaya.busdisplay
  Mahiyanganaya Bus Timetable - Google Play package/
    lk.mahiyanganaya.busdisplay (despite the generic folder title)

The application is delivered as a web/PWA experience with Android TWA
packaging, consistent with the TV build configuration and Android Digital
Asset Links. The Worker publishes associations for both package IDs and
public certificate fingerprints from these packages.

Exact distribution linkage was verified with SHA-256:
  Mahiyanganaya Mobile APK/Mahiyanganaya Bus Timetable.apk
  remote-seed-review/apps/mobile/public/mahiyanganaya-bus-mobile.apk
Both are identical (3,276,196 bytes), SHA-256:
D468C3927B3B05273CBB46C92A3755853680228DCB46C25B59AB1655C22B833B

The checked-in npm pipeline copies this existing APK; it does not compile
Android. No Gradle project/build.gradle, Gradle wrapper, AndroidManifest
source, Bubblewrap twa-manifest.json or Android build script was found
outside excluded dependency/cache folders. Thus the exact generator
version, original packaging options, SDK versions and Gradle/Bubblewrap
invocation cannot be reconstructed from this checkout. No unverified
Bubblewrap or Gradle command is presented as the original build process.
android/README.md only says the Kotlin launcher is a later task; it is
not an implemented native launcher project.

For an owner-managed future rebuild, recover the original PWABuilder
configuration and correct signing identity, build the appropriate mobile
or TV package, and verify the output and asset-link association before
replacing the mobile public APK. Then assemble/deploy the web distribution.
APK is the direct-install artifact; AAB is the store-upload artifact.
The presence of an AAB does not establish Google Play publication.
The phone download screenshot demonstrates a download prompt, not a
successful Android installation (the pictured browser is on an iPhone).

Signing file contents/passwords were not read or included in this README.
Keep signing material and .dev.vars private; retain the existing ignores.
Public Digital Asset Links fingerprints are certificate identifiers, not
keystore passwords. No credentials are needed for ordinary commuters.

8. REPOSITORY AND MONOREPO STRUCTURE
------------------------------------------------------------
T:\New folder\                         Git root (not the npm workspace)
|-- .git/                              repository metadata
|-- .gitignore                         root exclusions
|-- README.txt                         this guide
|-- remote-seed-review/                 npm workspace (see below)
|-- Mahiyanganaya Mobile APK/           exported mobile APK/AAB + association
|-- Mahiyanganaya TV APK/               exported TV APK/AAB + association
|-- Mahiyanganaya Bus Timetable - Google Play package/
|                                      exported busdisplay APK/AAB package
|-- Bus TimeTable.pdf                   timetable reference document
|-- Mahiyanganaya_Bus_Timetable.xlsx    spreadsheet input/reference
|-- mahiyanganaya_buses_clean.csv       CSV input/reference
|-- mahiyanganaya_schedule.json         136-service JSON document
|-- sample-schedule.json                136-service JSON document
|-- Add an admin.txt                    owner setup notes (not reproduced)
|-- qr-code.jpg                         QR image
|-- Screenshot 2026-11-16 111040.png    TV screenshot
|-- Screenshot 2026-11-16 111125.png    admin screenshot
|-- WhatsApp Image 2026-11-16 at 11.03.06 AM (1).jpeg
|-- WhatsApp Image 2026-11-16 at 11.03.06 AM.jpeg
|-- signing.keystore / signing-key-info.txt  private local signing artifacts
`-- .npm-cache/, .vite/, .wrangler/, remote-seed-*.log and local artifacts
                                       generated tooling/history, not source

remote-seed-review/
|-- package.json / package-lock.json    npm workspaces and dependency lock
|-- .nvmrc                             Node 24
|-- AGENTS.md                          project rules/status/progress history
|-- README.md                          older guide; some placeholder text stale
|-- apps/
|   |-- tv/                            TV React app, clock/cache/control hooks
|   |   |-- src/                       App, FittedText, pagination, QR, mock/tests
|   |   |-- public/                    sw.js, manifest, icons, credits images
|   |   `-- vite.config.ts             /tv/ base, Chrome 101, build version
|   |-- admin/                         staff React UI and import-timetable.ts
|   |   `-- src/__tests__/              timetable importer tests
|   `-- mobile/                        commuter React app
|       `-- public/                    PWA assets + mahiyanganaya-bus-mobile.apk
|-- packages/shared/
|   |-- src/schema.ts                  schedule contract and Zod validation
|   |-- src/service-rules.ts           authoritative service validation
|   |-- src/board.ts                   departure/day/status/pagination engine
|   |-- src/time-format.ts             Colombo/12-hour/bilingual formatting
|   |-- src/labels.ts, known-places.ts  bilingual labels and place normalization
|   |-- src/sample-schedule.json       separate 145-service development seed
|   |-- src/__tests__/                 schema/engine/rules/formatting tests
|   `-- scripts/validate-sample.ts      seed validator
|-- workers/api/
|   |-- wrangler.toml                  Worker, static assets, D1 and Access vars
|   |-- src/index.ts                   public and staff HTTP routes
|   |-- src/auth.ts, http.ts           JWT, identity, HTTP/CSRF/error helpers
|   |-- src/store.ts, schedule.ts      D1 snapshots, draft, diff/validation
|   |-- src/assetlinks.ts              public Android origin associations
|   |-- src/__tests__/                 API/auth/DB/QR/control integration tests
|   |-- migrations/                   three ordered SQL migrations
|   |-- scripts/                      local users/seed/smoke + owner remote tools
|   `-- public/                       generated assembled tv/admin/mobile assets
|-- scripts/assemble-assets.ts         build/copy assets and write _headers
|-- android/README.md                  pending Kotlin launcher note
|-- docs/                             API/backend/architecture/progress notes
|   `-- screenshots/                   earlier TV development captures + guide
|-- convert-icons.ps1                  local image conversion helper
`-- tsconfig*, eslint.config.mjs, vitest.config.ts and formatting configs

The two root JSON timetables and the shared development sample are not
interchangeable: the inspected shared seed has 145 services, not the
136-service production dataset. Development mocks deliberately use some
English in both fields and are tree-shaken from production builds.

9. LOCAL DEVELOPMENT AND STAFF BOOTSTRAP
------------------------------------------------------------
Run npm commands from the application workspace, NOT T:\New folder\:

  Set-Location 'T:\New folder\remote-seed-review'
  npm ci
  npm run db:migrate:local
  npm run user:create -- owner@example.com "Owner" ADMIN
  npm run db:seed:local

Local seed uses packages/shared/src/sample-schedule.json and refuses to
replace an existing version 1. It is development data, not an instruction
to overwrite the verified live timetable.

For local authenticated development only, create ignored
workers/api/.dev.vars containing:
  DEV_BYPASS_AUTH_EMAIL=owner@example.com

The bypass requires an enabled D1 user and a request hostname exactly
localhost or 127.0.0.1. It is ignored on deployed hostnames. Keep local
servers bound to loopback. Never commit .dev.vars.

Integrated single-origin development:
  npm run dev:api
  Open http://localhost:8787/tv/
       http://localhost:8787/mobile/
       http://localhost:8787/admin/

Individual Vite development servers:
  npm run dev:tv
  npm run dev:admin
  npm run dev:mobile
  Use the port printed by Vite; do not assume parallel servers share a port.
  TV development preview supports ?mock=1. Integrated dev:api is the
  simplest way to exercise same-origin API/auth interactions.

Local staff commands:
  npm run user:list
  npm run user:create -- editor@example.com "Editor" EDITOR
  npm run user:disable -- editor@example.com
  npm run user:enable -- editor@example.com

These CLI commands default to local D1. Production staff need both the
Cloudflare Access email allow-list entry and an enabled D1 account.
Normal ongoing staff work should use the dashboard.

10. TEST, BUILD, ASSEMBLE AND OWNER DEPLOYMENT
------------------------------------------------------------
Validation commands from remote-seed-review/:
  npm run validate:sample
  npm run typecheck
  npm run lint
  npm run test
  npm run test:smoke
  npm run build

Vitest covers shared validation/board/time behavior, importer parsing,
clock/pagination behavior and Worker API/auth/database scenarios. Smoke
uses isolated local Wrangler/D1 state. Historical progress records report
226 passing tests; that is historical evidence, not a fresh test run for
this documentation-only task.

Build/assembly details:
  npm run assemble
    Builds packages/shared, then tv/admin/mobile through Vite.
    Replaces workers/api/public/{tv,admin,mobile} with each dist output.
    Copies public files including the existing mobile APK.
    Writes _headers for CSP/security, caching, manifests and APK download.

  npm run build
    Builds shared, assembles apps, then runs the API workspace build:
    wrangler deploy --dry-run --outdir dist
    This validates packaging; it does NOT deploy production.

Exact underlying local Wrangler commands, from workers/api/:
  npx wrangler dev --local
  npx wrangler d1 migrations apply DB --local
  npx wrangler deploy --dry-run --outdir dist

Owner-only deployment reference (DOCUMENTED, NOT RUN):
  From remote-seed-review/: npm run deploy
    Expands to npm run assemble and npm run deploy --workspace=workers/api.
    The API workspace deployment command is wrangler deploy.
  Direct equivalent after assembly, from workers/api/: npx wrangler deploy

The existing Worker/D1 deployment is already configured; creating another
D1 database is not part of ordinary setup. Production migrations, remote
seeding and account bootstrap belong to the owner. db:seed:remote is an
existing guarded owner script, not a normal deployment step. Do not use it
to replace the current verified schedule. AI project rules prohibit push,
deploy, D1 creation and remote mutation commands.

After owner deployment, check public routes, Access protection, published
version and physical TV/mobile behavior. Changing draft data still needs
Publish to TV; deploying code and publishing timetable content are separate.

11. PROJECT SCREENSHOTS AND MEDIA INDEX (GIT ROOT)
------------------------------------------------------------
Exactly FIVE .png/.jpg/.jpeg/.webp files were found directly in
T:\New folder\. Names below preserve spaces, punctuation and suffixes.

1) qr-code.jpg
   Standalone black QR code on a white square background. Suitable as a
   QR media asset/reference. Its encoded destination was not decoded in
   this inspection; do not assume it matches /qr or the latest mobile URL.

2) Screenshot 2026-11-16 111040.png
   Wide Wall TV screenshot at 11:10 AM, Monday 2026-11-16. Shows four
   bilingual timetable rows, Page 9 / 10, green top countdown bar,
   Sinhala title, departure/arrival times, From names, PVT badges, QR
   phone handoff and departed/leaving-soon/next-bus color legend.
   Rows include Ampara, Colombo and Kandy. It illustrates a timetable
   page later in the rotation, not necessarily the next departures page.

3) Screenshot 2026-11-16 111125.png
   Desktop Mahiyanganaya Bus Admin Bus List view. Shows an ADMIN session,
   Live Version v35, Refresh TV Display, search, weekday/operator filters,
   All (136), and visible Active rows. Toolbar includes Delete All Buses,
   Import CSV / Excel / JSON, Bulk Add Rows and Add New Bus. Row actions
   include Edit, Duplicate and Delete. The screenshot alone does not prove
   all 136 rows are active; the public schedule check independently did.

4) WhatsApp Image 2026-11-16 at 11.03.06 AM (1).jpeg
   Portrait mobile commuter view at 11:02. Bilingual destination dropdown,
   Next 8 Hours and Full Day (39) controls, departed Ampara/Anuradhapura
   cards, CTB/PVT badges and a yellow NEXT BUS Colombo card. Bottom banner
   offers Install App and Direct APK Download. Full Day (39) is the
   captured UI view count, not the total production schedule size.

5) WhatsApp Image 2026-11-16 at 11.03.06 AM.jpeg
   Same mobile view with browser download confirmation for
   "mahiyanganaya-bus-mobile.apk" on the production Workers hostname.
   Demonstrates the APK download handoff; not installation completion.

Additional media under remote-seed-review/ includes TV/mobile app icons,
credits-slide PNG/JPG/WebP assets and docs/screenshots/ development
captures (afternoon, departed, tomorrow, alerts, unavailable, three/six
rows at 1280/1920 widths). They are not root images and are not included
in the five-file root count. Legacy multi-row screenshots do not override
the current four-row TV implementation.

12. DOCUMENTATION PROVENANCE AND HANDOVER
------------------------------------------------------------
This guide is based on repository inventory, package/configuration files,
assembly code, application/shared/Worker source, SQL migrations, exported
Android package metadata, APK hash comparison, supplied screenshots,
visual inspection of qr-code.jpg and read-only public endpoint checks.
PDF/spreadsheet/CSV files are inventoried as references; their full
contents were not independently re-audited to certify transport accuracy.

Some older README/AGENTS prose describes placeholder apps, pending cache
work or an unpublished schedule. Current source and dated observations
above take precedence when describing implemented behavior. Remaining
limits include absent Android build sources, the unimplemented scheduled
watchdog, external Access policy verification and physical-device QA.
Native-speaker review of Sinhala labels/place spellings remains valuable.

Documentation task scope: README.txt plus the required AGENTS.md status
and dated progress entry. No application source changes, dependency
changes, push, production writes or deployment. Tests/build were not
rerun for this documentation-only change; checks focused on facts, exact
filenames, file encoding and the final documentation diff.

Encoding: UTF-8. All dates in this guide use Asia/Colombo context.
