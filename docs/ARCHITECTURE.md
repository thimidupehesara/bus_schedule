# Architecture — Mahiyanganaya timetable

The system is a static, staff-verified timetable, not vehicle tracking. A wrong
published time is worse than a delayed update. Data is bilingual Sinhala/English.

| Package         | Responsibility                                                                                               | Status                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| packages/shared | Existing types/Zod contract, strict bilingual rules and place suggestions                                    | Implemented                                     |
| workers/api     | Access verification, staff roles, D1 draft, preview, publish, immutable snapshots, rollback, public schedule | Implemented                                     |
| apps/tv         | React/Vite/Tailwind 3.4, Chrome 109 target, /tv/ base                                                        | Placeholder; real display and caching pending   |
| apps/admin      | React/Vite/Tailwind 3.4, /admin/ base                                                                        | Placeholder; staff editing and Users UI pending |
| android         | Kotlin WebView launcher                                                                                      | Later task                                      |

One Worker (`mahiyanganaya-bus`) serves both sets of assets. API, schedule and
health routes run Worker-first. No SPA fallback is configured. The future UIs
must use hash routing or no client router. The TV never reads D1 or uses staff
endpoints; it consumes only the public `/schedule.json` representation.

## Data and publication

All service times are Asia/Colombo wall-clock HH:mm. Overnight departures belong
to the next calendar day for an evening viewer; ISO `days` refers to the weekday
on which the bus departs. lastVerified is a Colombo calendar date. Database and
publication timestamps are ISO UTC strings. Schema version stays 1, services
remain capped at 300, and station.mobileUrl requires HTTPS.

A draft lives in draft_services + draft_meta with a monotonically incremented
revision. Preview validates the entire draft and compares it with live. Publish
requires the reviewed revision and explicit confirmation. The application sorts,
revalidates, serializes once and calculates the strong content ETag. A guarded D1
batch checks draft/version/actor state, stores the new snapshot, moves the live
pointer, writes audit history and prunes snapshots. A conflict aborts everything.

Public reads return the exact stored body with no-cache and conditional ETags.
Draft edits cannot change it. Rollback copies a retained snapshot into a NEW
higher version and replaces the draft atomically. At most 50 snapshots remain.
Missing initial publication returns 503, never an invented or empty timetable.

## Intended offline TV behavior — separate UI task

Poll `/schedule.json` every three minutes using If-None-Match. Validate new data
before replacing the IndexedDB copy. The service worker caches the application
shell and supports offline startup. Keep displaying the last known good schedule
through network/API failures; use X-Server-Time when online for clock awareness.
Do not cache 503/error responses over a valid schedule. These behaviors are not
implemented by the placeholder app yet.

## Authentication and safety

Cloudflare Access email one-time PIN is the only login. The Worker independently
verifies RS256 JWTs, issuer/audience/expiry/email and looks up roles in D1 on every
staff API request. An email must be allowed in BOTH Access and users. No password,
PIN, app session, login page, or auth token is given to the TV. Hostname-restricted
local development bypass exists only for localhost/127.0.0.1 testing.

Same-origin CSRF header + Origin checks protect every mutation. Request bodies
are limited to 1 MiB. API responses are no-store; static assets and APIs use
separate restrictive CSPs. Shared strict validation repeats on the server, and
publish blocks all errors. Unknown spelling/time/bay concerns are visible warnings.
Read [API.md](API.md) and [BACKEND.md](BACKEND.md) for exact behavior and limitations.
