# Backend API contract

All paths share one origin. `/api/*` is staff-only, including unrecognized routes.
Use Cloudflare Access email one-time PIN; never build a login/logout/password page.
Responses use `{ "ok": true, ... }` or
`{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }`.
Exceptions: the successful public schedule is the exact ScheduleDocument JSON,
and an ETag match has a byte-empty 304 response.

## Requests, identity and errors

Every mutation must have `Origin` exactly equal to the request URL origin,
`X-Requested-With: XMLHttpRequest`, and `Content-Type: application/json` (an
optional charset is accepted). Send `{}` for mutations with no payload, including
DELETE, discard, and preview; alert may be the JSON literal `null`. Streamed bodies
and Content-Length are limited to 1 MiB. API responses are no-store, with restrictive
CSP/security headers. No cross-origin admin requests or CORS preflights are enabled.

`Cf-Access-Jwt-Assertion` is verified with WebCrypto RS256 against the configured
team JWKS. Issuer, audience, expiry (60-second skew), optional not-before and email
are checked. JWKS are cached for up to one hour, refreshed for an unknown kid, and
network/verification failures fail closed. Role and enabled status are read from
D1 on every request; the JWT never supplies authorization. Last login changes at
most hourly. The auth interface returns an identity or null; a verified but
unlisted/disabled identity raises a typed 403 error.

| Status    | Meaning                                                                   |
| --------- | ------------------------------------------------------------------------- |
| 400       | Invalid JSON/body, missing explicit confirmation, invalid note/version    |
| 401       | Missing/invalid JWT or unconfigured TEAM_DOMAIN/ACCESS_AUD                |
| 403       | Unlisted/disabled email, insufficient role, or CSRF check failure         |
| 404       | Missing route, service, user, or retained snapshot                        |
| 409       | Stale draft/transaction, duplicate email, user cap, self/last-admin guard |
| 413 / 415 | Body over 1 MiB / unsupported content type                                |
| 422       | Validation failure; service issues have English and Sinhala messages      |
| 503       | No published public timetable yet; Retry-After: 60                        |

## Public routes

| Method/path          | Response                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET `/health`        | `{ok:true,time:"ISO UTC"}`; process liveness, not a DB health probe                                                                 |
| GET `/schedule.json` | Exact persisted live JSON, application/json UTF-8, strong quoted ETag, Cache-Control: no-cache, X-Server-Time, wildcard public CORS |
| GET `/tv/`           | Public TV placeholder HTML/assets                                                                                                   |
| GET `/admin/`        | Admin placeholder HTML/assets; protect with Access at the edge                                                                      |

Schedule supports quoted If-None-Match tags, weak `W/` tags, comma lists and `*`.
304 responses retain ETag and X-Server-Time. CORS exposes ETag, X-Server-Time and
Date. The Worker never rebuilds or reformats the stored body on a GET.

## Identity and user administration

| Method/path          | Body                             | Result                                                               |
| -------------------- | -------------------------------- | -------------------------------------------------------------------- |
| GET `/api/auth/me`   | —                                | `user:{email,displayName,role}`                                      |
| GET `/api/users`     | —                                | `users:[{id,email,displayName,role,disabled,createdAt,lastLoginAt}]` |
| POST `/api/users`    | `{email,displayName,role}`       | Created user; 201                                                    |
| PUT `/api/users/:id` | `{displayName?,role?,disabled?}` | Updated user                                                         |

All `/api/users` routes require ADMIN. Emails are case-insensitive, validated,
and unique. Display names are 1–80 characters with no control characters or
surrounding whitespace. Role is ADMIN or EDITOR; disabled is boolean. Updates may
only contain the listed fields. No user DELETE is exposed. Limit: 20 total users,
including disabled ones. An ADMIN cannot disable/demote themselves; the last
active ADMIN cannot be disabled/demoted/deleted even through the bootstrap CLI.
Every change is audited.

**Adding a user here sets their ROLE/local allow-list only. Their email must ALSO
be added to the Cloudflare Access Allow policy in the dashboard before login.**
Disabling locally immediately blocks API requests even if an Access JWT remains
valid. Removing only the Access policy entry may leave an existing Access session
until Cloudflare invalidates/expires it; disable locally as well.

## Draft

EDITOR can use every draft route except display, station and import. ADMIN can
use all routes. `BusService` and `ScheduleDocument` types are exported from
`@bus-schedule/shared`; imports must contain the full existing data shape.

| Method/path                              | Body                                   | Result                                                                       |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| GET `/api/draft`                         | —                                      | `document,draftRevision,liveVersion,hasUnpublishedChanges,validation,issues` |
| POST `/api/draft/services`               | Full service, id omitted/ignored       | Server-generated UUID; service, warnings, new draftRevision; 201             |
| PUT `/api/draft/services/:id`            | Full service; path id is authoritative | service, warnings, new draftRevision                                         |
| DELETE `/api/draft/services/:id`         | `{}`                                   | new draftRevision                                                            |
| POST `/api/draft/services/:id/duplicate` | Service field overrides                | New UUID, cloned service with overrides; 201                                 |
| PUT `/api/draft/alert`                   | AlertBanner or `null`                  | new draftRevision                                                            |
| PUT `/api/draft/last-verified`           | `{lastVerified:"YYYY-MM-DD"}`          | new draftRevision                                                            |
| PUT `/api/draft/display`                 | Full DisplaySettings (ADMIN)           | new draftRevision                                                            |
| PUT `/api/draft/station`                 | `{name:{si,en},mobileUrl}` (ADMIN)     | new draftRevision                                                            |
| POST `/api/draft/discard`                | `{}`                                   | Restore live snapshot to draft; 409 if none exists                           |
| POST `/api/draft/import`                 | Full ScheduleDocument (ADMIN)          | Replace draft, normalized and validated; warnings and new draftRevision      |

Services sort by departure, English destination, then id. Draft publication fields
reflect live, or placeholders when nothing is published; they are not a promise
of publication. Imported version/publishedAt do not control future live numbering.
`issues` is `[{serviceId,errors:FieldIssue[],warnings:FieldIssue[]}]`.
`validation` is `{ok,errors}`. FieldIssue has `field,code,message_en,message_si`.

Duplicates must pass the same no-exact-duplicate rule as any save. Therefore a
clone with no time/day/route override normally returns 422. The future UI should
open the cloned form locally, let staff choose a different departure/day, then
submit the overrides. Silently inventing a new departure would be unsafe.

All successful draft mutations increment the revision and write an audit entry
in one transaction. Failed saves change neither draft nor live. Internally,
revision/version guards reject concurrent modifications with 409. Editors must
reload after a conflict. The API's prescribed service PUT body does not include a
client revision, so sequential full-form saves can still replace a previous staff
member's edits; the UI should re-fetch before submitting and clearly show current
values. Publish always requires a reviewed revision.

## Preview, publish and history

| Method/path                 | Body                                 | Result                                                                                                            |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| POST `/api/publish/preview` | `{}`                                 | diff, warnings, validation, issues, draftRevision, nextVersion                                                    |
| POST `/api/publish`         | `{draftRevision,confirm:true,note?}` | version, etag, draftRevision                                                                                      |
| GET `/api/snapshots`        | —                                    | snapshots ordered newest first, with version,publishedAt,publishedBy,kind,note,rolledBackFrom,serviceCount,isLive |
| POST `/api/rollback`        | `{version,confirm:true,note?}`       | New version, etag, new draftRevision                                                                              |

Both roles may preview, publish and rollback. Notes are optional, max 500 chars.
Preview is read-only; no snapshot is created. Added/removed diff entries contain
`{id,label}`; changed entries contain `{id,label,fields:[{field,before,after}]}`.
Metadata flags: alertChanged, displayChanged, lastVerifiedChanged, stationChanged.
Warnings include severity `warning` and serviceId/field where relevant.

Publish rejects stale revisions with 409 and any schema/strict errors with 422.
A single guarded D1 batch inserts max(version)+1, updates live_pointer, audits,
and prunes to the newest 50 snapshots without deleting live/highest. The snapshot
is sorted, stamped UTC, revalidated, serialized once and SHA-256 hashed into
`"v<version>-<first16hex>"`. Concurrent changes abort the entire batch. Rollback
validates and re-stamps the selected retained snapshot into a _new_ version,
records its source version, and resets the draft in that same batch. Expired
enabled alerts are both errors and warnings; historical snapshots with expired
alerts must be corrected before republishing instead of being blindly restored.

## Staff validation contract

Import `normalizeServiceInput`, `validateServiceStrict`, `validateAlertStrict`,
`validateLastVerified`, `KNOWN_PLACES`, and `findClosestKnownPlace` into the future
staff UI. The server repeats validation and remains authoritative.

- Time normalization accepts `5:30`, `0530`, `5.30`, Sinhala and Arabic-Indic digits;
  ambiguous strings are left invalid, not guessed. Persisted times are HH:mm.
- Arrival-to-departure wraps midnight: 0–89 minutes accepted, 90–180 warned, over
  180 blocked. `days` is always the ISO **departure** weekday.
- Place fields need Sinhala without Latin letters; English allows A–Z/a–z,
  spaces, `.`, `-`, `'` only. 1–80 characters, no extra whitespace. Endpoint names
  must differ from each other and the full station name (either language).
- Operator/service type are enums; days are unique/nonempty 1–7; bay is nullable
  or 1–4 ASCII letters/digits/hyphens. Same endpoint pair + departure + overlapping
  days is an error even if a service is inactive.
- Advisory warnings cover unknown place spellings (closest suggestion), overnight
  departures, later tripStart, similar services on other days and bay conflicts
  within five minutes, including adjacent weekdays across midnight.
- Enabled alerts need both texts, 1–140 chars. A non-null expiry must be future;
  null means never expires, preserving the existing contract. Disabled text may
  be empty. lastVerified must be a real date no later than today's Colombo date.
- Publish warnings also flag >30% service loss, zero active services, verification
  older than 14 Colombo calendar days, expired alerts, near duplicates (same
  endpoints within five minutes on overlapping days), and >20 active departures
  in a clock hour on an actual ISO weekday. Warnings never bypass blocking errors.
