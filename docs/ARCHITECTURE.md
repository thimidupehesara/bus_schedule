# Architecture — Mahiyanganaya Bus Stand Display System

## Overview
A 24/7 public bus timetable display for the Mahiyanganaya Bus Stand, Sri Lanka.
All UI text is bilingual: Sinhala (si) + English (en).

## Packages

| Package | Technology | Purpose |
|---------|-----------|---------|
| `apps/tv` | React + Vite (target: Chrome 109) + Tailwind CSS v3 | Public TV display, runs in Android WebView on a budget TV box (1-2 GB RAM). **Offline-first.** |
| `apps/admin` | React + Vite + Tailwind CSS v3 | Staff admin portal (laptop/phone). Edit schedule, publish, manage alerts. |
| `workers/api` | Cloudflare Worker + D1 | Serves `schedule.json` and the admin REST API. D1 is the database. |
| `packages/shared` | TypeScript + Zod | Single source of truth for all types, Zod schemas, and validation logic. Imported by every other package. |
| `android/` | Kotlin (future) | Android launcher app that hosts `apps/tv` in a full-screen WebView. |

## Data Contract Rules
- All times in `ScheduleDocument` are **Asia/Colombo wall-clock time — never UTC**.
- Times after midnight (e.g. `00:30`) are valid; they belong to the **next calendar day**
  relative to an evening reader. The TV app sorts by "next occurrence from now", wrapping past midnight.
- `days` (Weekday[]) always refers to the weekday on which the bus **departs** from the stand.
- `mobileUrl` in `station` must use **https**.
- `services` is capped at **300 entries**; duplicate `id` values fail validation.
- `schemaVersion` is always the integer literal `1`.

## Offline Strategy (TV app)
The TV app caches `schedule.json` in the browser Cache API. It polls the API every
`display.pollIntervalSeconds` seconds and does a hard reload at `display.reloadAtLocalTime`
(default 02:30 Asia/Colombo) each night to flush stale state.

## Security Notes
- No secrets or `.env` files are committed.
- D1 binding in `wrangler.toml` is commented out until provisioned.
- Admin API (future) will require a bearer token; never expose it to the TV client.

