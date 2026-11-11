# Mahiyanganaya Bus Stand Display System

24/7 public bus timetable display for the Mahiyanganaya Bus Stand, Sri Lanka.
Bilingual: Sinhala + English.

## Repository Structure

```
.
├── apps/
│   ├── tv/          React + Vite + Tailwind (TV display, Chrome 109 target)
│   └── admin/       React + Vite + Tailwind (staff admin portal)
├── workers/
│   └── api/         Cloudflare Worker + D1 (schedule API)
├── packages/
│   └── shared/      TypeScript types + Zod schemas (shared by all)
├── android/         Kotlin launcher (added later)
└── docs/
    ├── ARCHITECTURE.md
    └── PROGRESS.md
```

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- npm 10+

## Install

```bash
npm install
```

## Development

```bash
# TV display app (http://localhost:5173)
npm run dev:tv

# Admin portal (http://localhost:5174)
npm run dev:admin

# Cloudflare Worker (http://localhost:8787)
npm run dev:api
```

## Type-check

```bash
npm run typecheck
```

## Lint

```bash
npm run lint
```

## Tests

```bash
npm test
```

## Validate sample schedule

```bash
npm run validate:sample
```

## Build all

```bash
npm run build
```

## Per-package builds

```bash
npm run build --workspace=packages/shared
npm run build --workspace=apps/tv
npm run build --workspace=apps/admin
```

## Cloudflare Worker

The worker requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
Before deploying:

1. Run `wrangler d1 create bus-schedule-db` to provision the D1 database.
2. Uncomment and fill in the `[[d1_databases]]` block in `workers/api/wrangler.toml`.
3. Run `wrangler deploy` from `workers/api/`.

> **Never commit `.dev.vars`, `.env*`, or any secret files.**

