# Progress

| Feature                                      | Status       | Notes                                                              |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| Monorepo and shared contract                 | DONE         | Existing exported types preserved                                  |
| Shared strict validation                     | DONE         | Bilingual errors/warnings; owner must review known-place spellings |
| D1 schema, migrations, CLI                   | DONE         | Local-only by default; remote CLI requires flag and typed YES      |
| Cloudflare Access authentication             | DONE         | WebCrypto RS256; DB allow-list/roles; no app passwords/sessions    |
| Draft CRUD and metadata                      | DONE         | Normalization, validation, revision guards and audits              |
| Preview, publish, snapshot history, rollback | DONE         | Atomic D1 batches, increasing versions, 50-snapshot retention      |
| Public schedule and ETags                    | DONE         | Byte-identical snapshots, conditional 304, public CORS             |
| Single-origin asset assembly                 | DONE         | /tv/ and /admin/ bases; security headers; no SPA fallback          |
| Unit and SQLite integration tests            | DONE         | 127 tests at backend completion; see npm test for current count    |
| Local Wrangler smoke                         | DONE         | 16 checks using isolated local D1/workerd                          |
| TV display UI and offline caching            | PLANNED      | Current page is a placeholder                                      |
| Staff admin/Users UI                         | PLANNED      | Current page is a placeholder; API is ready                        |
| Android launcher                             | PLANNED      | Not part of backend scope                                          |
| Cloudflare provisioning and deployment       | OWNER ACTION | Follow README FIRST DEPLOY; no account changes performed           |

The sample schedule is test data, not a verified public timetable. Deployment is
not a station-ready handover until the real UIs, offline behavior and owner data
verification are complete.
