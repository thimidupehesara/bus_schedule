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
| Passenger mobile page for QR code                                               | Pending |
| Kotlin launcher                                                                 | Pending |
| First deploy                                                                    | Done    |

## Done
- [DONE] FittedText Long City Names Auto-Fit: In apps/tv/src/FittedText.tsx, measured available container width (excluding horizontal padding), guarded with containerWidth > 50 so initial unmeasured layout never triggers erroneous shrinkage, maintained normal short city names (Colombo, Kandy, Ampara, Bibile) at 100% full large font size, and only reduced font size when textElement.scrollWidth > availableWidth so long names like `දෙහිඅත්තකණ්ඩිය` fit completely without clipping.
- [DONE] Full-Width Green Countdown Bar: In apps/tv/src/index.css, set .page-countdown-bar to `position: fixed; top: 0; left: 0; right: 0; width: 100vw; height: 6px; z-index: 9999;` to span full-width across the very top edge of the screen.
- [DONE] Assemble & Deploy: Passed `npm run typecheck`, 101 tests, assembled assets, deployed Worker to Cloudflare, and confirmed live `/tv/` HTTP 200.
