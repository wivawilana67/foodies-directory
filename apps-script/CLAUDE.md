# apps-script — Developer and Agent Guide

The backend: one standalone Apps Script project, deployed as a web app that **runs as the owner** and accepts anonymous requests, which are rejected unless they carry the shared token. It opens the sheet by ID (Script Property `SPREADSHEET_ID`), so dev and prod are two script projects with the same code and different Script Properties.

Read first: root `CLAUDE.md` (style, workflow, git), root `README.md` (Business Flow, Data Flow) and `docs/decisions.md`.

---

## 1. Folder Directory Map

```
apps-script/
├── CLAUDE.md               # This file
├── .clasp.example.json     # Copy to .clasp-dev.json / .clasp-prod.json (gitignored) and set scriptId
└── src/                    # clasp rootDir: everything here is pushed
    ├── appsscript.json     # V8, Asia/Jakarta, STACKDRIVER logging, webapp executeAs USER_DEPLOYING / ANYONE_ANONYMOUS
    ├── Config.js           # Sheet name, header map, Script Property names, limits, getProp_
    ├── Api.js              # doGet / doPost, ACTIONS router, token check, JSON output
    ├── Sheet.js            # Read the table, list places, add a place, sanitize, tried flag
    ├── Places.js           # Places API (New): getPlace_, searchText_, lookup_, lookup cache
    ├── MapsLink.js         # Find / validate / resolve / parse Google Maps links
    ├── Usage.js            # Spend counter (reserveQuota_), showUsage
    ├── Backfill.js         # Editor-only: backfillBatch fills empty app columns for old rows
    └── Setup.js            # Editor-only: checkColumns, addAppColumns
```

---

## 2. File Reference

### 2.1 Phone actions (`ACTIONS` in `Api.js`)

All requests are `POST` with body `{"action", "token", ...}` sent as `text/plain`. Responses are `{"ok": true, ...}` or `{"ok": false, "error"}`. `doGet` returns `{"ok": true}` only (health check, no data).

| Action | Request fields | Handler | Response | Places calls |
|---|---|---|---|---|
| `list` | — | `listPlaces_` | `places[]` (one object per row with a name; keys = logical fields found), `fields[]` | 0 |
| `lookup` | `input` (link, shared text or name) | `lookup_` | `places[]` from `toPlace_` | 1 (GetPlace or SearchText) |
| `add` | `placeId`, `labels{tipe,genre,jenis}` | `addPlace_` | `duplicate`, `place` | 0 if the lookup is still cached, else 1 |

### 2.2 Editor-only functions

| Function | File | Does |
|---|---|---|
| `checkColumns` | `Setup.js` | Logs the real header row and which `USER_FIELDS` / `APP_FIELDS` were found |
| `addAppColumns` | `Setup.js` | Appends missing `APP_FIELDS` headers after the last column |
| `backfillBatch` | `Backfill.js` | Looks up the next `BACKFILL_BATCH` rows and fills their empty app cells |
| `showUsage` | `Usage.js` | Logs today's and this month's lookup counts |

### 2.3 Script Properties

| Property | Required | Holds |
|---|---|---|
| `PLACES_API_KEY` | yes | Places API (New) key |
| `API_TOKEN` | yes | Shared token the phones send (random, 32+ characters) |
| `SPREADSHEET_ID` | yes | ID of the sheet holding "Food List" |
| `DAILY_LIMIT` / `MONTHLY_LIMIT` | no | Lookup caps; default 50 / 900 (`Config.js`) |
| `USAGE` | written by code | `{day, dayCount, month, monthCount}` |

---

## 3. Reuse Before You Write

| Need | Use |
|---|---|
| A Script Property that must exist | `getProp_(PROP.x)` |
| The sheet with header → column map | `readTable_()` → `{sheet, headers, col, rows}`; `rowNumber_(index)` for the sheet row |
| Require the app columns | `assertAppColumns_(col)` |
| A row as a JSON place | `rowToPlace_(row, col, rowNumber)` |
| Any text written to the sheet | `sanitize_(value)` |
| App-owned cells from a Google place | `appCells_(place)` |
| One place by ID / search by text | `getPlace_(id)` / `searchText_(query, near, max)` — both reserve quota |
| Places from a Maps link | `placeFromLink_(url, max)` (resolve + parse + lookup) |
| First URL in shared text / is it Maps | `extractUrl_(text)` / `isMapsUrl_(url)` |

---

## 4. Conventions

- Private functions end with `_` (not callable from `google.script.run`, hidden from the editor's run list). Editor-run functions have no underscore.
- Columns are found by header text through `readTable_()`; never hardcode a column index.
- Writes take the script lock (`LockService.getScriptLock()`) only around read-check-write. Never hold it while calling the Places API: `reserveQuota_` takes the same lock.
- Errors: throw `Error` with a message safe to show on the phone; `doPost` logs the stack and returns `{ok:false, error}`.
- Logs carry the action and place ID, never the token, API key or the user's location.

---

## 5. Domain Rules

### 5.1 Sheet
- Tab `SHEET_NAME` = "Food List", header in row `HEADER_ROW` = 1 (**unverified**; run `checkColumns`).
- `USER_FIELDS` header names (`Name`, `Link`, `City`, `Tipe`, `Genre`, `Jenis`, `HEAVEN`, `Price`, `Tried`) are **unverified guesses**. Only `name` is required; missing ones are skipped.
- "Haven't Tried Yet" (filtered copy) and "Master" (dropdown lists) are never read or written.
- `isTried_` accepts a checked checkbox (`true`) or the text `yes`, `y`, `true`, `sudah` (**unverified** until the real column format is known).

### 5.2 Adding a place
- `lookup_` caches results for `LOOKUP_CACHE_SECONDS` (10 min); `addPlace_` writes from the cache, so the phone sends only `placeId` and never place data.
- Duplicates are matched on `Place ID`; a duplicate returns the existing row and writes nothing.
- A new row gets `name`, `link` (= Google Maps URL), `city` (= Google area), the optional labels, all app columns, and `Lookup Status` = `added`.

### 5.3 Maps links
- Accepted hosts: `maps.app.goo.gl`, `goo.gl/maps…`, `maps.google.*`, `google.*/maps…`. Anything else is refused before any fetch.
- Short links are resolved one redirect at a time with `followRedirects: false`, reading `Location`, max 5 hops; a `consent.google.*` page is unwrapped through its `continue` parameter.
- From the long URL: a `ChIJ…` place ID (`query_place_id=`, `place_id:`, `!19s`) → GetPlace; otherwise the `/maps/place/<name>` or `q=` text → SearchText biased 1 km around the `!3d…!4d…` pin or `@lat,lng`. These patterns are observed, not documented by Google.

### 5.4 Places API and spend
- Only SearchText and GetPlace, with `PLACE_FIELDS` as the field mask (no rating, price level or hours: likely a higher tier with a smaller free cap — see `docs/decisions.md` #6).
- `reserveQuota_` runs before every request and refuses past `DAILY_LIMIT` / `MONTHLY_LIMIT` (days in the script time zone). Failed requests still count.
- The counter does not protect against someone using a leaked key directly; Google Cloud quota caps do (`docs/gcp-setup.md`).

### 5.5 Backfill
- Picks rows with a name, an empty `Place ID` and an empty `Lookup Status`. A real Maps link in the row is used first; otherwise it searches `"<name> <city>"` and takes the top result.
- Writes only empty app-owned cells, cell by cell (whole-row writes would flatten formulas and rich-text links). Never writes user columns; a placeholder such as "AI Generated" in `Link` stays.
- Sets `Lookup Status` to `ok`, `not found` or `error: …`. To retry a row, clear its `Lookup Status`. Wrong match → clear the app cells and the status, or fix by hand.
- Stops the batch on a quota-limit error. Raise `DAILY_LIMIT` (e.g. 300) on backfill day only.

---

## 6. Deploy and Maintenance Notes

- `npm run push-dev` / `npm run push-prod` copy `.clasp-<env>.json` to `.clasp.json` and run `clasp push -f`.
- After a push, update the **existing** deployment (Deploy → Manage deployments → edit → New version) so the `/exec` URL stays the same on both phones. A new deployment means a new URL to re-enter on each phone.
- First run on a sheet: `checkColumns` → fix `USER_FIELDS` → `addAppColumns` → set Script Properties → deploy.
- Keep this file current (root `CLAUDE.md` § 4).
