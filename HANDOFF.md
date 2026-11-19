# Medexera Attendance System — Hand-off & Architecture

Everything built in this project, from the standalone prototype to the Cloudflare-connected multi-user platform.
Written so any developer can continue immediately.

---

## 1. What It Is

A web application for **Medexera Services & Communication** that handles:
- Daily attendance entry per department / team (On time, Late < 2h, Late > 2h, NSNC, Permission, Off day).
- Employee status tracking (Active, Resigned, Terminated, Resigned on the spot, Transferred).
- Staged approval workflows (**Leave**, **Permission**, **Borrow** with Cairo 15th–20th rule, **Resignation**) through Team Leader → Operations Manager → CEO.
- **Actions & Warnings** with printable official Violation Forms, EGP deduction calculations, and employee signature acknowledgments.
- Comprehensive reports and formatted **Excel & PDF exports** (with Arabic letterheads and official logo).
- Role-based user accounts and permissions with Obsidian & Gold / Star White theme modes.
- **Live Attendance** shift tracker (overnight 19:00–04:00 Cairo time, break tracking, manager corrections).
- **Direct Cloudflare D1 Sync:** Multi-user shared database hosted on Cloudflare's free tier.

| Item | Details |
|---|---|
| **Frontend Entry Point** | `public/index.html` & `_t.html` (100% complete feature set, ~308 KB) |
| **Backend API** | Cloudflare Pages Functions in `functions/api/` (`state.ts`, `health.ts`) |
| **Database** | Cloudflare D1 (Serverless SQLite) configured in `wrangler.toml` & `migrations/` |
| **Hosting Platform** | Cloudflare Pages (free `*.pages.dev` subdomain, $0/month bill) |
| **Libraries (Pinned)** | ExcelJS 4.4.0, html2canvas 1.4.1, jsPDF 2.5.1, Google Fonts |

---

## 2. Architecture: Local-First with Edge Cloud Sync

```
Staff Browsers (Phones, Desktops, Any Office Device)
                   │
                   ▼
  Cloudflare Edge (https://medexera-attendance.pages.dev)
                   │
   ┌───────────────┴────────────────┐
   ▼                                ▼
Static App Shell              Pages Functions (/api/state)
(public/index.html)                 │
   │                                ▼
   ├── 0 ms Local Cache       Cloudflare D1 Database
   │   (localStorage['atx'])  (app_state table)
   │                                │
   └── Background Cloud Sync ◄──────┘
```

### How the Cloud Sync Works:
1. **Instant UI Load (0 ms):** When staff opens the page, it reads `localStorage['atx']` instantly. There is never any loading spinner or blank page delay.
2. **Cloud Merge on Boot:** Right after rendering, `initCloudSync()` calls `GET /api/state`. If a remote state exists in D1, it merges and updates the local state, re-rendering with fresh office-wide records. If D1 is empty on first run, it automatically seeds D1 from the client.
3. **Optimistic Debounced Save:** Whenever `save()` is triggered (attendance entry, request approval, violation issued), it writes to `localStorage` immediately, updates the header indicator to `☁️ Saving…`, and debounces a `POST /api/state` call to Cloudflare D1 (400 ms).
4. **Visual Sync Indicator:** Located in the header next to Logout:
   - `☁️ Synced`: Saved and confirmed in Cloudflare D1 (green `#2e9a3a`).
   - `☁️ Saving…`: Syncing in progress (gold `var(--g2)`).
   - `☁️ Local`: Offline or local fallback (neutral `var(--mu)`).

---

## 3. Data Model (State Object `S`)

```javascript
S = {
  emps: [        // 74+ employee roster
    { id, d, sd, us, ar, title, left, lf, st, sdt, to, hire, perm, nno, phone, nationalId, address }
  ],
  recs: [        // Attendance entries
    { id, e, d, s, k, att, nid, note, by, at, reqId }
  ],
  reqs: [        // Requests (leave, perm, borrow, resign)
    { id, t, e, ar, us, dept, pos, by, at, date, tl, steps: [{st, d, by, sig, note, at}], status, stage, sig, cov }
  ],
  acts: [        // Disciplinary actions & violation forms
    { id, e, date, t, reason, note, vf, ded: {amt, why}, by, role, sig, at, empSig }
  ],
  aud: [         // Append-only audit history
    { t, u, a, d }
  ],
  users: [       // User accounts & RBAC
    { n, role, emp, t: ['new','rec','dash','live','req','inb','aud','set'], salt, ph, st }
  ],
  leaders: {},   // Team leaders: 'Dept|Team' -> employeeId
  oms: {},       // Operations managers: 'Dept|Team' -> employeeId
  pts: {},       // Scoring rules
  departments: [], // Registered departments
  live: {},      // Live shift tracking & schedules
  me: 0          // Current user index
}
```

---

## 4. Cloudflare D1 Database Schema

Defined in `migrations/0001_create_app_state.sql`:

1. **`app_state` (Authoritative Current State):**
   - `id TEXT PRIMARY KEY`: `'current'`
   - `state_json TEXT NOT NULL`: Complete JSON serialized state `S`
   - `version INTEGER NOT NULL DEFAULT 1`: Auto-incrementing version counter
   - `updated_by TEXT`: Username of last actor
   - `updated_at TIMESTAMP`: Last sync timestamp
2. **`state_snapshots` (Point-in-Time Recovery Backup):**
   - Stores immutable snapshots on every save so historical state can be restored if an admin makes an error.

---

## 5. Developer & Deployment Guide

### Local Development:
```bash
# Set Node.js path (if using portable installation)
$env:PATH = "C:\Users\NateHollister\OneDrive - Folsom Psychiatry Associates\Desktop\Node\node-v26.13.0-win-x64\node-v26.13.0-win-x64;" + $env:PATH

# Start local Cloudflare Pages + D1 emulation
npm run dev
# Or directly: npx wrangler pages dev public --d1=DB
```
Open **`http://localhost:8788`** to preview the full application connected to local D1 storage.

### Production Deployment to Cloudflare (Free Tier):
```bash
# 1. Login to Cloudflare CLI
npx wrangler login

# 2. Create remote D1 database on Cloudflare
npx wrangler d1 create medexera-attendance-db
# Copy the returned database_id into wrangler.toml

# 3. Apply SQL migrations to the remote D1 database
npm run db:migrate:remote

# 4. Deploy Pages static app and Functions
npm run deploy
```

---

## 6. What Was Preserved (100% Fidelity)
- [x] All printable legal violation forms with checkboxes and letterhead.
- [x] All Excel export formatting (grouped by department, colors, points).
- [x] All PDF export routines with logo and Cairo stamps.
- [x] All 74 employees and historical attendance records.
- [x] All animations (header sweep, drifting login orbs, modal springs).
- [x] Complete Live Attendance shift tracker and break timer.
- [x] Multi-candidate MA coverage workflow.
- [x] Full settings workforce manager with 10-per-page user table pagination.

## Backend implementation progress

### Step 1 — Versioned database snapshots
- Added `migrations/0002_snapshot_versions.sql` to associate recovery snapshots with the authoritative `app_state.version`.
- The initial schema remains unchanged; existing snapshots are retained with a null version.
- Next: apply the migration locally and remotely through the documented D1 migration commands, then update the state API to use compare-and-swap writes and bounded snapshots.

### Step 2 — Version-checked state API
- `GET /api/state` now returns version `0` for an uninitialized database and disables caching for every response.
- `POST /api/state` requires `{ state, version }`, validates the state shape and 2 MB size limit, and uses a conditional D1 upsert. Stale clients receive HTTP 409 and the current version.
- Recovery snapshots are recorded on the first and every tenth successful save and pruned to the latest 200. Snapshot failures do not undo a successful state save.
- Next: update both frontend copies to carry the server version and visibly stop on a conflict; apply both D1 migrations locally.

### Step 3 — Frontend version-aware sync
- Updated `_t.html` and `public/index.html` to retain the cloud version, send it with each save, and consume the returned version.
- HTTP 409 conflicts now pause further cloud writes and display “Reload to sync” with a toast explaining that newer shared data exists.
- Next: make the D1 scripts apply both migrations, run them against local D1, and check that the endpoint and client payloads align.

### Step 4 — Tracked D1 migrations
- Replaced repeatable raw SQL execution scripts with Wrangler's migration runner, which records applied migration filenames in D1 and prevents replaying `ALTER TABLE` changes.
- The first local schema application succeeded; a repeated raw invocation correctly exposed that migration 0002 was not idempotent. The runner change addresses repeat runs going forward.
- Next: reconcile the already-created local schema with Wrangler's migration ledger and confirm no pending migration remains.

### Step 5 — Local D1 migration state
- The local D1 database now contains `app_state`, `state_snapshots.state_version`, and the matching snapshot version index.
- Reconciled migrations 0001 and 0002 into Wrangler's local migration ledger after the initial raw SQL application, then ran `npm run db:migrate:local`; Wrangler reported `No migrations to apply!`.
- Remote migrations have not been run. `wrangler.toml` still uses the placeholder database ID, so create a D1 database and set its UUID before applying remote migrations or deploying.

### Step 6 — Serialize saves from each browser
- Queued a second local save while a request is in flight, then sends it with the newly acknowledged version. This avoids false conflicts when a slow request overlaps the next debounce.
- Follow-up completed in Step 7: API requests now require a valid Cloudflare Access JWT. The local user picker remains client-side only, so server-side role mapping is still a separate requirement.

### Step 7 — Cloudflare Access verification on API routes
- Added `functions/api/_middleware.ts` using Cloudflare's official Pages Access plugin. It validates the signed Access JWT against the configured team domain and application audience; missing configuration fails closed with HTTP 503 and unauthenticated API requests return HTTP 401.
- Added `@cloudflare/pages-plugin-cloudflare-access` as a runtime dependency.
- Required Pages environment variables: `ACCESS_TEAM_DOMAIN` (for example `https://your-team.cloudflareaccess.com`) and `ACCESS_AUD` (the Access application's AUD tag). Set these for local, preview, and production environments before API calls can succeed.
- Cloudflare dashboard setup remains required: create an Access application and policy covering the Pages hostname so the seeded static employee data is also protected. The existing browser-side roles are still not server-authoritative; map Access identities to application roles before treating them as trusted authorization.


### Step 8 — Access identity mapping schema
- Added `migrations/0003_access_user_map.sql`, a D1 allowlist mapping verified Access email addresses to unique Medexera usernames with an active flag.
- No mappings are seeded because the organization’s verified email addresses are not present in the project. API state access will be denied until an administrator adds mappings.
- Next: enforce these mappings on state reads and writes, bind the frontend acting account to the mapped username, then apply migration 0003 locally.

### Step 9 — Bind state API to mapped account
- `GET /api/state` now returns state with `me` set to the username mapped from the verified Access email. Unmapped, disabled, or missing Medexera accounts receive HTTP 403.
- `POST /api/state` requires `state.me` to match the mapped account, attributes writes to that server-resolved username, and permits initial database seeding only from the mapped Admin account.
- Non-admin state saves cannot change the account list/roles or team-wide leader, manager, scoring, and department settings.
- Next: connect the frontend session to the mapped username and apply migration 0003 locally. Fine-grained authorization of every attendance/request/action field remains future work because the app currently submits whole-state replacements.

### Step 10 — Frontend account binding
- On cloud load, both frontend copies now select the mapped account, set the session username to that account, and reject attempts to sign into a different Medexera username under the same Access identity.
- If the backend cannot map the Access identity to an existing state account, the client shows an access error and does not attempt to seed data.
- Next: apply migration 0003 locally and document the SQL procedure for adding the first Admin mapping and additional staff mappings.

### Step 11 — Local account-map database
- Applied `0003_access_user_map.sql` through Wrangler’s tracked migration runner; the local database now records the new table and the next migration run will not replay it.
- To authorize the first account after providing the real Cloudflare Access email, insert a row with `app_username` set to the existing initial `Admin` username. For example: `INSERT INTO access_user_map (email, app_username) VALUES ('admin@company.example', 'Admin');` Run through `wrangler d1 execute medexera-attendance-db --local --command="..."` for local D1 or `--remote` after configuring the real database ID.
- Add additional rows only for existing `S.users[].n` usernames. Set `is_active=0` to disable a mapping.
- Next: configure the actual team domain, Access AUD, site Access policy, and real email mappings. Fine-grained per-action authorization is still required before claiming full server-side RBAC.

### Step 12 — Append-only audit guard
- State saves now preserve the existing audit log as an unchanged suffix, reject deletions/reordering/edits, and require each new entry to name the server-mapped account.
- Added regression tests for audit deletion and forged attribution.
- Next: run the expanded tests and the Pages Functions build, then record the results below.

### Step 13 — Test and build results
- Added `tests/state.test.mjs` and `npm test` (`node --test`). Latest run: **9 passed, 0 failed**.
- Coverage at this stage: authenticated GET identity, missing-account rejection, POST impersonation rejection, non-admin role/settings protection, stale-version conflict, authorized save, Admin-only initial seed, audit deletion rejection, and forged audit attribution rejection. Step 14 records the latest session-auth verification.
- Pages Functions build: `npx wrangler pages functions build functions --outdir .wrangler/functions-test-build --project-directory .` — **compiled successfully**.
- The Node test run prints a `MODULE_TYPELESS_PACKAGE_JSON` warning while importing the TypeScript function file; tests still pass. JWT signature verification was not exercised against a live Cloudflare Access tenant because its domain/AUD and account policy are not configured in this workspace.
- Next: superseded by Step 14; per-action server authorization still needs completion before treating non-admin roles as fully enforced.

### Step 14 — Free-plan D1 account sessions
- Replaced the Access email mapping requirement for application login with Medexera username/password authentication backed by D1. Password verification stays server-side; session tokens are random, HttpOnly, SameSite=Strict cookies and only their SHA-256 hashes are stored in D1. Sessions expire after 12 hours.
- Added migration `0004_app_sessions.sql` for session storage and per-username/source login throttling (seven failed attempts trigger a 15-minute lock). Applied it to the local Wrangler D1 database.
- Added `/api/auth/login`, `/api/auth/logout`, and the one-time `/api/auth/bootstrap` route. Initial Admin setup requires a `BOOTSTRAP_TOKEN` Pages secret of at least 32 characters; setup works only while the D1 state is empty. Configure it in local, preview, and production environments before first setup.
- Added global Pages middleware and `public/_routes.json` so the static app shell and its embedded employee data are served only to a valid D1 session or during the one-time Admin bootstrap. Unauthenticated browser requests receive the standalone login page; unauthenticated API calls receive HTTP 401.
- Updated both `public/index.html` and `_t.html` to use server login/logout and to wait for the first Admin state save before finishing bootstrap. The app API continues to redact password hashes from GET responses and preserve stored hashes on later saves.
- Cloudflare Access mappings and the Access plugin are no longer required for this login flow; Steps 7–12 above are retained as implementation history and superseded for deployment. Migration 0003 remains harmless but unused by this flow.
- Added `tests/auth.test.mjs` for a successful credential login/session cookie, cross-origin login rejection, and wrong-password rejection without session issuance.
- Verification: `npm.cmd run db:migrate:local` applied migration 0004 successfully; latest `npm.cmd test` — **12 passed, 0 failed**; `npx.cmd wrangler pages functions build functions --outdir .wrangler/functions-test-build --project-directory .` — **compiled successfully**. Node prints non-fatal `MODULE_TYPELESS_PACKAGE_JSON` warnings for test-imported TypeScript modules.
- Remaining deployment steps: provide a Pages `BOOTSTRAP_TOKEN` secret for the target environment and deploy `public` with Pages Functions. Remote migrations 0001–0004 are recorded in Step 15. Rotate or remove the bootstrap secret after setup if reinitialization is not expected.
- Scale note: this removes the Cloudflare Access 50-seat constraint; 200 app accounts can use the Free plan while request, D1 read/write, and storage activity stays within Free quotas. The state API still sends the full application state on save, so large roster/attachment usage and fine-grained server-side authorization need further work before broad production use.

### Step 15 — Remote database and local self-test
- Confirmed Wrangler is authenticated to the Cloudflare account and found the existing Pages project `medexera-attendance` plus an empty D1 database.
- Replaced the placeholder D1 `database_id` in `wrangler.toml` with the account's actual database ID and applied migrations 0001–0004 to the remote database. This database had zero tables and no application records before migration.
- Removed the `--d1=DB` dev override so Wrangler uses the configured D1 database ID; applied local migrations 0001–0004 to the same local database the Pages dev server binds.
- Added `.dev.vars` with a local-only `BOOTSTRAP_TOKEN` and `.gitignore` entries for local secrets, environment files, Wrangler state, and installed dependencies. The local bootstrap token is intentionally not recorded here.
- Started the Pages local development server at `http://127.0.0.1:8788`. Smoke check: page returned HTTP 200; bootstrap returned HTTP 200; using its cookie, `/api/state` returned the expected empty-state Admin bootstrap response. Wrangler reports the configured local D1 binding and local secret loaded.
- You can test now on this computer: open `http://127.0.0.1:8788`, choose **First-time Admin setup**, enter the local bootstrap token provided in the chat, and create an Admin password. Local state is separate from Cloudflare's remote D1.
- A public Pages deployment has not been made. Before deploying for an online test, set `BOOTSTRAP_TOKEN` as a Pages secret for the selected environment; the currently running local server uses only `.dev.vars`.

### Step 16 — Repair corrupted text encoding
- Repaired mojibake in `_t.html`, `public/index.html`, and this handoff: English punctuation/icons now decode correctly, and the Arabic text in both app copies is restored as Unicode.
- Scanned project source/documentation files while excluding dependencies, Wrangler state, and downloaded/generated assets. The other scanned source files, including `_t.backup.html` and the frontend skill, did not contain the same corruption.
- Static character scan after repair found no common mojibake markers, Unicode replacement characters, or C1 control characters in the affected files. No test suite was run for this text-only cleanup.

### Step 17 — Repair Excel report downloads
- Fixed all 16 workbook export paths in `_t.html`, `public/index.html`, root `index.html`, and `_t.backup.html` to save through a browser-native Blob/object-URL download instead of the Claude-only `window.claude` downloads capability.
- The three spreadsheet/document libraries were only present at project root with `.download` suffixes, outside the Pages deployment directory. Copied them into `public/` with `.js` names and updated all app copies to reference the deployed assets.
- Allowed those static library files through the one-time bootstrap middleware so the initial Admin setup page can load its dependencies before the first session is issued.
- Source check found 16 workbook writes and 16 browser-download calls, no stale `.download` script references, and all three required libraries present in `public/`. No automated tests were run for this frontend-only repair.

### Step 18 — Repair PDF and form downloads
- Replaced the Claude-only download capability for generated PDFs, uploaded attachments, and stored form files with the shared browser-native download helper in `_t.html`, `public/index.html`, root `index.html`, and `_t.backup.html`.
- All generated form PDFs use the shared `pdfOf()` pipeline, so leave/permission/borrow/resignation forms, termination forms, action/warning forms, and violation forms now save the jsPDF Blob through the browser download helper. Existing PDF attachments use the same helper.
- The Pages copy of jsPDF and html2canvas is available as JavaScript assets from Step 17. Verified all four HTML copies contain the browser download helper and PDF path and that no `claude.use('downloads')`/`dl.save()` calls remain. No automated tests were run for this frontend-only repair.

### Step 19 — Backend and database deployment readiness audit
- Confirmed `wrangler.toml` points binding `DB` to the real D1 database `medexera-attendance-db` (`bc96ceda-5f0e-4a5b-bde7-a7749d1dc893`). Remote D1 contains the tables from migrations 0001–0004; `app_state` has zero rows, so Admin bootstrap has not been completed remotely.
- Confirmed the Pages project `medexera-attendance` exists. Wrangler reported no `BOOTSTRAP_TOKEN` secret in either production or preview. The public `medexera-attendance.pages.dev` URL returned HTTP 522 during this check; a successful deployment of the current code has not been confirmed.
- Latest verification: `npm.cmd test` — **12 passed, 0 failed**; `npx.cmd wrangler pages functions build functions --outdir .wrangler/functions-readiness-check --project-directory .` — **compiled successfully**.
- Upload prerequisites: configure the `DB` binding for the target Pages environment using the Wrangler configuration or dashboard, add an encrypted `BOOTSTRAP_TOKEN` secret (at least 32 characters), then deploy `public` together with Pages Functions. For a safe preview, use a separate staging D1 database and apply migrations there rather than letting preview write to the production database.
- Production-readiness gap: state reads currently return the full employee/application dataset to every authenticated account, and writes do not yet enforce every role-specific record/action permission server-side. Finish fine-grained authorization and data minimization before giving broad staff access to sensitive employee records.

### Step 20 — Complete pre-deployment environment setup
- Created a separate Cloudflare D1 database `medexera-attendance-staging` (`4ea56850-6f8e-44fe-a6dd-d48f6eb16003`), configured it as the Pages `preview` environment's `DB` binding, and applied migrations 0001–0004. Production and preview now use separate D1 databases; both are still empty.
- Generated independent 32-byte bootstrap tokens and stored them as encrypted `BOOTSTRAP_TOKEN` secrets in the Pages `preview` and `production` environments. Secret values are intentionally not stored in this file.
- Added `npm run db:migrate:preview` and `npm run deploy:preview` scripts for the isolated preview workflow.
- Verified Wrangler lists the secret in both environments and preview D1 has the expected schema. The Pages Functions build succeeds; the latest backend test run remains **12 passed, 0 failed**.
- Deployed the preview build to `https://preview.medexera-attendance.pages.dev` (deployment: `https://9b3de313.medexera-attendance.pages.dev`) using the isolated staging D1 database. Production was not deployed or modified by this release.
- Online smoke checks of `/`, `/login.html`, `POST /api/auth/bootstrap`, and `/api/state` all returned Cloudflare Access sign-in HTML (HTTP 200) instead of the app or expected JSON. Therefore the app-level bootstrap/login and API have not yet been smoke-tested online; no bootstrap completed and staging `app_state` remains empty.
- Cloudflare's Pages docs say the project-level preview access policy is controlled at **Workers & Pages > medexera-attendance > Settings > General > Enable access policy**. It only applies to preview deployment URLs. The current Wrangler credential cannot manage Access policy, so this dashboard setting needs to be disabled for public preview testing. Then rerun the online smoke checks and complete Admin bootstrap using the preview-only token already shared in the handoff conversation. Keep production on its own DB and token.
- Latest verification before upload: `npm.cmd test` — **12 passed, 0 failed**; Pages Functions build — **compiled successfully**. The deployment upload succeeded, but the online application test is blocked by the Access gate.

### Step 21 — Inspect staging D1 schema in Cloudflare dashboard
- The Cloudflare D1 Console query against `medexera-attendance-staging` returned `_cf_KV`, `access_user_map`, `app_state`, `auth_login_attempts`, `auth_sessions`, and `d1_migrations`, confirming the remote staging database is populated with the main app schema. An empty `app_state` row set before Admin setup is expected.
- The `d1_migrations` ledger shows migrations 0001–0004 recorded as applied on 2026-11-05 at 21:47:06. `state_snapshots` is absent from the displayed schema despite those migrations; migration 0001 creates it and migration 0002 alters it. This is live schema drift (the table may have been removed after migration, or the deployed migration history differs from the current local files); the ledger alone does not identify the cause. Production database schema has not yet been confirmed in the dashboard.
- `functions/api/state.ts` attempts to write a recovery snapshot on saves and catches snapshot errors, so primary state saves can continue while recovery snapshots fail. Restore the missing table through a new forward migration after checking the production schema; do not rerun or edit already-recorded migrations.
- A read-only Wrangler D1 list check could not verify Cloudflare state in this session because the Cloudflare API returned authentication error 10000. Do not assume dashboard/workspace mismatch or rerun migrations until the migration ledger and production schema are checked.

### Step 22 — Preview bootstrap runtime check
- The online preview login page reports **“Initial Admin setup is not configured.”** In `functions/api/auth/bootstrap.ts`, that exact response is returned when the deployed Pages Function does not receive `BOOTSTRAP_TOKEN` (HTTP 503), before it can validate a submitted token or create an Admin session.
- Therefore no one completed initial Admin setup through this preview flow; a teammate may have opened the page, but could not create the first account through this endpoint. The D1 `app_state` row was previously confirmed empty. A normal page visit would not remove `state_snapshots`.
- The dashboard screenshot confirms a secret named `BOOTSTRAP_TOKEN` exists in the environment shown, but the cropped image does not show whether that environment is Preview or Production, nor whether a deployment was made after setting it. The runtime result proves the currently loaded preview function cannot read it. Check the Preview environment for this exact Pages project, then create a new preview deployment after confirming the secret is there. Do not paste the token into chat or share it with staff.

### Step 23 — Redeploy preview and recheck bootstrap
- Created a fresh preview deployment on 2026-11-06: `https://59b06c3b.medexera-attendance.pages.dev` (alias `https://preview.medexera-attendance.pages.dev`). Upload completed successfully; production was not deployed.
- Sent a bootstrap request with a dummy, deliberately invalid token (no user data changed). The endpoint returned HTTP 503 JSON `Initial Admin setup is not configured`, confirming the new preview Function still does not receive `BOOTSTRAP_TOKEN`.
- Next: verify the secret appears specifically under this Pages project's **Preview** environment (not Production or a separate Worker project), then deploy again. Do not submit a real bootstrap token until the endpoint returns `Setup token is incorrect` for a dummy token (HTTP 403), which confirms the secret is loaded.

### Step 24 — Restore preview bootstrap secret binding
- Re-applied the existing preview bootstrap token directly with `wrangler pages secret put BOOTSTRAP_TOKEN --project-name medexera-attendance --env preview`; Wrangler confirmed it updated the Pages **preview** secret. The token value remains secret and is not recorded here.
- Created preview deployment `https://05b43fa4.medexera-attendance.pages.dev` (alias `https://preview.medexera-attendance.pages.dev`). No production deployment occurred.
- Online checks now pass: `/` returns HTTP 200 with the Medexera login page and no Cloudflare Access HTML; a same-origin bootstrap request using a dummy token returns HTTP 403 `Setup token is incorrect` (expected and confirms `BOOTSTRAP_TOKEN` is available to the Function). The dummy request created no account or data.
- Preview Admin setup can now be tested using the preview token already shared in the handoff conversation. Staging D1 remains isolated from production; do not share the setup token with staff. No production database changes were made.

### Step 25 — Check preview login API response
- Sent a same-origin diagnostic login request with a nonexistent test username and dummy password to the current preview alias. The live endpoint returned HTTP 401 `application/json` with `Username or password is incorrect`, confirming `/api/auth/login` is routed to the Pages Function and credential failures use the expected JSON response.
- A read-only check of `https://medexera-attendance.pages.dev` returned Cloudflare HTTP 404; the tested current app is at `https://preview.medexera-attendance.pages.dev`. This diagnostic login request records one failed-login throttle entry for its test username/source; it did not create an account or change application state. The user later supplied a browser screenshot confirming they are on the correct preview alias, disproving the earlier wrong-host guess. A browser-specific/intermediary response remains possible; next inspect `/api/state` from that same browser, then the login request's URL/status/content type if needed.

### Step 26 — Fix Cloudflare PBKDF2 limit and recover Admin login
- Used `wrangler pages deployment tail` to capture the exact runtime error on Admin login: `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 120000).` This caused the HTML 500 response and JSON parse error. Unknown-user login had returned JSON because it did not run password verification.
- Updated password hashing in the app copies and server login verifier to 100,000 PBKDF2-SHA256 iterations, Cloudflare's supported ceiling. Existing Admin hashes were created at 120,000 and cannot match the new verifier, so added a token-protected, one-time Admin recovery path. It resets the Admin password with the supported hash, records an audit entry, advances the state version, revokes old sessions, and issues a new session. It marks recovery used on the Admin account so the recovery token cannot be used a second time.
- Added the Admin password recovery form to `public/login.html` and middleware route allowlist, plus tests for successful recovery and wrong-token rejection.
- Verification: `npm.cmd test` — **14 passed, 0 failed**; Pages Functions build compiled successfully. Deployed preview `https://fbf6afee.medexera-attendance.pages.dev` (alias `https://preview.medexera-attendance.pages.dev`); production was not deployed.
- Live smoke tests: Admin login with a dummy password now returns HTTP 401 `application/json` instead of an HTML 500; recovery with a dummy token returns HTTP 403 JSON; the live login page contains the recovery form. No account password or application state was changed by these smoke tests. User must use **Admin password recovery** with the preview `BOOTSTRAP_TOKEN` and choose a new password before signing in; successful recovery auto-signs in and invalidates existing sessions.

### Step 27 — Editable employee American name
- Added an editable **American name** field in Settings > Employees for Admin and CEO. It changes only the employee's `us` value; the Arabic `ar` field remains unchanged. Names cannot be blank and are limited to 120 characters. Save Changes persists the update and adds an audit entry.
- When the employee is the Team Leader whose name identifies their team, renaming also updates that team label, its member records, leader/manager map keys, and matching transfer labels. If the new team label conflicts with an existing team in that department, the change is rejected and the editor reverts.
- Applied the same source change to `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html` for project-copy parity.
- Verification before deploy: `npm.cmd test` — **14 passed, 0 failed**; Pages Functions build compiled successfully; Node parsed all **4 inline scripts** in `public/index.html`; source checks confirmed the editable field and audit path in all four copies.
- Deployed the feature to Preview (`https://3bf49c30.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://ba5bce2c.medexera-attendance.pages.dev`, production alias `https://medexera-attendance.pages.dev`). Production `BOOTSTRAP_TOKEN` was re-applied before deployment so Functions receive it.
- Live checks: Preview root returned HTTP 200; Production root returned HTTP 200, `/api/state` returned expected HTTP 401 JSON while signed out, and bootstrap with a dummy token returned expected HTTP 403 JSON, confirming the production secret is bound. These checks changed no application state. Production D1 currently has **0 `app_state` rows** and remains separate from preview; employee records have not been copied between databases. Production needs its own initial Admin setup before it contains employee data.

### Step 28 — Reuse former staff American names
- Added browser autocomplete suggestions to the employee American-name editor for employees marked `left` (resigned) or `terminated`. Suggestions show the former employee's team/department and status so the name can be selected for an existing employee.
- Selecting a suggestion renames only the selected employee's American name. The Arabic name stays unchanged; the former employee record, attendance/history, and audit history are not transferred or deleted. The existing Team Leader/team-label safeguards still apply.
- Kept the feature in sync across `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`. No database migration was needed.
- Verification: `npm.cmd test` — **14 passed, 0 failed**; Pages Functions build compiled successfully; Node parsed all **4 inline scripts** in `public/index.html`; source checks found the suggestions and existing audit path in all four copies.
- Deployed to Preview (`https://870197e8.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://410b6db1.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).
- Live smoke checks: Preview and Production root each returned HTTP 200; `/api/state` returned expected HTTP 401 JSON while signed out. Production D1 remains separate from preview and has no initialized app state, so production suggestions will appear after its Admin setup and employee data are present.

### Step 29 — Restrict request and stored-form deletion
- Added request deletion controls for Admin, CEO, and Operation Manager accounts across the My Requests and filtered request lists. Other roles do not see the Delete control, and the `rqDelete` handler checks the role again before removing anything.
- Deleting a request shows a two-step confirmation. It removes the request and attendance entries explicitly linked to that request, and writes an audit entry identifying the deleting account and number of linked entries removed.
- Stored request-form uploads already had Delete controls restricted to Admin, CEO, and Operation Manager; retained that behavior. Added API enforcement so non-privileged accounts cannot remove request records or stored-form metadata by submitting a crafted state update.
- Kept the UI change in `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`. Added state API tests for denial to an Agent and permission for CEO/OM. No migration required.
- Verification: `npm.cmd test` — **16 passed, 0 failed**; Pages Functions build compiled successfully; Node parsed all **4 inline scripts** in each of the four HTML copies.
- Deployed to Preview (`https://e6a5cc7f.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://e3a73c75.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).
- Live smoke checks: Preview and Production roots returned HTTP 200; `/api/state` returned expected HTTP 401 JSON while signed out. Role-specific deletion was verified with API unit tests; no production application records were changed during deployment or smoke checks.

### Step 30 — Organize role assignments in Titles settings
- Reworked Settings > Titles into six sections below the role count cards: **CEO**, **COO**, **Operation MGT**, **Team Leaders**, **HR**, and **Accountant**. The CEO and COO selectors are separate; Operation MGT contains Agent/MA promotion and per-team OM assignments; Team Leaders contains the department/team assignment grid; HR and Accountant each have a separate employee list and assignment control.
- Added COO as a supported employee title and separate COO department. COO/HR/Accountant assignments retain the employee's prior title and department in `titleHome` when applicable, so they can be restored when the COO is replaced. HR and Accountant are placed in their own departments and excluded from the Team Leaders department grid.
- Team Leader options continue to move an employee into the chosen department/team and prevent assigning reserved leadership/specialist titles there. The existing CEO change behavior remains: the previous CEO becomes an Operations Manager. No D1 migration was needed because employee title/department data is stored in the existing state JSON.
- Title assignment changes employee profiles. Login permissions and login-role bindings remain managed separately in Settings > Access; adding an employee title alone does not create or change a login account.
- Kept all four UI copies aligned: `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`.
- Verification: `npm.cmd test` — **16 passed, 0 failed**; Pages Functions build compiled successfully; Node parsed all **4 inline scripts** in each HTML copy.
- Deployed to Preview (`https://e230c3e7.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://894479e9.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).
- Live smoke checks: both root pages returned HTTP 200; both `/api/state` endpoints returned the expected HTTP 401 JSON while signed out.

### Step 31 — Manage the OM roster from Operation MGT
- Changed the Operation MGT subsection to an OM roster manager only. Removed the per-department Operation Manager assignment grid from that subsection; Team Leaders remains focused on team leaders.
- Admin and CEO can promote active Agents/MAs to OM. The promoted employee's prior Agent/MA title and department/team are saved. Admin/CEO can demote an OM back to a selected department/team; saved title/department are restored where possible. Existing OMs without saved origin data must be assigned a return department/team during demotion. Demotion also clears that employee from team-level OM references.
- Added Admin/CEO checks to the OM promotion, demotion, and team-level OM handler. Enabled the Titles settings tab for CEO accounts as well as Admins.
- Updated `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`; no database migration needed.
- Verification: `npm.cmd test` — **16 passed, 0 failed**; Pages Functions build compiled; all **4 inline scripts** parsed in each app copy; source check confirmed the old team-level OM grid text is absent and the demotion roster control is present in all four copies.
- Deployed to Preview (`https://3e2107e4.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://52ccdc24.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).
- Live smoke checks: both root pages returned HTTP 200; both `/api/state` endpoints returned expected HTTP 401 JSON while signed out.

### Step 32 — Remove Jack Green login and support acting OM team leaders
- Removed the Jack Green login from Preview D1 (staging). Verified the Preview state has no login account named Jack Green; its existing employee profiles remain, along with their attendance/history. Production had no Jack Green login to remove. The Preview app state is at version 97.
- Added active Operation Managers to the Admin/CEO Team Leaders selectors. Assigning an OM to a department/team marks them as an acting Team Leader while preserving their Operations Manager title and OM access. Removing the assignment restores their saved home department/team where available. Existing state validation now retains these acting assignments.
- After Settings are saved, the active page redraws so newly added employees are included in current employee selectors and department-based views. Attendance records remain actual attendance entries; adding an employee does not create an empty record.
- Updated `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`; no database migration required.
- Verification: `npm.cmd test` — **16 passed, 0 failed**; all 4 inline scripts parsed in each of the four app copies. Pages Functions compiled as part of both deployments. Preview and Production root smoke checks returned HTTP 200; both signed-out `/api/state` endpoints returned HTTP 401. Wrangler emitted only its existing outdated-version notice.
- Deployed the same build to Preview (`https://5c7f7048.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://68337d35.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 33 — Include Operation Managers, HR, and Accountants in department pickers
- New Entry now lists employees by job title in the Operation Managers department, so an OM remains selectable there even while temporarily assigned as an acting Team Leader in another department. Team Leader-only filtering remains separate.
- HR and Accountant are now always available department choices for non-Team Leader users, even when no employee is assigned to one of those departments. Employee rows for those departments are selected by HR/Accountant job title, and the two departments are included in employee and transfer destination selectors.
- Updated the change across `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`; no database migration needed.
- Verification: `npm.cmd test` — **16 passed, 0 failed**; all **4 inline scripts** parsed in each app copy. Preview and Production returned HTTP 200 at `/`; both signed-out `/api/state` endpoints returned HTTP 401.
- Deployed to Preview (`https://485034e8.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://901a7507.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 34 — Keep acting OMs outside their temporary teams
- An OM selected as an acting Team Leader remains assigned to **Operation Managers** and is not included as a team member in the selected department's New Entry list. Removing the temporary Team Leader assignment leaves the OM in Operation Managers. Demoting the OM clears any acting Team Leader map before moving them to their selected destination.
- Added a one-time state migration (`m12`) to move existing acting OMs back into Operation Managers while preserving attendance record department snapshots and retaining their Team Leader assignment.
- The OM return department selector now offers HR and Accountant as destinations and saves changes immediately, including clearing the saved return department. This keeps them out of the Team Leader assignment grid while making them available in Settings department selectors.
- Updated `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`; no schema migration.
- Verification: `npm.cmd test` — **16 passed, 0 failed**; all four inline scripts parsed in all four app copies. Both Preview and Production root returned HTTP 200; both signed-out `/api/state` checks returned HTTP 401.
- Deployed to Preview (`https://149e3879.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://46c268f7.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 35 — Route leave and overtime coverage requests
- Annual leave, unpaid leave, and overtime replacement requests now create coverage requests. MA requesters select 1–4 coverage slots; all active MAs in the same department/team receive the request, and the first required number to accept are assigned. Declines leave remaining candidates eligible; if the remaining pool cannot fill every slot, coverage stays incomplete and is not marked approved.
- Leadership day-off requests route through the configured chain: Team Leader → assigned team OM → COO → CEO. OM coverage uses the configured COO, falling back to CEO; COO coverage routes to CEO. CEO/COO may be the same employee. In Settings > Titles, Admin/CEO can assign an OM for each Team Leader team; the COO selector can include the CEO.
- Any assigned coverer can see the request in Coverage Requests/Inbox and respond. Fixed the OM selector so it saves the OM mapping without being mistaken for a Team Leader selector. Updated public/index.html, _t.html, index.html, and _t.backup.html; no database migration required.
- Verification: npm.cmd test — 16 passed, 0 failed. All 7 inline scripts parse in each of the four app copies; coverage routing and incomplete-pool behavior are present in all copies.
- Verification after deployment: Preview and Production roots returned HTTP 200; both signed-out /api/state endpoints returned HTTP 401 JSON as expected.
- Deployed to Preview (https://a8e41af5.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://76cc9bc5.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).
### Step 36 — Use explicit MA and OM coverer selection
- MA leave coverage now applies to Annual, Unpaid, Overtime (بدل), and Sick leave, plus early-leave and late permissions. The requester selects one or more active MA coverers by checkbox from the full MA list; employees acting as Team Leaders are excluded. Every selected coverer receives the request and must accept and sign; only after all selected signatures are saved are names/signatures filled into the request form. A selected coverer can decline; an incomplete selected group is not marked covered.
- OM leave/permission coverage uses checkboxes for other active OMs, with the same accept and signature flow. Team Leaders remain covered automatically by their assigned OM without a separate coverage request. Other configured manager coverers can accept or decline their assigned requests.
- Retained the separate unpaid/overtime totals in the leave report and Excel export, and the HR/CEO direct-manager choices in Settings > Titles. CEO direct-manager map saves are allowed by the backend while other protected title maps stay restricted.
- Updated all four app HTML copies. Verification: `npm.cmd test` — **17 passed, 0 failed**; all **7 inline scripts** parse in each of the four copies. Preview and Production roots returned HTTP 200; signed-out `/api/state` endpoints returned HTTP 401 as expected.
- Deployed to Preview (https://f7990398.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://fabcaf4a.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).
### Step 37 — Verify leave report and direct-manager options
- Confirmed the Records > Leave & attendance report displays Unpaid leave days and Overtime (بدل) days, computes those totals from approved leave requests and saved attendance records, and includes both columns in Excel exports.
- Confirmed the Titles > Team Leaders direct-manager dropdown includes active HR employees and the CEO; the selection saves to the department manager mapping. The CEO can save that mapping through the backend while other restricted title settings remain protected.
- This scope was already included in Step 36's Preview and Production deployments, so no new deployment was needed. Verification: `npm.cmd test` — **17 passed, 0 failed**; all **7 inline scripts** parse in each of the four app copies.

### Step 38 — Shift Live Attendance button to the first position on the left
- Shifted the **Live Attendance** navigation button to be the first tab button on the left.
- Removed `#tabs [data-t="live"]{margin-left:auto}` from the CSS stylesheet so the tab button aligns to the left with the standard navigation layout instead of being pinned to the far right.
- Updated the initial static markup inside `<nav id="tabs">` to position `<button class="tab" data-t="live">Live Attendance</button>` as the first child before New Entry.
- Updated dynamic tab generator `nav()` to prepend Live Attendance (`ts.unshift('live')`) so Live Attendance renders as the first tab on the left for all roles.
- Maintained 100% hash parity across all four application copies: `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`.

### Step 39 — Department attendance Excel export matching official format
- Replaced the simple table export in `liveExportExcel()` with an ExcelJS workbook (`.xlsx`) that groups every employee by department and team/section, exactly matching the company's daily attendance layout.
- Added header formatting: `Date:,,[Day],[Month],[OrdinalDay],[Year]` (e.g. `Tuesday, November, 10th, 2026`).
- Department grouping order:
  - **Operation Managers** (OMs with status)
  - **Medical Assistants** (each team/floor section with Team Leader and Agents numbered)
  - **Billing** (with Collection, Check Insurance, Workers Comp subsections and respective TLs)
  - **Intake Team** (Team Leader and Agents)
  - **Documentation**, **Marketing / Software**, **TMS & Spravato**, **Quality**, **Opening**, **Front Line – Triage**, **Referral Team**, **Credentialing**
  - Automatic fallback for any additional departments and active employees.
- Statuses and columns: `No.`, `USA Name`, `Agent Name (MA)`, `Status`, `Duration`, `Notes`. Populates real statuses from live sessions, daily records, and approved requests (`Present`, `Late` with minutes, `OFF` with leave type, `No Show`, `Permission`).
- Added a `Department Attendance (Excel)` button on the Dashboard tab so users can also export this layout for any selected date.
- Verification: `npm.cmd test` — **17 passed, 0 failed**; all **4 inline scripts** parsed with 0 errors. Maintained 100% hash parity across all four copies.
- Deployed to both **Preview** (`https://preview.medexera-attendance.pages.dev`) and **Production** (`https://medexera-attendance.pages.dev`).

### Step 40 — Company logo header integration in Excel export
- Integrated the official Medexera Services Communications company logo banner into the department attendance Excel generator (`liveExportExcel`).
- Embedded the image as an optimized base64 PNG asset (`EXCEL_LOGO`) directly into all four application copies, avoiding external network dependencies during export.
- Configured the top rows (Rows 1–3) with row height 26 and embedded the banner with exact coordinates `{ tl: { col: 0.1, row: 0.1 }, ext: { width: 680, height: 76 } }` using ExcelJS's native `addImage` and `ws.addImage` APIs.
- The company logo banner renders centered across columns A–F right above the Date row (`Date:,,[Day],[Month],[OrdinalDay],[Year]`), matching the SharePoint reference document.
- Verification: `npm.cmd test` — **17 passed, 0 failed**. All 4 copies verified with identical SHA-256 hash `952BB958902D40961DC883B2043A14DB52FD98DB56FB4CA7EBB878B00E7DBB10`.
- Deployed to both **Preview** (`https://34c64e8e.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and **Production** (`https://961dadaf.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 41 — Investigate report that the project is not running
- Started the local Cloudflare Pages runtime with `npm.cmd run dev`; Wrangler compiled the Worker and served it at `http://127.0.0.1:8788` with the configured D1 binding.
- Checked Preview and Production: both site roots returned HTTP 200 and both `/api/health` endpoints returned `{"status":"healthy"}`. The root returns the sign-in page to unauthenticated visitors because the app is session protected; this is expected behavior, not the application dashboard.
- Confirmed the local login endpoint returns JSON for a same-origin sign-in attempt (401 for a deliberately nonexistent diagnostic username), so the local Function route is active and does not return an HTML 404 page.
- No code change or deployment was made because these checks did not reproduce an outage. If the user is seeing a blank screen, error, or a failed sign-in after entering credentials, capture that exact screen/message and the URL; this check cannot validate their account or an authenticated session.

### Step 42 — Restore application button interactions
- Root cause: the `liveDur` declaration was part of a comma-separated `const` declaration, but the next line began a new `const EXCEL_LOGO` declaration without terminating the first statement. This produced a JavaScript syntax error (`Unexpected keyword 'const'`) in the main application script; the browser stopped executing it, leaving rendered buttons without working handlers.
- Terminated `liveDur` with a semicolon before declaring `EXCEL_LOGO` in `public/index.html`, `_t.html`, `index.html`, and `_t.backup.html`.
- Verification: all four HTML copies have identical SHA-256 `5ea3a16f470a351bf7fde9436ec7052605b478f60cc70d83b333b56a35e11c72`; all 4 inline scripts parse in all copies. (The full automated test suite was not run.)
- Deployed the same build to Preview (`https://2c98edd1.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://57f1c93c.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 43 — Add restricted employee employment dates to the leave report
- Added Start Date and End Date immediately after Job Title in Records > Leave & attendance report. The columns are shown only to Admin accounts and active employees linked to an Accountant account; both can edit dates inline. End Date is saved as `endDate`; Start Date uses the existing `hire` field.
- New employees now receive the date selected in the employee creation form as their Start Date. The form defaults that date to today, including for permanent employees.
- The state API rejects changes to either employment date from accounts other than Admins and active Accountant-title employees. Report Excel exports include the date columns only for those authorized users.
- Updated all four HTML copies and `functions/api/state.ts`; no database migration is needed because employee data is stored in the existing JSON state.
- Verification: all four app copies have identical SHA-256 `40bd1cfe34866a94436b1c4be1643deb988b8b25993d4186dd3eac93be53cb97`; all 4 inline scripts parse in each copy. Wrangler compiled the Functions bundle during deployment. Preview and Production root/health checks returned HTTP 200. Full automated tests were not run.
- Deployed the same build to Preview (`https://87c114ba.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://509bc676.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 44 — Fill Last Working Day on employee departures
- Selecting Resigned, Terminated, or Resigned on the spot now fills the employee's Last Working Day if no date has already been entered; Terminated uses today. Marking an employee as Left Medexera from New Entry or Settings also fills a missing date with today.
- When a resignation request reaches final approval, its requested last working day is copied to the employee's Last Working Day and the employee status becomes Resigned. Rejected or still-pending resignation requests do not change employee departure data.
- Updated all four application HTML copies; no database migration needed. All 4 inline scripts parse in every copy, with identical SHA-256 `f735de525a4b4c742c16662ac11ad1021a4e827016fc096f6a1db3dbde968b31`. Preview and Production root and health checks returned HTTP 200. Full automated tests were not run.
- Deployed to Preview (`https://ea3b078e.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://940036f3.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 45 — Sync departure dates to the Records report
- Follow-up found that the termination workflow populated `sdt` (the Last Working Day shown in termination records/forms) but left the separate `endDate` field used by the Records report blank. The report now falls back to the recorded Last Working Day for existing departed employees.
- New Terminated, Resigned, Resigned on the spot, approved resignation, and Left Medexera actions now write the same date to both `sdt` and `endDate`. Admin/Accountant edits to End Date also update the Last Working Day. Restoring a terminated employee clears the departure date unless they remain marked Left Medexera.
- The backend allows non-Admin, non-Accountant accounts to update End Date only as part of a synchronized departure/left transition, an approved resignation, or a departure reset; direct date edits remain limited to Admins and active Accountant employees.
- Updated all four app HTML copies and `functions/api/state.ts`. All 4 inline scripts parse in each copy; all app copies have identical SHA-256 `f21e28afbfffbea5b0400d7b24e52822dac2c0abf286f8939380c445dfe58dba`. Wrangler compiled the Functions bundle successfully. Preview and Production roots and `/api/health` both returned HTTP 200.
- Deployed to Preview (`https://1fa30528.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://08e05b89.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).

### Step 46 — Add annual and sick leave balances
- Added a top-level **Leave Balances** section after Employee Info for users who have Records access. It shows Employee, Annual Allowance, Annual Used, Annual Remaining, and Sick Leave Used for a selected year, with an optional department filter.
- Annual and sick usage is calculated from saved attendance entries and approved leave requests, with existing duplicate-day handling. Annual allowance is configurable per employee and year because no company entitlement amount was defined; remaining balance shows `—` until an allowance is set. Admins and active Accountant employees can set or clear the allowance; other roles can view balances only.
- The backend validates year/allowance data and enforces the same Admin/Accountant edit restriction. No database migration is needed; allowances are stored in the existing shared state JSON.
- Updated all four application copies and `functions/api/state.ts`. All 4 inline scripts parse in each app copy; copies share SHA-256 `589f15355cfbaeac22e1de12493061041703e720ca5de4ee1b8449898667da8d`. `npm.cmd test`: **17 passed, 0 failed**. Wrangler compiled successfully. Preview and Production root and health checks returned HTTP 200.
- Deployed to Preview (`https://526787be.medexera-attendance.pages.dev`, alias `https://preview.medexera-attendance.pages.dev`) and Production (`https://77f597b3.medexera-attendance.pages.dev`, alias `https://medexera-attendance.pages.dev`).



### Step 47 - Restrict Leave Balances and add sick allowance / automatic probation
- Leave Balances now shows regular employees only their own row. Admins and active Accountant-linked accounts can see all employees and use the department filter. Yearly annual and sick allowances can be edited only by Admins and active Accountants; Sick Used and Sick Remaining are displayed alongside the annual balance columns.
- Both used totals are calculated for the selected year from saved attendance and approved leave requests. Allowances are stored per employee and year in the shared state; no database migration is needed. The state API validates sick allowances and enforces the same role permissions as annual allowances.
- New employees are created with today as their start date and automatically enter a three-month probation period. Their status changes to Permanent based on that start date when the period expires. Manual status and start-date controls were removed from Employee Settings; the existing Records report date controls remain restricted to Admins and active Accountants.
- Verification: npm.cmd test - 19 passed, 0 failed. All four application HTML copies have identical SHA-256 98e2cc5263f8f3887897d416e319ff8ed79c8c28721fd77dc94a1fbc651c1ea7; all 4 inline scripts parse in each copy. Preview and Production / and /api/health returned HTTP 200.
- Deployed the same build to Preview (https://7a6e2697.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://c4c273d7.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).

### Step 48 - Self-service password changes and first-login enforcement
- Added a Change password action for every signed-in user and a dedicated password page. Users verify their current password, enter and confirm a new password (8-256 characters), and can use the same flow at first sign-in.
- Accounts without a recorded password-change timestamp are forced to the password page at login. This includes existing accounts on their next sign-in and newly added accounts on their first sign-in. Middleware blocks normal pages and API requests until the password is changed. Successful updates store a new salted hash, mark the change time, and invalidate the user's other sessions while issuing a fresh session for the current browser.
- Password recovery marks the replacement password as changed. No database migration is required; the timestamp is stored with the existing user record in shared state.
- Verification: npm.cmd test - 22 passed, 0 failed. Inline scripts parse in all four application copies and in the sign-in and password pages. Preview and Production root, health, and password page checks returned HTTP 200; unauthenticated password-change API requests returned HTTP 401.
- Deployed to Preview (https://80586f4d.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://e1b3a89d.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).

### Step 49 - Show Leave Balances to all users with role-based visibility
- Added Leave Balances to the navigation for every signed-in user, including employee accounts without Records access.
- Regular employees see only their own row. Admins and active Accountants see all employee balances and can edit annual and sick allowances. CEOs and Operations Managers see all employee balances but have read-only access.
- Updated all four app HTML copies. Verification: npm.cmd test - 22 passed, 0 failed; all 4 inline scripts parse in each app copy; Preview and Production root and health checks returned HTTP 200. All four copies share SHA-256 d19c113a546f2ae019a6d50aef5b44225156e630e2e98a33796310bf97548d11.
- Deployed to Preview (https://5c842e84.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://35c3f4ee.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).

### Step 50 - Fix forced password-change redirect loop
- Root cause: Cloudflare Pages normalizes the static route /change-password.html to /change-password. The authentication middleware allowed the .html form only, then redirected the canonical form back to .html, creating a redirect cycle.
- The middleware now allows both /change-password.html and /change-password for authenticated users who must change their password. Password submission remains session-authenticated; all other application pages remain gated until the change is complete.
- Verification: npm.cmd test - 24 passed, 0 failed, including regression coverage for both page URL forms and for redirects from protected application pages. Preview password page and health checks returned HTTP 200; Production health returned HTTP 200.
- Deployed to Preview (https://6b58d699.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://559e2375.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).

### Step 51 - Fix MA leave coverage selection across departments/teams
- Coverage previously identified MA requesters and coverers only when the employee job title was exactly MA. Other employees in the Medical Assistants department fell through to the manager-default path, hiding MA checkbox choices and directing coverage requests to a Team Leader.
- Coverage now recognizes active employees in Medical Assistants (including department/team display variants) and employees with the MA title, excludes Team Leaders, and lists all other active MAs across teams as selectable coverers. MA leave and permission submissions now use this selected checkbox pool and require at least one coverer.
- Verification: npm.cmd test - 24 passed, 0 failed; all four app copies' inline scripts parse. Preview and Production root and health checks returned HTTP 200. All four app copies share SHA-256 bd097b0f0e2786e9fa4202d1e7f0c33c260939b771de3f66e28825e982ad781c.
- Deployed to Preview (https://8e096aac.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://dde486f9.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).

### Step 52 - Restrict MA coverage eligibility to Medical Assistants departments
- Follow-up found that the Step 51 helper also accepted any employee with job title MA, which allowed a Documentation employee (Clark White) into the coverer list. Eligibility now requires the employee to belong to the Medical Assistants department/team, regardless of job-title text; active Team Leaders remain excluded. This includes differently titled or blank-title employees assigned to Medical Assistants while excluding MAs/title values on other departments.
- Updated all four application copies. Verification: npm.cmd test - 24 passed, 0 failed; all inline scripts parse; Preview and Production health checks returned HTTP 200. Copies share SHA-256 a2f93acb431a8d38cdd50a6ade6660e4a0dd5a3428ca0d1554db085dd9ee0155.
- Deployed the correction to Preview (https://94625ce9.medexera-attendance.pages.dev, alias https://preview.medexera-attendance.pages.dev) and Production (https://51f7e750.medexera-attendance.pages.dev, alias https://medexera-attendance.pages.dev).
