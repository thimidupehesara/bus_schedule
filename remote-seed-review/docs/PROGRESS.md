# Progress

See [AGENTS.md](../AGENTS.md) for the handover, owner items, branch status and dated progress log.

| Work                                                                            | Status  |
| ------------------------------------------------------------------------------- | ------- |
| Monorepo and shared schedule contract                                           | Done    |
| Backend auth, draft, publish, rollback and public schedule                      | Done    |
| Shared strict validation                                                        | Done    |
| Board engine, 12-hour formatting and development mock                           | Done    |
| Bilingual labels and departed row cap                                           | Done    |
| TV table UI                                                                     | Done    |
| TV offline engine, polling, clock recovery and watchdog                         | Done    |
| Staff admin UI with hour/minute/AM-PM picker and Access-session-expired message | Part 1 Done |
| Passenger mobile page for QR code                                               | Done    |
| Kotlin launcher                                                                 | Pending |
| First deploy                                                                    | Done    |

## Done
- [DONE] Cloudflare Access Live Authentication & Cookie Extraction Fix (apps/admin & workers/api):
  - In `workers/api/wrangler.toml`, configured `TEAM_DOMAIN = "https://misty-field-778f.cloudflareaccess.com"` and `ACCESS_AUD = "ba6398c2281ee6f0efd4aba4c275a0cbb869c194dff9b63522ca567850b3d1f0"`.
  - In `workers/api/src/auth.ts`:
    - Added `normalizeDomain` helper to strip protocol (`https://`), trailing slashes, and whitespace so both `https://misty-field-778f.cloudflareaccess.com` and bare domain work cleanly for JWKS fetching and issuer comparison.
    - Added trailing slash tolerance to `claims['iss']` comparison (`claimIss = typeof claims['iss'] === 'string' ? claims['iss'].replace(/\/+$/, '') : ''`).
    - Added `extractAccessJwt(request: Request)` supporting `Cf-Access-Jwt-Assertion` header, `Cookie: CF_Authorization=<jwt>` (plain and quoted), and `Authorization: Bearer <jwt>`.
    - In `AccessAuthProvider.authenticate`: used `extractAccessJwt(request)` and case-insensitive user lookup `SELECT * FROM users WHERE LOWER(login_id) = LOWER(?)` binding `email.toLowerCase().trim()`.
  - In `apps/admin/src/App.tsx`:
    - In `apiFetch`: added `credentials: 'include'` to send the `CF_Authorization` cookie with all `/api/*` requests.
    - Updated `loadCurrentUser`: sets `accessConfigured = true` when user data is returned.
    - Updated read-only banner logic: hidden when `currentUser` is logged in (`!currentUser && accessConfigured === false`).
  - Unit tests: Added 6 new unit tests in `workers/api/src/__tests__/auth.test.ts` (all 46 tests passing).
  - Verification: `npx tsc --noEmit` (0 errors), `npm run typecheck` (0 errors), `npm run assemble`, and `npm run deploy` (Version ID `7aa8a2cd-e1d8-4fa4-9ce8-33ce07d2f26d`). Verified with `curl.exe`.
- [DONE] Staff & Users Management Page and Admin Endpoints (apps/admin & workers/api):
  - In `workers/api/src/index.ts`, implemented `role === 'ADMIN'` guarded endpoints (returning 403 Forbidden for EDITOR users):
    - `GET /api/admin/users`: returns all rows from D1 `users` ordered by `id ASC`.
    - `POST /api/admin/users`: validates email format, non-empty display name, role ('ADMIN' | 'EDITOR'), checks duplicate email (409 Conflict), and inserts into `users` (`disabled = 0`, `created_at = datetime('now')`).
    - `PATCH /api/admin/users/:id`: updates role and disabled status. Blocks self-demotion or self-disabling of the current active admin account (400), and prevents demoting/disabling the last active administrator (409).
  - In `apps/admin/src/App.tsx`:
    - Added "Staff & Users" link to the left hamburger navigation drawer (visible to ADMIN users).
    - Added Two-Step Access Reminder banner with one-click "Copy Admin URL" and WhatsApp sharing button (`https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/admin/`).
    - Built "+ Add Staff / Admin" modal with email, display name, and role selector.
    - Built responsive Staff Users Table showing name & email, role dropdown selector, Active/Disabled status pills, formatted last login time, and Disable/Re-enable action buttons with confirmation dialog.
  - Added full test suite in `workers/api/src/__tests__/admin-users.test.ts` (4/4 tests passed).
  - Verified with `npm run typecheck` (0 errors), `npx tsc --noEmit` (0 errors), `npm run assemble`, and `npm run deploy` (Version ID `4f5d2569-0eb4-421a-b6fd-28f7a99c0674`). Verified live endpoint redirect to Cloudflare Access login.
- [DONE] Cloudflare Access Authentication Configuration:
  - Inspected `workers/api/src/auth.ts` verification logic: verified regex `!/^[a-zA-Z0-9-]+\.cloudflareaccess\.com$/.test(domain)` expects domain string without protocol prefix.
  - Configured `workers/api/wrangler.toml` `[vars]` with:
    - `TEAM_DOMAIN = "misty-field-778f.cloudflareaccess.com"`
    - `ACCESS_AUD = "ba6398c2281ee6f0efd4aba4c275a0cbb869c194dff9b63522ca567850b3d1f0"`
  - Executed `npm run typecheck` (0 errors), `npx tsc --noEmit` (0 errors), `npm run assemble`, and `npm run deploy` to Cloudflare Workers (Version ID `8fc75f87-a4a2-49cf-b03d-1fbfc32f34a5`).
  - Active Cloudflare Access credentials deployed, enabling live staff sign-in and mutation authorization on `/admin/` and `/api/admin/*`.
- [DONE] TV Box Clock Recovery & Server-Time Sync (apps/tv & workers/api):
  - In `workers/api/src/index.ts`, added `"serverTimeMs": Date.now()` to `/tv/version.json` and `/health`, and exposed `Date` and `X-Server-Time` in CORS `Access-Control-Expose-Headers`.
  - Created `apps/tv/src/data/clockSync.ts` anchoring true server timestamps against high-precision monotonic `performance.now()`, eliminating dependence on the Android TV box's internal RTC hardware.
  - Wired automatic clock sync extraction into `/schedule.json` polling (`useSchedule.ts`) and `./version.json` polling (`useAutoReloadOnDeploy.ts`).
  - Added invalid clock detection: if the device boots completely offline after a power cut with no server sync and year < 2026, sets `isClockSynced: false`.
  - In `apps/tv/src/App.tsx`, passed `{ clockSynced: isClockSynced }` to `buildBoard`: offline invalid-clock boots render all active daily services chronologically in `UPCOMING` status without falsely marking any buses as departed.
  - In `Header`, replaced the false `2015-01-01` clock and date readout with a clean pulsing badge `වේලාව සමමුහුර්ත වෙමින්... · Syncing Clock...`.
  - Added network listeners (`window.addEventListener('online', ...)`) and polling retry: as soon as Wi-Fi connects and any response arrives, the app immediately snaps to true Sri Lanka time and transitions to live board highlighting.
  - Added comprehensive unit tests in `apps/tv/src/__tests__/clockSync.test.ts` (4/4 passed).
  - Executed `npm run typecheck` (0 errors), `npx tsc --noEmit` (0 errors), `npm run assemble`, and `npm run deploy` to Cloudflare Workers (Version ID `938eeed0-6736-4f5a-b917-203cc0a3ca3d`). Verified live endpoints with `curl.exe`.
- [DONE] Admin Panel Part 1 — Shell, Hamburger Drawer, Bus Schedule Table, Add/Edit/Delete Modals & TV Refresh:
  - Built responsive Admin Shell in `apps/admin/src/App.tsx` with header title "Mahiyanganaya Bus Timetable — Admin", left hamburger menu (☰) toggle sliding a left drawer navigation, and "Refresh TV Display" button calling `POST /api/admin/tv-reload` with confirmation toast notification.
  - Implemented left navigation drawer with 3 views: "Bus Timetable" (default), "Reports & Analytics" (QR analytics and passenger suggestions integration), and "Publish & History" (status card).
  - Added visible "Unpublished Changes" banner when draft schedule differs from live snapshot, along with a quick "Publish Live Now" button calling `POST /api/publish`.
  - Added Cloudflare Access detection with graceful fallback to `/schedule.json` in read-only preview mode when Access is not yet configured, accompanied by a clear setup notification.
  - Implemented Bus Schedule Table matching TV columns (Destination `si / en`, 12h Departure AM/PM, 12h Arrival AM/PM or `—`, From `si / en`, Service badge `PVT / CTB`, and Update/Delete actions), sorted chronologically by departure time.
  - Added search input (filtering destination and origin) and operator filter chips (`All`, `CTB`, `PVT`).
  - Built Create / Add and Update bus modal with Sinhala and English placeholders (`කොළඹ / Colombo`, `මහියංගණය / Mahiyanganaya`), clean Hour (1-12), Minute (00-59), and AM/PM selectors converting to 24h `HH:mm`, arrival toggle, and operator/service type selection.
  - Built Delete confirmation modal showing bus details before deletion.
  - Verified with `npx tsc --noEmit` (0 errors), Vitest suite (160 tests passed), `npm run assemble`, and `npm run deploy`. Verified live admin endpoint at `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/admin/`.
- [DONE] Optimize TV Credits Slide Image (~3.4 MB to ~83 KB WebP):
  - Converted and resized credits slide image to 1280x720 WebP (`apps/tv/public/credits-slide.webp`, 83.1 KB) using Python Pillow with LANCZOS resampling and quality 85.
  - Generated lightweight fallbacks (`credits-slide.jpg` at 143 KB, `credits-slide.png` at 370 KB), completely eliminating heavy 3.4+ MB images from the build outputs.
  - Added `<link rel="preload" as="image" href="./credits-slide.webp" type="image/webp" />` to `apps/tv/index.html` for instant early fetching.
  - Updated `apps/tv/src/App.tsx` to preload, decode, and render `./credits-slide.webp` with `loading="eager"` and `decoding="async"`, keeping the main thread completely responsive.
  - Updated `apps/tv/public/sw.js` precache to use `./credits-slide.webp` and bumped cache version to `mahiyanganaya-tv-v2`.
  - Verified with `npm run typecheck`, full unit test suite (160 tests passing), `npm run assemble`, and `npm run deploy`. Verified live endpoints (HTTP 200 on `/tv/credits-slide.webp`, `/tv/index.html`, `/tv/sw.js`).
- [DONE] Offline Cold-Boot Support, Zero-Delay Credits Slide, and Remote TV Reload Trigger:
  - Created `apps/tv/public/sw.js` with pre-caching (`./`, `./index.html`, `./credits-slide.png`, `./manifest.webmanifest`, `./icon-192.png`, `./icon-512.png`), network-first with cache fallback for navigation (with 2.5s cold-boot timeout so offline starts immediately render cached `index.html` without browser error pages), network-first for `/schedule.json`, and cache-first/stale-while-revalidate for static assets.
  - Registered TV service worker in `apps/tv/src/main.tsx` with scope `./`.
  - Persisted latest valid schedule document in `localStorage` inside `apps/tv/src/data/useSchedule.ts` so the timetable immediately renders cached data on cold offline boots even before network resolution.
  - Updated `useAutoReloadOnDeploy.ts` to guard against reloading while offline (`navigator.onLine === false`), clear caches and reload only after verifying network reachability, and trigger immediate clean reload when `reloadNonce` changes.
  - Preloaded and decoded `./credits-slide.png` on mount, kept `<img>` permanently in the DOM with neutral `#0B0F14` dark backing, and transitioned with smooth visibility/opacity, eliminating 2–3s blank white delay.
  - Added `POST /api/admin/tv-reload` in `workers/api/src/index.ts` (protected by admin guard), logging to `audit_log` with bumped `reloadNonce`.
  - Exposed `buildId`, `reloadNonce`, and `forceReloadToken` in dynamic `/tv/version.json` route backed by D1, configured `run_worker_first` in `wrangler.toml`, and wired `📺 Refresh TV Screen` button in `apps/admin/src/App.tsx`.
  - Verified with `npm run typecheck`, full unit test suite (160 tests passing), `npm run assemble`, and `npm run deploy`. Verified live endpoints (HTTP 200 on `/tv/version.json`, `/tv/sw.js`, `/tv/`, `/admin/`).
- [DONE] Automatic TV Self-Updating on Deploy:
  - Added `writeBuildVersion` Vite plugin in `apps/tv/vite.config.ts` generating a unique `buildId` (`Date.now().toString()`), defining `import.meta.env.VITE_BUILD_ID`, and emitting `dist/version.json`.
  - Created `apps/tv/src/hooks/useAutoReloadOnDeploy.ts` polling `./version.json?t=${Date.now()}` with `{ cache: 'no-store' }` every 60 seconds (with initial check at 10 seconds).
  - When `buildId` differs from the running app's build ID, unregisters Service Workers, clears CacheStorage, and triggers `window.location.reload()`. Wrapped in try/catch to survive Wi-Fi drops.
  - Mounted `useAutoReloadOnDeploy` in `apps/tv/src/App.tsx`.
  - Added strict `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0` headers for `/tv/version.json`, `/tv/index.html`, and `/tv/` in `workers/api/src/index.ts` and `_headers`.
  - Verified with `npm run typecheck` (exit 0), `npx tsc --noEmit` (exit 0), unit tests (157 tests passing), `npm run assemble`, and `npm run deploy`. Verified live endpoints at `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/version.json` and `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/`.
- [DONE] TV Footer Color Legend for Row Highlights:
  - Added compact color legend to the right-hand side of the TV footer in `apps/tv/src/App.tsx`.
  - Added horizontal flex layout in `apps/tv/src/index.css` (`display: flex; align-items: center; justify-content: flex-end; gap: 18px;`).
  - Added Item 1 (Red Highlight): rounded color swatch (`width: 18px; height: 18px; border-radius: 4px; background: rgba(239, 68, 68, 0.35); border: 2px solid #EF4444; flex-shrink: 0;`), with stacked bilingual labels `පිටත් වූ / ආසන්න බස්` and `Departed / Leaving Soon`.
  - Added Item 2 (Yellow Highlight): rounded color swatch (`width: 18px; height: 18px; border-radius: 4px; background: rgba(250, 204, 21, 0.35); border: 2px solid #FACC15; flex-shrink: 0;`), with stacked bilingual labels `ඊළඟ බස් රථය` and `Next Upcoming Bus`.
  - Kept QR block on the left and `Page X / Y` centered; styled legend with crisp white/light-gray text without altering table height, font sizes, or column widths.
  - Executed `npm run typecheck`, unit test suite (161 tests passing), `npm run assemble`, and `npm run deploy`. Verified live on Cloudflare Workers.
- [DONE] Final Credits/QR Slide in TV Rotation Loop:
  - Kept safe margin at 1.5% without modifying any timetable font sizes, column widths, or colors.
  - Placed `credits-slide.png` (1920x1080) into `apps/tv/public/credits-slide.png`.
  - Updated `PagedBoard` in `apps/tv/src/App.tsx` so the rotation adds 1 extra slide at the end of the rotation (`totalSlides = totalSchedulePages + 1`).
  - At slide index `totalSchedulePages`, rendered `./credits-slide.png` full-bleed in a centered container (`width: 100vw; height: 100vh; object-fit: contain; background: #ffffff;`) with smooth crossfades and seamless loop back to Page 1.
  - Kept existing 10-second dwell interval and green `PageCountdown` top progress bar running normally at `z-index: 9999` across both timetable pages and the credits slide.
  - Maintained `Page X / Y` indicators on all bus timetable pages (`1 / N` through `N / N`).
  - Executed `npm run typecheck`, unit test suite (161 tests passing), `npm run assemble`, and `npm run deploy`. Verified live endpoint at `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/` and `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/credits-slide.png` (HTTP 200).
- [DONE] Staff Admin Portal & QR/Suggestions Integration:
  - Built comprehensive Admin Portal UI in `apps/admin/src/App.tsx` with tabs for QR Visitor Analytics and Passenger Issue Reports.
  - Added daily QR visitor stats cards (Today's Uniques, Today's Total Scans, All-Time Uniques) and 90-day history table.
  - Added Suggestions table with status filters (All, Open, Resolved), category badges, and interactive "Mark Resolved" / "Reopen" buttons.
  - Added `PATCH /api/admin/suggestions/:id` backend route in `workers/api/src/index.ts` with admin role and CSRF validation.
  - Verified `station.mobileUrl` is configured to `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/qr`.
  - Executed `npm run typecheck`, `npm run assemble`, and `npm run deploy`. Verified live endpoints (HTTP 200 on `/admin/`, HTTP 302 on `/qr`, HTTP 201 on `POST /api/suggestions`).
- [DONE] Direct APK Integration & Deployment:
  - Copied `Mahiyanganaya Bus Timetable.apk` (3.27 MB) from `Mahiyanganaya Mobile APK/` into `apps/mobile/public/mahiyanganaya-bus-mobile.apk`.
  - Configured custom security and download headers for `/mobile/*.apk` in `scripts/assemble-assets.ts` (`Content-Type: application/vnd.android.package-archive`, `Content-Disposition: attachment`).
  - Executed `npm run deploy` inside `T:\New folder\remote-seed-review`.
  - Verified live endpoint returning HTTP 200 OK at `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/mobile/mahiyanganaya-bus-mobile.apk`. The mobile install banner will automatically surface the Direct APK Download button.
