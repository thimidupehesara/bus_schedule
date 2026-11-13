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

## Plan
- [PLANNED] Final Credits/QR Slide in TV Rotation Loop:
  - Keep margins at 1.5% without modifying timetable font sizes, column widths, or colors.
  - Wire `credits-slide.png` (1920x1080) into `apps/tv` rotation loop as the final slide after all schedule pages.
  - Set `totalSlides = totalSchedulePages + 1`. When index is `totalSchedulePages`, render full-bleed `credits-slide.png` (`width: 100vw; height: 100vh; object-fit: contain; background: #ffffff;`) with top green `PageCountdown` active at `z-index: 9999`.
  - Retain existing 10-second dwell and smooth fade transitions into and out of the credits slide, looping back to Page 1.
  - Keep `Page X / Y` indicators on timetable pages showing timetable count (`1 / N` to `N / N`).
  - Run `npm run typecheck`, `npm test`, `npm run assemble`, and `npm run deploy` to verify live on Cloudflare Workers.

## Done
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
