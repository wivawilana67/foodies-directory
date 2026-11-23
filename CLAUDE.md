# Foodies Directory — Rules for Engineers and AI Agents

A phone-friendly directory of places to eat for two people, kept in a Google Sheet (tabs "Food List", "Dishes", "Master", English headers since D51). Android installs it as an app; iPhone uses it in Safari. Two parts that talk over one HTTPS endpoint:

- `apps-script/` — backend: a Google Apps Script web app. Reads and writes the sheet, calls the Places API (New), holds the API key, counts spend, runs the backfill.
- `web/` — front end: an installable web app (PWA) served by GitHub Pages. All / Wishlist / Near me lists, place detail and edit, dishes, add a place.

A replacement stack is being built next to it (`docs/decisions.md` D39–D62): `api/` (Django on Cloud Run, Neon Postgres) and `frontend/` (React PWA on Firebase Hosting). Until the switch-over, `apps-script/` + `web/` are the live app.

The Google Sheet is the database. **This repo is public** (free GitHub Pages): no secret, token, script ID, sheet ID or deployment URL is ever committed.

---

## 1. Folder Directory Map

```
/
├── CLAUDE.md                   # This file: coding style, folder map, workflow, git rules
├── AGENTS.md                   # Points other AI agents to CLAUDE.md (also in apps-script/ and web/)
├── README.md                   # Human overview: setup, deploy, install, Business Flow, Data Flow
├── package.json                # Only dependency (clasp) + npm deploy scripts for apps-script/
├── docker-compose.yml          # Local dev for the new stack: db (Postgres 17), api (Django), web (Vite) — Docker only; api migrates on start; placeholder ALLOWED_EMAILS for dev_token
├── firebase.json               # Firebase Hosting: serves frontend/dist, rewrites /api/** to Cloud Run foodies-api
├── .gitignore                  # node_modules/, every real .clasp*.json, .env*, frontend/dist, .firebaserc, *.csv (sheet exports), /icon-source.* (full-size icon picture), local Claude settings
├── .github/
│   ├── workflows/pages.yml     # Publishes web/ to GitHub Pages on every push to master (root) or develop (/test/)
│   ├── workflows/api.yml       # api/: tests in the image; deploys to Cloud Run (develop → dev, master → prod) when CLOUD_DEPLOY is on
│   ├── workflows/frontend.yml  # frontend/: build; deploys to Firebase Hosting (develop → dev, master → prod) when CLOUD_DEPLOY is on
│   └── dependabot.yml          # Weekly bumps of the SHA-pinned actions (PRs into develop)
├── .claude/skills/
│   └── development-documentation/   # Keeps the docs in sync with every code change
├── docs/
│   ├── decisions.md            # Architecture + numbered design decisions (why things are the way they are)
│   └── gcp-setup.md            # Google Cloud setup: verified vs open items, quota plan
├── apps-script/                # Backend (Apps Script, deployed with clasp)
│   ├── CLAUDE.md               # File map, helpers, conventions, domain rules  ← read before editing
│   ├── .clasp.example.json     # Template for the gitignored .clasp-prod.json and .clasp-test.json
│   └── src/                    # Pushed to Apps Script as-is (clasp rootDir)
│       ├── appsscript.json     # Manifest: V8, Asia/Jakarta, web app runs as owner
│       └── *.js                # Api, Config, Sheet, Dishes, Photos, Places, MapsLink, Usage, Backfill, Setup
├── api/                        # New backend (Django in Docker; Phase 3: data model, admin, import, sign-in, JSON API, Places lookup)
│   └── CLAUDE.md               # Files, endpoints, env settings, Docker commands  ← read before editing
├── frontend/                   # New front end (React + TypeScript + Vite; Phases 4–5: lists, place detail and edit, dishes, Add, theme, install, offline, Collections + map)
│   └── CLAUDE.md               # Files, Docker commands, conventions  ← read before editing
└── web/                        # Front end (static PWA, no build step)
    ├── CLAUDE.md               # File map, conventions, platform rules  ← read before editing
    ├── index.html, styles.css  # Single page: list, place, form, add, dish, photos, settings views + bottom tabs
    ├── *.js                    # ES modules: app, state, ui, list, place, dishes, add, photos, api, geo
    ├── sw.js                   # Service worker (network-first, offline fallback)
    ├── manifest.webmanifest    # Install metadata + Android share target
    ├── fonts/                  # Bundled Nunito + Fredoka (woff2) and their OFL licences
    └── icons/                  # PNG icons (192, 512, 180 apple-touch)
```

| Folder | What lives there | Change it when… | Detailed guide |
|---|---|---|---|
| `/` (root) | Docs, tooling, npm scripts | Adding tooling, changing deploy scripts or repo-wide rules | This file, `README.md` |
| `.github/` | Pages deploy workflow, Dependabot | Changing how or when the front end goes live | `secure-github-actions` rules; this file § 5 |
| `docs/` | Decisions and cloud setup | A design decision is made or reversed; GCP setup changes | The file itself |
| `apps-script/` | Backend | Sheet access, Places lookup, link parsing, spend limits, backfill, API actions, photos | `apps-script/CLAUDE.md` |
| `web/` | Phone UI | Anything the user sees or taps; install and share behaviour | `web/CLAUDE.md` |
| `api/` | New backend (replatform) | Endpoints, models, settings, Cloud Run image | `api/CLAUDE.md` |
| `frontend/` | New phone UI (replatform) | Screens of the React app, PWA build | `frontend/CLAUDE.md` |

### Where do I change…?

| I want to change… | Go to |
|---|---|
| Which sheet columns the app reads or writes | `placeFields_()` / `APP_FIELDS` / `DISH_FIELDS` / `MASTER_FIELDS` in `apps-script/src/Config.js` |
| Which fields the phone may edit, and their checks | `EDITABLE_FIELDS` (`Config.js`), `cleanValue_` (`Sheet.js`), `formFields` (`web/place.js`) |
| Dishes and Best Dish | `apps-script/src/Dishes.js` + `web/dishes.js` |
| Labels (rules / chips / form) | `cleanLabels_` (`Sheet.js`) / `renderLabelChips` (`web/list.js`) / `labelsControl` (`web/place.js`) |
| Copy and share text | `placeText`, `copyText`, `sharePlace` in `web/ui.js` |
| Which Google fields are fetched (affects billing) | `PLACE_FIELDS` in `apps-script/src/Places.js` |
| How a Maps or share.google link is understood | `apps-script/src/MapsLink.js` (`resolveShareLink_` for share.google) |
| Language of place names and cities from Places | `PLACES_LANGUAGE` in `apps-script/src/Places.js` |
| Daily / monthly lookup limits | Script Properties `DAILY_LIMIT` / `MONTHLY_LIMIT` (defaults in `Config.js`) |
| A backend action the phone can call | `ACTIONS` in `apps-script/src/Api.js` + the matching `call('…')` in `web/app.js` |
| Backfill behaviour | `apps-script/src/Backfill.js` |
| Own photos: upload, remove, cover, limits | `apps-script/src/Photos.js` + `web/photos.js`; limits `MAX_PHOTOS` / `MAX_PHOTO_BYTES` in `Config.js` |
| Tabs, filters, sort, near me, cards | `web/list.js` + `web/index.html`; tab switching in `web/app.js` (`selectTab`) |
| Place detail and add / edit form | `web/place.js` |
| Install button, iPhone hint, Back button | `web/app.js` (`initInstall`, `popstate`) |
| Look and feel ("Sticker" style) | `web/styles.css` (tokens on `:root`), fonts in `web/fonts/` |
| Theme (System / Light / Dark) | `web/styles.css` (dark tokens) + `applyTheme` / `initTheme` in `web/app.js` |
| Install name, icon, share target | `web/manifest.webmanifest`, `web/icons/` |
| Backend deploy targets or npm scripts | `apps-script/.clasp-*.json` (local only) / root `package.json` |
| Front-end deploy | `.github/workflows/pages.yml` |
| New stack: local dev containers | `docker-compose.yml` |
| New stack: API endpoints / settings / image | `api/config/`, `api/foodies/`, `api/Dockerfile` |
| New stack: tables, admin, sheet import | `api/foodies/models.py` (+ `makemigrations`), `api/foodies/admin.py`, `api/foodies/management/commands/import_sheet.py` |
| New stack: local sample data and sign-in | `api/foodies/management/commands/seed_sample.py`, `dev_token.py` (DJANGO_DEBUG only) |
| New stack: screens | `frontend/src/` (`App.tsx` shell, routes, tabs and share target, `PlaceList.tsx`, `PlaceDetail.tsx`, `PlaceForm.tsx` (add + edit), `DishForm.tsx`, `AddPlace.tsx`, `SignIn.tsx`, `Settings.tsx`, `styles.css`) |
| New stack: Collections and the map | `frontend/src/Collections.tsx`, `CollectionMap.tsx`, `maps.ts`; Select mode in `PlaceList.tsx`; build variables `MAPS_KEY` / `MAP_ID` in `.github/workflows/frontend.yml` |
| New stack: install, offline, share target, theme | `frontend/vite.config.ts` (VitePWA manifest + service worker), `frontend/public/icons/`, `frontend/src/theme.ts`, install button in `frontend/src/App.tsx`; cache headers in `firebase.json` |
| New stack: deploy (Cloud Run, Firebase Hosting) | `.github/workflows/api.yml`, `.github/workflows/frontend.yml`, `firebase.json`; GitHub environment variables `dev` / `prod` |
| Test environment (site path, storage prefix, banner) | `.github/workflows/pages.yml`, `IS_TEST` in `web/api.js`, `apps-script/.clasp-test.json` (local) + `push-test` |

---

## 2. Documentation Map

| File | Audience | Holds |
|---|---|---|
| `CLAUDE.md` (this file) | Engineers + AI | Coding style, folder map, workflow, environments, git |
| `README.md` | Everyone | What the app does, one-time setup, deploy, phone install, **Business Flow**, **Data Flow** |
| `apps-script/CLAUDE.md` | Engineers + AI | Backend file map, reusable helpers, conventions, domain rules and quirks |
| `web/CLAUDE.md` | Engineers + AI | Front-end file map, conventions, platform rules (Android vs iPhone), design tokens |
| `docs/decisions.md` | Engineers + AI | Why: architecture and each numbered design decision |
| `docs/gcp-setup.md` | Owner | Google Cloud state, marked verified or open |

The code wins when docs disagree — then fix the docs in the same change. There are no per-folder READMEs on purpose: one README for people, one CLAUDE.md per folder for detail.

---

## 3. Coding Style

1. **Reuse first.** Search before you write. Each folder's CLAUDE.md lists the helpers to reuse. Extend a helper that almost fits rather than writing a second one.
2. **Shortest correct code.** No speculative abstraction, dead branches, duplicated logic or comments that restate the code. One small function per job.
3. **Security on every path.**
   - Every backend action checks the token first (`assertToken_`); the phone sends it in the JSON body.
   - Validate input on the server; the phone sends a place ID, never place data to write.
   - Neutralize formula injection on every sheet write (`sanitize_`); insert text in the page with `textContent`, never `innerHTML`.
   - The Places API key lives only in Script Properties. No secrets, IDs or URLs from Section 5 in code, logs, docs or commits.
4. **Spend is a feature.** Every Places API call goes through `getPlace_` / `searchText_`, which reserve quota first. No new Places method or field without updating `docs/decisions.md` and checking the price tier.
5. **Logged and fail-loud.** Log entry points and writes (no tokens, no location); catch, log with context, re-throw or return a clear error.
6. **Match the stack.** Live app: Apps Script V8; vanilla HTML/CSS/JS ES modules; Google Sheets as storage. New stack (owner-approved, D39–D62): Django + PostgreSQL in `api/`, React + TypeScript + Vite in `frontend/`. Local tooling runs only in Docker (`docker-compose.yml`); nothing else is installed on the machine. No other framework, runtime package or CDN script without the owner's approval.
7. **Match the surrounding code** — naming, comment density, idiom.
8. **Facts only.** Never invent APIs, sheet headers or rules. Unverified assumptions are marked "Unverified" in code and docs until confirmed.

---

## 4. Every Task

### Before code — read
1. This file, then `README.md` (Business Flow, Data Flow) and `docs/decisions.md`.
2. The CLAUDE.md of every folder you will touch.
3. The source you will change and its callers.

### While changing code
- A change to the API contract (action name, request or response fields) changes both `apps-script/src/Api.js` and `web/` in the same commit.
- Keep the user's sheet data safe: the app appends rows, fills empty cells in its own columns, and changes user cells only through `update` (changed fields only, refused if the cell changed since the phone read it). Never rewrite whole existing rows.
- Every front-end feature must work in iPhone Safari without install (`web/CLAUDE.md` § 5).

### After changing code — update the docs (part of "done")
Use the `development-documentation` skill.

| The change touches… | Update |
|---|---|
| A backend file, helper, action, Script Property or rule | `apps-script/CLAUDE.md`; `README.md` Data Flow if data moves differently |
| A front-end file, view, stored key or platform behaviour | `web/CLAUDE.md`; `README.md` Business Flow if the user sees it |
| A folder, top-level file, coding rule or workflow | This `CLAUDE.md` |
| A design decision (new, changed or reversed) | `docs/decisions.md` |
| Google Cloud setup | `docs/gcp-setup.md` |

### Verify before reporting
- `node --check <file>` on every changed `.js` file in `apps-script/` and `web/` (works for `web/` modules on Node 22+).
- `api/`: `docker compose run --rm api python manage.py test`. `frontend/`: `docker compose run --rm web npm run build` (type-check + build).
- Report what you tested and what you did not. Never claim a push, deploy or test you did not run.

---

## 5. Environments & Data Safety

- **Two backend targets: test and prod.**
  - **Test** = the second Apps Script project, bound to a copy of the sheet ("Foodies Directory TEST"; its `SPREADSHEET_ID` is the copy). `push-test`, editor runs in the test project and the test deployment touch only test data, and may be done when the task needs them.
  - **Prod** = the live Apps Script project on the live sheet. `push-prod`, editor runs in the live project and the live deployment touch live data; do them only when the owner asks in that request.
- **Never committed (public repo):** `.clasp*.json` except the example (`.clasp-prod.json`, `.clasp-test.json`), script IDs (live and test), spreadsheet IDs (live and test), web app URLs (live and test), `API_TOKEN` (live and test), `PLACES_API_KEY`, the names in `PEOPLE`, the Drive photo folder IDs (`PHOTO_FOLDER_ID`, live and test).
- **Backend: deploy only with the root npm scripts.** `npm run push-test` and `npm run push-prod` push code; `npm run pull-test` and `npm run pull-prod` pull it. A web app URL only serves new code after its owner updates that environment's existing deployment to a new version (README → Deploy).
- **Front end: one Pages site, two copies.** `master` is live and publishes at the site root. `develop` is the test copy and publishes under `/test/`. A push to `master` or `develop` that touches `web/` (or the workflow) publishes through `.github/workflows/pages.yml`, which rebuilds the whole site. Nothing else deploys the front end.
- **Backfill** runs from the Apps Script editor, only with the owner's go-ahead: take a backup first (File → Make a copy, or a named version in Version history), run one batch of 15 rows, check it, then the rest.
- **`clasp pull` overwrites local files.** Commit first.

---

## 6. Git Workflow

- Follow `.gitignore`. Review modified and untracked files before staging. Commit doc updates with the code they describe.

### Branching Model
- Two long-lived branches:
  - **`develop`**: the GitHub default branch and the **test** environment; all work is committed to it directly. Every push to it publishes the test copy of `web/` under `/test/`.
  - **`master`**: **prod** (live). Merging into it publishes `web/` at the site root. Both are published by `.github/workflows/pages.yml`.
- **No new branches or worktrees** (`feat/*`, `fix/*`, `chore/*`, `git worktree`, agent worktrees) unless the owner explicitly asks for one in that request. A release is a PR `develop` → `master`, which needs no new branch; `master` is protected (PR only, no force push or delete).
- Work on the checked-out branch (normally `develop`).
- **Merge = deploy.** A push or merge into `develop` publishes the test site; merging into `master` publishes the live site. When a change also touches `apps-script/`, push and update that environment's deployment first: test first (`npm run push-test`, then the test deployment), then prod for a release (`npm run push-prod`, then the live deployment). See README → Deploy.

### Pull and Push
- Before starting: `git checkout develop` and `git pull origin develop`. Commit or stash before pulling.
- Commit and push to `develop` directly. Release PRs go from `develop` into `master`. Never push directly to `master`; never force-push either branch.
