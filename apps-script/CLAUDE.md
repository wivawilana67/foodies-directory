# apps-script — Developer and Agent Guide

The backend: one Apps Script project (prod; there is no dev environment), deployed as a web app that **runs as the owner** and accepts anonymous requests, which are rejected unless they carry the shared token. It opens the spreadsheet by ID (Script Property `SPREADSHEET_ID`) rather than `getActiveSpreadsheet()`, so the code does not depend on how the project is attached.

Bound-project caveat: if the project is bound to the sheet, anyone with edit access to the sheet can open Extensions → Apps Script and read the code and Script Properties (API key, token).

Read first: root `CLAUDE.md` (style, workflow, git), root `README.md` (Business Flow, Data Flow) and `docs/decisions.md`.

---

## 1. Folder Directory Map

```
apps-script/
├── CLAUDE.md               # This file
├── .clasp.example.json     # Copy to .clasp-prod.json (gitignored) and set scriptId
└── src/                    # clasp rootDir: everything here is pushed
    ├── appsscript.json     # V8, Asia/Jakarta, STACKDRIVER logging, webapp executeAs USER_DEPLOYING / ANYONE_ANONYMOUS
    ├── Config.js           # Tab names, header maps (placeFields_, APP_FIELDS, DISH_FIELDS, MASTER_FIELDS), Script Property names, limits, getProp_, people_
    ├── Api.js              # doGet / doPost, ACTIONS router, token check, JSON output
    ├── Sheet.js            # Table reading, place list / add / update, validation, sanitize, Master lists
    ├── Dishes.js           # Dish list / save / delete, Best Dish sync
    ├── Places.js           # Places API (New): getPlace_, searchText_, lookup_, lookup cache
    ├── MapsLink.js         # Find / validate / resolve / parse Google Maps links
    ├── Usage.js            # Spend counter (reserveQuota_), showUsage
    ├── Backfill.js         # Editor-only: backfillBatch fills empty app columns for old rows
    └── Setup.js            # Editor-only: setupSheet, checkColumns, addMissingColumns
```

---

## 2. File Reference

### 2.1 Phone actions (`ACTIONS` in `Api.js`)

All requests are `POST` with body `{"action", "token", ...}` sent as `text/plain`. Responses are `{"ok": true, ...}` or `{"ok": false, "error"}`. `doGet` returns `{"ok": true}` only (health check, no data).

| Action | Request fields | Handler | Response | Places calls |
|---|---|---|---|---|
| `list` | — | `listPlaces_` | `places[]` (keys = logical fields found, `tried` / `closed` as booleans), `dishes[]`, `options{rating,tipe,genre,jenis}`, `people[2]`, `fields[]` | 0 |
| `lookup` | `input` (link, shared text or name) | `lookup_` | `places[]` from `toPlace_` (`placeId, name, address, lat, lng, country, city, district, googleCategory, mapsUrl`) | 1 (GetPlace or SearchText) |
| `add` | `placeId` (optional), `fields{…EDITABLE_FIELDS}` | `addPlace_` | `duplicate`, `place` | 0 if the lookup is still cached, else 1; 0 without `placeId` |
| `update` | `id` (App ID), `changes{…}`, `original{…}` | `updatePlace_` | `place` | 0 |
| `saveDish` | `dish{id?, place, name, price, liked, best, note}` | `saveDish_` | `dish`, `bestDish` | 0 |
| `deleteDish` | `id` (Dish ID) | `deleteDish_` | `place`, `bestDish` (only when the dish was starred) | 0 |

### 2.2 Editor-only functions

| Function | File | Does |
|---|---|---|
| `setupSheet` | `Setup.js` | New spreadsheet only: rewrites the "Food List" header row (refuses if it has data rows), creates "Dishes" and "Master" with headers, freezes row 1 |
| `checkColumns` | `Setup.js` | Logs each tab's real headers and which configured fields were found |
| `addMissingColumns` | `Setup.js` | "Food List" with data: appends every configured header that is missing (a new column such as `Labels`, or app columns at migration) after the last column |
| `backfillBatch` | `Backfill.js` | Looks up the next `BACKFILL_BATCH` rows and fills their empty app cells |
| `showUsage` | `Usage.js` | Logs today's and this month's lookup counts |

### 2.3 Script Properties

| Property | Required | Holds |
|---|---|---|
| `PLACES_API_KEY` | yes | Places API (New) key |
| `API_TOKEN` | yes | Shared token the phones send (random, 32+ characters) |
| `SPREADSHEET_ID` | yes | ID of the spreadsheet holding "Food List", "Dishes", "Master" |
| `PEOPLE` | yes | The two names, comma-separated; build the `Rating (<name>)` / `Review (<name>)` headers and the phone labels. Kept out of the public repo |
| `DAILY_LIMIT` / `MONTHLY_LIMIT` | no | Lookup caps; default 50 / 900 (`Config.js`) |
| `USAGE` | written by code | `{day, dayCount, month, monthCount}` |

---

## 3. Reuse Before You Write

| Need | Use |
|---|---|
| A Script Property that must exist | `getProp_(PROP.x)`; the two names: `people_()` |
| The spreadsheet / a tab | `spreadsheet_()` (cached per execution) / `openTab_(name)` |
| Any tab with header → column map | `readTable_(tabName, fields)` → `{sheet, headers, col, rows}`; `rowNumber_(index)` for the sheet row |
| "Food List" with all fields | `readPlaces_()`; require columns with `assertColumns_(col, fields, tabName)` |
| A row by App ID / Dish ID | `findRow_(t, 'id', id)` |
| A fresh row after writing | `readRow_(t, rowNumber)` |
| Run under the script lock | `withLock_(fn)` |
| A row as a JSON place / dish | `rowToPlace_(row, col)` / `toDish_(row, col)` (both on `toRecord_`) |
| Validate fields from the phone | `cleanFields_(input, options)` (`EDITABLE_FIELDS` only; labels through `cleanLabels_`) / `cleanDish_(dish)` |
| Any text written to the sheet | `sanitize_(value)` |
| Checkbox or "yes" text | `isChecked_(value)`; compare for conflicts with `comparable_(field, value)` |
| Master lists / add a new Tipe-Genre-Jenis value | `readOptions_()` / `appendOptions_(values, options)` |
| UniqueName, Hyperlink, checkboxes on a new row | `uniqueName_(v)`, `setHyperlink_(…)`, `setCheckboxes_(…)` |
| App-owned cells from a Google place | `appCells_(place)` |
| One place by ID / search by text | `getPlace_(id)` / `searchText_(query, near, max)` — both reserve quota |
| Places from a Maps link | `placeFromLink_(url, max)` (resolve + parse + lookup) |
| First URL in shared text / is it Maps | `extractUrl_(text)` / `isMapsUrl_(url)` |
| Headers on a tab (editor) | `readHeaders_(sheet)` / `appendHeaders_(sheet, headers)` |

---

## 4. Conventions

- Private functions end with `_` (not callable from `google.script.run`, hidden from the editor's run list). Editor-run functions have no underscore.
- Columns are found by header text through `readTable_()`; never hardcode a column index. Headers are compared after `normHeader_` (line breaks and repeated spaces collapsed).
- Rows are found by `App ID` / `Dish ID` inside the lock, never by a row number sent from the phone.
- Writes take the script lock (`withLock_`) around read-check-write. Never hold it while calling the Places API: `reserveQuota_` takes the same lock (`addPlace_` fetches the Google place before locking).
- Writes go cell by cell, or `appendRow` for new rows; never rewrite whole existing rows (keeps formulas and rich text).
- Errors: throw `Error` with a message safe to show on the phone; `doPost` logs the stack and returns `{ok:false, error}`.
- Logs carry the action and IDs, never the token, API key or the user's location.

---

## 5. Domain Rules

### 5.1 Sheet
- "Food List" headers are the old "Foodies Checklist" names (`placeFields_()` in `Config.js`), header in row `HEADER_ROW` = 1. Only `name` ("Nama Resto") is required to read; writes need all `APP_FIELDS`.
- `Rating (<name>)` / `Review (<name>)` use the names in `PEOPLE`. The old sheet had one shared "Ratings" column; at migration it is copied into both rating columns (not built yet).
- "Master" holds the lists the phone offers. The order of `Ratings` is the sort rank (first = lowest, last = best, e.g. `1 … 10, HEAVEN!, ULTRA HEAVEN 🔥`). A new Tipe / Genre / Jenis value saved from the phone is appended to its Master column.
- `Closed`, `Have Tried?` and `Best` are checkboxes on rows the app writes (`insertCheckboxes` per row, never on empty rows: that would move `appendRow` to the bottom of the grid). `isChecked_` also accepts `yes`, `y`, `true`, `sudah` typed by hand.
- `listPlaces_` gives any named row without an `App ID` a new one (fills an empty app cell only), so rows typed straight into the sheet can be edited from the phone.

### 5.2 Adding and editing a place
- `lookup_` caches results for `LOOKUP_CACHE_SECONDS` (10 min); `addPlace_` takes Google data from the cache, so the phone sends only `placeId` plus its own fields. The phone's non-empty fields win over Google's defaults (name, country, city, district, Maps link).
- Without `placeId` the place is manual (`Lookup Status` = `manual`); otherwise `added`. Duplicates are matched on `Place ID`; a duplicate returns the existing row and writes nothing.
- `UniqueName` = `Name - Country (Patokan)`; `Hyperlink` = the name as a rich-text link to `Link Google` (no formula). Both are recomputed when name, country, landmark or Maps link change; a new UniqueName is copied to the place's dish rows.
- `update` refuses the whole save if any changed field's current cell differs from `original` (edited on the other phone or in the sheet). Only cells whose value really changes are written.
- Validation (`cleanValue_`): text ≤ 200 characters (reviews ≤ 1000); ratings must be a Master `Ratings` value or empty; Instagram accepts `@name` (turned into `https://www.instagram.com/name/`) or an `https://instagram.com/…` link; `Link Google` must be an `https://` Maps link (`isMapsUrl_`) or `https://share.google/…`.
- `UniqueName`, `Hyperlink` and `Best Dish` are derived and not in `EDITABLE_FIELDS`.
- `Labels` holds any number of free labels in one cell as `"A, B"`. `cleanLabels_` accepts a list or comma-separated text, trims, drops blanks and case-insensitive repeats, and refuses a label over 40 characters or more than 20 labels. No Master list: the phone suggests labels already used on other places.

### 5.3 Dishes
- One row per dish in "Dishes", linked by `App ID`; `UniqueName` is a readable copy only. `Liked` is `Yes`, `No` or empty.
- Saving or deleting a dish whose star changed rewrites the place's `Best Dish` as the starred dish names joined by `, ` (an empty string when none is starred).
- Dish edits are last-write-wins (no conflict check). Deleting a dish deletes its row (app-owned tab).

### 5.4 Maps links
- Accepted hosts: `maps.app.goo.gl`, `goo.gl/maps…`, `maps.google.*`, `google.*/maps…`. Anything else is refused before any fetch.
- Short links are resolved one redirect at a time with `followRedirects: false`, reading `Location`, max 5 hops; a `consent.google.*` page is unwrapped through its `continue` parameter.
- From the long URL: a `ChIJ…` place ID (`query_place_id=`, `place_id:`, `!19s`) → GetPlace; otherwise the `/maps/place/<name>` or `q=` text → SearchText biased 1 km around the `!3d…!4d…` pin or `@lat,lng`. These patterns are observed, not documented by Google.
- `share.google` links (seen in the old sheet) are not resolved by lookup; they are only accepted as a stored `Link Google`.

### 5.5 Places API and spend
- Only SearchText and GetPlace, with `PLACE_FIELDS` as the field mask (no rating, price level or hours: likely a higher tier with a smaller free cap — see `docs/decisions.md` D6).
- Country, city and district come from `addressComponents` (already in the mask): `country`; `locality`, else `administrative_area_level_2`, else `_1`; `sublocality_level_1`, else `sublocality`. **Unverified** for Indonesian addresses; the phone shows them as editable defaults.
- `reserveQuota_` runs before every request and refuses past `DAILY_LIMIT` / `MONTHLY_LIMIT` (days in the script time zone). Failed requests still count.
- The counter does not protect against someone using a leaked key directly; Google Cloud quota caps do (`docs/gcp-setup.md`).

### 5.6 Backfill
- Picks rows with a name, an empty `Place ID` and an empty `Lookup Status`. A real Maps link in `Link Google` is used first; otherwise it searches `"<name> <city>"` and takes the top result.
- Writes only empty app-owned cells, cell by cell. Never writes user columns; a placeholder such as "AI Generated" in a link column stays.
- Sets `Lookup Status` to `ok`, `not found` or `error: …`. To retry a row, clear its `Lookup Status`. Wrong match → clear the app cells and the status, or fix by hand.
- Stops the batch on a quota-limit error. Raise `DAILY_LIMIT` (e.g. 300) on backfill day only.
- Migration rules (copying the shared rating, placeholder links, country/city fill) are not decided yet.

---

## 6. Deploy and Maintenance Notes

- `npm run push-prod` copies `.clasp-prod.json` to `.clasp.json` and runs `clasp push -f`, which replaces every file in the project.
- After a push, update the **existing** deployment (Deploy → Manage deployments → edit → New version) so the `/exec` URL stays the same on both phones. A new deployment means a new URL to re-enter on each phone.
- First run on a new spreadsheet: set Script Properties (incl. `PEOPLE`) → `setupSheet` → fill Master → `checkColumns` → deploy.
- After a release that adds a "Food List" column (e.g. `Labels`) to a sheet that already has rows: run `addMissingColumns`, then `checkColumns`.
- Keep this file current (root `CLAUDE.md` § 4).
