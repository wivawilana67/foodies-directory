# Foodies Directory — Rules for Engineers and AI Agents

A phone-friendly directory of places to eat for two people, kept in a Google Sheet (tabs "Food List", "Dishes", "Master", with the old "Foodies Checklist" column names). Android installs it as an app; iPhone uses it in Safari. Two parts that talk over one HTTPS endpoint:

- `apps-script/` — backend: a Google Apps Script web app. Reads and writes the sheet, calls the Places API (New), holds the API key, counts spend, runs the backfill.
- `web/` — front end: an installable web app (PWA) served by GitHub Pages. All / Wishlist / Near me lists, place detail and edit, dishes, add a place.

The Google Sheet is the database. **This repo is public** (free GitHub Pages): no secret, token, script ID, sheet ID or deployment URL is ever committed.

---

## 1. Folder Directory Map

```
/
├── CLAUDE.md                   # This file: coding style, folder map, workflow, git rules
├── README.md                   # Human overview: setup, deploy, install, Business Flow, Data Flow
├── package.json                # Only dependency (clasp) + npm deploy scripts
├── .gitignore                  # node_modules/, every real .clasp*.json, local Claude settings
├── .github/
│   ├── workflows/pages.yml     # Publishes web/ to GitHub Pages on every push to master
│   └── dependabot.yml          # Weekly bumps of the SHA-pinned actions (PRs into develop)
├── .claude/skills/
│   └── development-documentation/   # Keeps the docs in sync with every code change
├── docs/
│   ├── decisions.md            # Architecture + numbered design decisions (why things are the way they are)
│   └── gcp-setup.md            # Google Cloud setup: verified vs open items, quota plan
├── apps-script/                # Backend (Apps Script, deployed with clasp)
│   ├── CLAUDE.md               # File map, helpers, conventions, domain rules  ← read before editing
│   ├── .clasp.example.json     # Template for the gitignored .clasp-prod.json
│   └── src/                    # Pushed to Apps Script as-is (clasp rootDir)
│       ├── appsscript.json     # Manifest: V8, Asia/Jakarta, web app runs as owner
│       └── *.js                # Api, Config, Sheet, Dishes, Places, MapsLink, Usage, Backfill, Setup
└── web/                        # Front end (static PWA, no build step)
    ├── CLAUDE.md               # File map, conventions, platform rules  ← read before editing
    ├── index.html, styles.css  # Single page: list, place, form, add, dish, settings views + bottom tabs
    ├── *.js                    # ES modules: app, state, ui, list, place, dishes, add, api, geo
    ├── sw.js                   # Service worker (network-first, offline fallback)
    ├── manifest.webmanifest    # Install metadata + Android share target
    └── icons/                  # PNG icons (192, 512, 180 apple-touch)
```

| Folder | What lives there | Change it when… | Detailed guide |
|---|---|---|---|
| `/` (root) | Docs, tooling, npm scripts | Adding tooling, changing deploy scripts or repo-wide rules | This file, `README.md` |
| `.github/` | Pages deploy workflow, Dependabot | Changing how or when the front end goes live | `secure-github-actions` rules; this file § 5 |
| `docs/` | Decisions and cloud setup | A design decision is made or reversed; GCP setup changes | The file itself |
| `apps-script/` | Backend | Sheet access, Places lookup, link parsing, spend limits, backfill, API actions | `apps-script/CLAUDE.md` |
| `web/` | Phone UI | Anything the user sees or taps; install and share behaviour | `web/CLAUDE.md` |

### Where do I change…?

| I want to change… | Go to |
|---|---|
| Which sheet columns the app reads or writes | `placeFields_()` / `APP_FIELDS` / `DISH_FIELDS` / `MASTER_FIELDS` in `apps-script/src/Config.js` |
| Which fields the phone may edit, and their checks | `EDITABLE_FIELDS` (`Config.js`), `cleanValue_` (`Sheet.js`), `formFields` (`web/place.js`) |
| Dishes and Best Dish | `apps-script/src/Dishes.js` + `web/dishes.js` |
| Which Google fields are fetched (affects billing) | `PLACE_FIELDS` in `apps-script/src/Places.js` |
| How a Maps link is understood | `apps-script/src/MapsLink.js` |
| Daily / monthly lookup limits | Script Properties `DAILY_LIMIT` / `MONTHLY_LIMIT` (defaults in `Config.js`) |
| A backend action the phone can call | `ACTIONS` in `apps-script/src/Api.js` + the matching `call('…')` in `web/app.js` |
| Backfill behaviour | `apps-script/src/Backfill.js` |
| Tabs, filters, sort, near me, cards | `web/list.js` + `web/index.html`; tab switching in `web/app.js` (`selectTab`) |
| Place detail and add / edit form | `web/place.js` |
| Install button, iPhone hint, Back button | `web/app.js` (`initInstall`, `popstate`) |
| Look and feel | `web/styles.css` (tokens on `:root`) |
| Install name, icon, share target | `web/manifest.webmanifest`, `web/icons/` |
| Backend deploy targets or npm scripts | `apps-script/.clasp-*.json` (local only) / root `package.json` |
| Front-end deploy | `.github/workflows/pages.yml` |

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
6. **Match the stack.** Apps Script V8; vanilla HTML/CSS/JS ES modules; Google Sheets as storage. No framework, build step, npm runtime package or CDN script without the owner's approval.
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
- `node --check <file>` on every changed `.js` file (works for `web/` modules on Node 22+).
- Report what you tested and what you did not. Never claim a push, deploy or test you did not run.

---

## 5. Environments & Data Safety

- **One backend target: prod.** There is no dev environment. The script works on the live spreadsheet in `SPREADSHEET_ID` (a new sheet; the old "Foodies Checklist" is migrated later), so every push, deploy and editor run touches live data. Do any of them only when the owner asks in that request.
- **Never committed (public repo):** `.clasp*.json` except the example, script IDs, the spreadsheet ID, the web app URL, `API_TOKEN`, `PLACES_API_KEY`, the names in `PEOPLE`.
- **Backend: deploy only with the root npm scripts.** `npm run push-prod` pushes code; the web app URL only serves the new code after the owner updates the existing deployment to a new version (README → Deploy).
- **Front end: `master` is prod.** Every push to `master` that touches `web/` publishes it through `.github/workflows/pages.yml`. Nothing else deploys the front end.
- **Backfill** runs from the Apps Script editor, only with the owner's go-ahead: take a backup first (File → Make a copy, or a named version in Version history), run one batch of 15 rows, check it, then the rest.
- **`clasp pull` overwrites local files.** Commit first.

---

## 6. Git Workflow

- Follow `.gitignore`. Review modified and untracked files before staging. Commit doc updates with the code they describe.

### Branching Model
- Only two long-lived branches: `develop` and `master`.
  - `develop` is the **base**: the GitHub default branch, the base of every PR, where all work happens.
  - `master` is **prod**: merging into it publishes the front end to GitHub Pages.
- Short-lived `fix/*`, `feat/*`, `chore/*` branches start from `develop` and merge back into `develop`.
- Work on the checked-out branch. Create a branch or worktree only when the owner asks.
- `master` changes only by merging `develop` (PR `develop` → `master`). Never commit, cherry-pick or open feature PRs against `master`.

### Pull and Push
- Before starting: `git checkout develop` and `git pull origin develop`. Commit or stash before pulling.
- Push working branches under their own name and open PRs into `develop`. Never push directly to, or force-push, `develop` or `master`.
- Release: once `develop` is verified, PR `develop` → `master` and merge; keep working from `develop`.
