# Mahiyanganaya Long-Distance Bus Timetable System

> **Repository Guide & Technical Specification**  
> **Inspected:** 16 November 2026 (Asia/Colombo)  
> **Git Repository Root:** `T:\New folder\`  
> **Application Workspace:** `T:\New folder\remote-seed-review\`

---

## Visual Previews & Application Screenshots

### 1. Wall TV Departure Timetable (`/tv/`)
Mounted above eye level at Mahiyanganaya Bus Stand. High-contrast, stationary 4-row layout with bilingual Sinhala/English destinations, 12-hour departure/arrival times, live next-bus tinting, and QR code for commuter handoff:

<img src="./Screenshot 2026-11-16 111040.png" alt="Wall TV Departure Timetable Interface" width="100%" />

---

### 2. Commuter Mobile PWA & Direct Android APK Download (`/mobile/`)
Responsive mobile web application with bilingual search, destination filtering, departure status, and one-click Android APK installer:

| Mobile PWA Commuter View | Direct APK Download Prompt |
| :---: | :---: |
| <img src="./WhatsApp Image 2026-11-16 at 11.03.06 AM (1).jpeg" alt="Commuter Mobile Web App" width="380" /> | <img src="./WhatsApp Image 2026-11-16 at 11.03.06 AM.jpeg" alt="Direct APK Download Modal" width="380" /> |

---

### 3. Staff Admin Dashboard (`/admin/`)
Authenticated Cloudflare Access portal for non-technical staff: draft timetable editing, bulk spreadsheet importing, safety validation gates, and 1-click publishing to live TV displays:

<img src="./Screenshot 2026-11-16 111125.png" alt="Staff Admin Dashboard" width="100%" />

---

## 1. Project Overview

A public, bilingual Sinhala/English timetable for Mahiyanganaya Bus Stand, Sri Lanka. It serves three audiences:

* **Wall TV (`/tv/`):** A large, stationary departure table readable from several metres away, including by elderly commuters.
* **Commuters (`/mobile/`):** A responsive mobile website, installable Progressive Web App (PWA), and a separately packaged downloadable Android APK.
* **Staff (`/admin/`):** An authenticated dashboard for editing, reviewing, and publishing timetables, alerts, display settings, and staff accounts.

This is scheduled transport information, not GPS/live vehicle tracking. Departure labels are calculated from scheduled times and the clock; they are not confirmation that a bus has physically arrived or left. Staff work through the dashboard without editing JSON or Cloudflare configurations.

The verified schedule contains 136 bilingual services. A public read on 16 November 2026 confirmed live version 35 with 136/136 active services. Operational accuracy depends on staff verifying departure times.

* **Operators Supported:** CTB (SLTB) and PVT (Private).
* **Service Categories:** `NORMAL`, `SEMI_LUXURY`, `LUXURY`, and `EXPRESS`.

---

## 2. Production URLs and Public Endpoints

* **Production Origin:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev`
* **Wall TV Display:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/`
* **Commuter Mobile PWA:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/mobile/`
* **Staff Admin Dashboard:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/admin/`
* **Android APK Direct Download:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/mobile/mahiyanganaya-bus-mobile.apk`
* **Public Timetable JSON:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/schedule.json`
* **Public Health / Time Probe:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/health`
* **TV Control / Version Metadata:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/version.json`
* **QR Handoff Route:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/qr` (redirects to `/mobile/` and increments stats)
* **Digital Asset Links:** `https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/.well-known/assetlinks.json`

---

## 3. Architecture

```
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
```

A shared TypeScript package (`packages/shared`) supplies schema, bilingual labels, time formatting, service rules, and the schedule board engine. Browsers never connect directly to D1. Only published snapshots reach public clients.

---

## 4. Languages, Frameworks and Tooling

### Frontend
* **TypeScript & React 18**, ReactDOM, Vite 6, HTML5, CSS3.
* Responsive `clamp()` typography, CSS layout, and dynamic fitting for bilingual text.
* Tailwind CSS, PostCSS, and Autoprefixer tooling in TV and Admin packages.
* **Noto Sans Sinhala** Unicode font and **Inter** bundled locally through `@fontsource`, avoiding external CDN dependencies.
* Web App Manifests and Service Workers for offline TV operation and mobile installation.
* Admin dynamically imports the bundled `xlsx` library for spreadsheet parsing without external CDNs.

### Backend & Database
* TypeScript running on **Cloudflare Workers** edge serverless runtime (`compatibility_date = 2026-11-11`).
* **Wrangler 4** CLI and tooling.
* **Cloudflare D1** (serverless SQLite database), bound as `DB`.
* Static assets bound as `ASSETS` (no separate frontend hosting bucket).
* SQL migrations managed under `workers/api/migrations/`.

### Shared & Quality Assurance
* **Zod 3** schemas and custom authoritative service validation.
* **TypeScript 5**, **ESLint 9**, **Vitest 2**, and `tsx` development tools.
* **Node.js 24** (`.nvmrc`), npm workspaces.
* TV build target explicitly locked to `chrome101` for budget Android TV boxes.

---

## 5. Timetable Model and Engineering Features

### Data Contract (`packages/shared/src/schema.ts`)
* Services include bilingual destination and origin (`si` and `en`), optional `via`, operator (`CTB` | `PVT`), service category (`NORMAL` | `SEMI_LUXURY` | `LUXURY` | `EXPRESS`), arrival time, departure time, optional bay, operating days, and active status.
* Stored in 24-hour `HH:mm` in `Asia/Colombo`. Displayed in 12-hour format with English AM/PM and Sinhala පෙ.ව./ප.ව.
* Arrival indicates arrival at Mahiyanganaya Bus Stand (nullable for originating services).
* Operating days accept ISO numbers `1-7` and codes `MON-SUN`. After-midnight departures belong to the next calendar day relative to an evening reader.

### Validation & Importer (`packages/shared/src/service-rules.ts` & `apps/admin/src/import-timetable.ts`)
* Place labels require Sinhala script in `si` and Latin script in `en`.
* Importer accepts Excel (`.xlsx`, `.xls`), CSV, TSV, and JSON formats.
* Daily/Every day/blank days automatically normalize to all 7 weekdays (`MON`–`SUN`). Missing active defaults to `true`.
* Staff tools include bulk row addition, 1-click **"Activate All Buses"**, duplicate cleanup, and safety rejection inspections.

### Draft vs. Live Snapshots
* Edits mutate draft records only. Preview validates and computes diffs against the published snapshot.
* Publishing writes an immutable snapshot and updates the live pointer. Rollbacks create new snapshot versions.
* Retention keeps 50 snapshots. Revision guards protect concurrent writes, and audit logs record operator activity.

### Wall TV Engine (`apps/tv/`)
* Fixed 4-row page capacity, 10-second dwell, 300 ms fade transition, stationary pages, `Page X / Y`, and a green top countdown bar.
* Columns: Destination, Departure, Arrival, From, and Service/Operator.
* Next bus highlighted in yellow; departed and leaving-soon buses styled in red.
* Offline resilience: persists last validated schedule in `localStorage`, survives network drops, recovers clocks on boxes lacking RTC batteries, and checks deployment/control updates every 2.5 seconds.

### Commuter Mobile Web App (`apps/mobile/`)
* Bilingual A-Z destination dropdown, Next 8 Hours and Full Day view filters.
* Golden highlighted Next Bus card, departure status pills, and route details.
* Integrated passenger feedback form, PWA installation banner, and 1-click APK download.

### Staff Dashboard (`apps/admin/`)
* Bus List, Publish to TV, Alert Banner, TV Presentation Control, Staff & Users, Display Settings, and Passenger Feedback.
* Accessible, intuitive hour/minute/AM-PM selectors (no raw time strings).

---

## 6. Hosting, Authentication and API

* **Worker:** `mahiyanganaya-bus`
* **D1 Database:** `mahiyanganaya-bus-db`
* **Configuration:** `remote-seed-review/workers/api/wrangler.toml`

### Authentication & Access Control
* **Cloudflare Access** email one-time PIN protects `/admin/` and staff `/api/*` routes.
* Worker independently verifies the Access JWT (signature, issuer, audience, expiration) and checks D1 user allow-list, enabled status, and role (`ADMIN` or `EDITOR`).
* Enforces same-origin CSRF checks on mutating requests.
* Exception: `POST /api/suggestions` is public to accept passenger feedback without login.

### Key Staff API Routes
* `GET  /api/auth/me`: Current session and identity diagnostics.
* `GET  /api/draft`: Current editable draft document.
* `POST /api/publish/preview`: Validation, advisory checks, and schedule diff.
* `POST /api/publish`: Publish draft as a new immutable live snapshot.
* `GET  /api/snapshots`: View historical snapshots.
* `POST /api/rollback`: Roll back to a previous snapshot.
* `POST /api/draft/import`: Bulk import timetable services.
* `POST /api/draft/activate-all`: Activate all draft services in one click.
* `POST /api/draft/deduplicate`: Clean duplicate departures.
* `POST /api/admin/tv-reload`: Force immediate TV refresh.

---

## 7. Android APK & TWA Packaging

The repository includes PWABuilder Android packages:
* `Mahiyanganaya Mobile APK/`: `lk.mahiyanganaya.busmobile`
* `Mahiyanganaya TV APK/`: `lk.mahiyanganaya.busdisplay`
* `Mahiyanganaya Bus Timetable - Google Play package/`: `lk.mahiyanganaya.busdisplay`

The mobile distribution APK (`mahiyanganaya-bus-mobile.apk`, 3,276,196 bytes) matches `remote-seed-review/apps/mobile/public/mahiyanganaya-bus-mobile.apk` (SHA-256: `D468C3927B3B05273CBB46C92A3755853680228DCB46C25B59AB1655C22B833B`).

The Worker serves Digital Asset Links at `/.well-known/assetlinks.json` associating both package identities with their signing certificate SHA-256 fingerprints.

---

## 8. Monorepo Structure

```
T:\New folder\                         Git repository root
|-- README.md                          GitHub guide with screenshots
|-- README.txt                         Plaintext comprehensive guide
|-- Screenshot 2026-11-16 111040.png    Wall TV screenshot
|-- Screenshot 2026-11-16 111125.png    Admin dashboard screenshot
|-- WhatsApp Image 2026-11-16 at 11.03.06 AM (1).jpeg (Mobile PWA)
|-- WhatsApp Image 2026-11-16 at 11.03.06 AM.jpeg     (Direct APK download)
|-- qr-code.jpg                         QR reference asset
|-- Mahiyanganaya Mobile APK/           Mobile TWA package
|-- Mahiyanganaya TV APK/               TV TWA package
|-- Mahiyanganaya Bus Timetable - Google Play package/
|-- Bus TimeTable.pdf                   Timetable reference PDF
|-- Mahiyanganaya_Bus_Timetable.xlsx    Timetable reference Excel
|-- mahiyanganaya_buses_clean.csv       Timetable reference CSV
|-- mahiyanganaya_schedule.json         Production 136-service schedule
`-- remote-seed-review/                 npm monorepo workspace
    |-- apps/
    |   |-- tv/                         Wall TV React application
    |   |-- admin/                      Staff admin React application
    |   `-- mobile/                     Commuter mobile React application
    |-- packages/shared/                Shared schema, validation, board engine
    |-- workers/api/                    Cloudflare Worker API & D1 migrations
    `-- docs/                           Detailed architecture and progress docs
```

---

## 9. Local Development Quickstart

Run commands from `remote-seed-review/`:

```powershell
Set-Location 'T:\New folder\remote-seed-review'

# 1. Install dependencies
npm ci

# 2. Run local database migrations
npm run db:migrate:local

# 3. Create local bootstrap admin user
npm run user:create -- owner@example.com "Owner" ADMIN

# 4. Seed local database with development timetable
npm run db:seed:local

# 5. Start unified local development server
npm run dev:api
```

Open in browser:
* TV display: `http://localhost:8787/tv/`
* Commuter mobile: `http://localhost:8787/mobile/`
* Staff admin: `http://localhost:8787/admin/`

---

## 10. Testing, Quality & Assembly

From `remote-seed-review/`:

```powershell
# Run sample validation
npm run validate:sample

# Run TypeScript checks across all packages
npm run typecheck

# Run ESLint across monorepo
npm run lint

# Run all Vitest automated test suites
npm test

# Assemble TV, admin, and mobile bundles into Worker assets
npm run assemble

# Dry-run build validation
npm run build
```

---

## 11. Handover Notes

* **Current Status:** Live version 35 deployed and serving 136 verified bilingual bus services.
* **Zero Secrets:** Keystores, passwords, and `.dev.vars` are excluded by `.gitignore` and never committed.
* **Production Integrity:** Git branches protect `main`. Production deployments and database changes are strictly owner-controlled.
