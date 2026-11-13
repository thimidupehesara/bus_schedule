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
| TV offline engine, polling, clock recovery and watchdog                         | Pending |
| Staff admin UI with hour/minute/AM-PM picker and Access-session-expired message | Pending |
| Passenger mobile page for QR code                                               | Done    |
| Kotlin launcher                                                                 | Pending |
| First deploy                                                                    | Done    |

## Done
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
