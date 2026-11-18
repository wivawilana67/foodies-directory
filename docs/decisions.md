# Decisions

Why the project is built the way it is. Each entry: the decision, the reason, and its status. Add new entries at the end; when one is reversed, mark it **Reversed** and link the replacement instead of deleting it.

Source: handoff summary, session 2 (2026-11-14), plus the repo-structure decisions taken when the scaffold was built (D10+).

## Goal and users

Turn the Google Sheet "Foodies Checklist" (~230 restaurants in tab "Food List"; "Haven't Tried Yet" is a filtered copy; "Master" holds dropdown lists) into a phone-friendly directory for 2 people, Android first. Uses, in priority order: (1) near me now, (2) filter by craving, (3) plan meals for a trip to a city, (4) pick from places not yet tried. Free tools; a public app may come later.

Owner's restated goal (2026-11-15): a personal food directory with (1) a full place record matching the old sheet (location, Tipe/Genre/Jenis, best dish, price, Maps and Instagram links, a score and review from each person), (2) a wishlist of places not tried, (3) nearest places, (4) add by Maps link or name with auto-fill, plus (5) a dish list per place. Work starts in a new spreadsheet; the old sheet is migrated later. Decisions D19–D29.

## Architecture

| Layer | Choice | Role |
|---|---|---|
| Database | Existing Google Sheet | Stores all places |
| Backend | Apps Script, deployed with clasp | Places lookup, write rows, backfill, holds the API key |
| Front end | PWA on GitHub Pages | Phone UI; home-screen icon on Android and iPhone |

The repo is public (free GitHub Pages), so no secrets in the repo.

## Design decisions

| # | Decision | Reason | Status |
|---|---|---|---|
| D1 | The token goes in the request body; requests are POST `text/plain` | Apps Script web apps cannot answer a CORS preflight; `text/plain` makes a "simple" request with none | Built (`web/api.js`, `Api.js`) |
| D2 | Backend URL and token are entered on each phone at first launch and stored on the device | Public repo; nothing secret can ship in the front end | Built (`#view-setup`) |
| D3 | "Near me" distance is computed on the phone | Location is never sent to the backend | Built (`web/geo.js`) |
| D4 | Short links (`maps.app.goo.gl`) are resolved in Apps Script with `followRedirects:false`, reading `Location` | Get the long URL that holds the place ID or name | Built (`MapsLink.js`); **untested with real links** |
| D5 | Share target is Android only; iPhone gets a Paste box | iOS PWAs cannot receive shares | Built |
| D6 | Only SearchText and GetPlace, with minimal field masks | Fields such as rating, priceLevel and opening hours likely sit in a higher pricing tier with a 1,000/month free cap (**unverified**; check Google's pricing page before adding fields) | Built (`PLACE_FIELDS`) |
| D7 | Spend counter in code: daily + monthly counts in Script Properties; lookups refused past a limit under the free allowance | Cap our own usage; does not cover a leaked key (see `gcp-setup.md`) | Built (`Usage.js`, defaults 50/day, 900/month) |
| D8 | Backfill only fills empty cells, never overwrites user data; test on 10–20 rows first | The sheet holds years of hand-entered data | Built (`Backfill.js`, 15 rows per run) |
| D9 | API key only in Script Properties; web app runs as the owner; requests without the token are rejected; the sheet stays Restricted, shared only with the partner | Least exposure | Built |
| D10 | Script opens the sheet by `SPREADSHEET_ID`, never `getActiveSpreadsheet()` | The code works whatever the project is attached to | Built |
| D10a | The project is bound to its sheet (owner's choice, 2026-11-14), not standalone | Script lives with the sheet; trade-off: sheet editors can read the code and Script Properties | Built; whether the new script (2026-11-15) is bound to the new sheet is **unverified** |
| D10b | One environment only: the script bound to the real "Foodies Checklist"; no dev copy (owner's choice, 2026-11-14) | Two-person project; safety comes from a backup before risky runs, the 15-row backfill batch and empty-cells-only writes | Two environments since D38; the prod target is the new spreadsheet (D19). **Reversed** by D38 |
| D11 | Columns are found by header text, never by index; the app owns 8 extra columns appended at the right | The real headers are not confirmed yet, and the user may reorder columns | Built; header names replaced by D20 |
| D12 | The phone sends only a `placeId` to save; the server takes place data from its 10-minute lookup cache | Never trust place data computed in the browser; avoids a second paid call | Built |
| D13 | The backend is split into small files by concern (Api, Sheet, Places, MapsLink, Usage, Backfill, Setup, Config) | Avoid one large backend file; each file maps to one section of `apps-script/CLAUDE.md` | Built |
| D14 | Front end is deployed by `git subtree push --prefix web origin gh-pages` (npm `deploy-web`), not GitHub Actions | Pages "deploy from branch" only serves `/` or `/docs`; an Actions deploy needs `pages: write` + `id-token: write` permissions and a workflow to maintain | **Reversed** by D18 |
| D15 | Service worker is network-first | Phones get new versions on the next online launch without cache-version bumps | Built |
| D16 | One README for people; a CLAUDE.md per folder for detail; a `development-documentation` skill keeps them in sync | Same three-layer doc structure as the owner's other Apps Script repo, minus duplicate per-folder READMEs | Built |
| D17 | Script time zone `Asia/Jakarta` | Matches the bound project's existing manifest (seen 2026-11-14); sets when the daily counter resets | Built |
| D18 | `master` is prod, `develop` is the base (GitHub default branch, PR base). A GitHub Actions workflow publishes `web/` to Pages on every push to `master`; no `gh-pages` branch | Owner's choice: one prod branch, deploy by merging. The deploy job alone gets `pages: write` + `id-token: write`; actions are SHA-pinned, Dependabot bumps them | Built (`.github/workflows/pages.yml`); the `develop` base was **reversed** by D33 and is restored by D38 |
| D19 | Build in a new, empty spreadsheet; migrate the old "Foodies Checklist" later. `setupSheet` writes the headers and creates "Dishes" and "Master" | Owner's choice (2026-11-15); keeps the old sheet untouched while the app takes shape | Built (`Setup.js`); migration not built |
| D20 | "Food List" keeps the old sheet's headers (Nama Resto, Negara, Kota, Lokasi, Jalan / Patokan, Tipe/Genre/Jenis Foodies, Best Dish, Link Instagram, Link Google, Closed, Have Tried?, UniqueName, Hyperlink); app columns: App ID, Place ID, Lat, Lng, Address, Google Category, Added At, Lookup Status. Headers are compared with whitespace collapsed | Migration becomes a near straight copy; the old headers contain line breaks (`Review\n(Name)`) | Built (`Config.js`, `normHeader_`). Old headers confirmed from the old sheet's row 1 (2026-11-15) |
| D21 | Each person has a score on the Master "Ratings" scale (1–10, HEAVEN!, ULTRA HEAVEN 🔥) and a review. The old shared "Ratings" is copied into both at migration. Default sort: average rank, the rank being the position in the Master list | Owner's choice; keeps their scale and makes HEAVEN levels sortable | Built (scores, sort); migration copy not built |
| D22 | The two names live in Script Property `PEOPLE`; headers are `Rating (<name>)` / `Review (<name>)` and the phone gets the names from `list` | The repo is public; personal names stay out of it | Built |
| D23 | Every place has an `App ID` (UUID) used for edits and dishes; `list` gives one to named rows that lack it | Works for places without a Google Place ID and for rows typed in the sheet | Built |
| D24 | Edit any user field from the phone. **Reverses** "the app only appends rows and fills empty cells" (D8 still holds for backfill). `update` sends changed fields plus their original values and is refused if any of those cells changed since (other phone or the sheet); writes are cell by cell | Owner wants to edit everything after a visit; the check stops one phone silently overwriting the other | Built (`updatePlace_`) |
| D25 | Dishes in their own tab ("Dishes": Dish ID, App ID, UniqueName, Dish, Price, Liked, Best, Note, Added At). Starred dishes rewrite the place's Best Dish. Dish edits are last-write-wins. Place price stays free text | Owner wants to know what they ate, liked and paid; one row per dish keeps the sheet readable | Built (`Dishes.js`, `web/dishes.js`) |
| D26 | Tipe / Genre / Jenis and scores are chosen from the "Master" lists; a new Tipe / Genre / Jenis typed on the phone is appended to Master | Owner's choice: consistent labels, still extendable from the phone | Built |
| D27 | UniqueName (`Name - Country (Patokan)`) and Hyperlink (the name as a rich-text link to Link Google, not a formula) are filled by the app | Owner keeps them for reading the sheet on a computer; rich text avoids writing formulas | Built |
| D28 | Country, city and district are filled from `addressComponents`, already in the field mask; no new billed field. Search stays "type, then Search" (no type-ahead); Google data stays at the basics | Owner's choice; keeps lookups in the cheapest tier and one call per search | Built; component mapping for Indonesia **unverified** |
| D29 | Platforms: Android installs as an app (manifest + service worker + **Install app** button via `beforeinstallprompt`); iPhone must fully work in Safari from the URL, home-screen icon optional. Bottom tabs All · Wishlist · Near me · Add, closed places hidden by default, English UI. Extends D5 | Owner requirement (2026-11-15) | Built; not yet tested on real phones |
| D30 | Labels: free tags, any number per place, in one "Labels" cell as `"A, B"`; typed on the phone with suggestions from labels used elsewhere (no Master list). The label chip row filters to places carrying **all** chosen labels | Owner's choice (2026-11-16); one cell keeps the sheet readable and needs no new tab; "all" narrows like the other filters | Built (`cleanLabels_`, `labelsControl`, `renderLabelChips`) |
| D31 | Copy and share: three lines (name; landmark, district, city, country; Google Maps link) from a card's ⧉, the place's Copy, or the phone's share menu (Web Share); **Copy list** copies every place shown, blank line between | Owner's choice (2026-11-16), for pasting into chats | Built (`placeText`, `copyText`, `sharePlace`, `copyList`) |
| D32 | "Sticker" style: ink outlines, solid offset shadows, rounded corners, tomato / sunflower / mint / lilac on cream; Nunito + Fredoka bundled in `web/fonts/` (OFL), not loaded from Google Fonts | Owner picked B of three samples (2026-11-16): "cute but sharp". Bundling keeps fonts offline and avoids a third-party request | Built (`styles.css`) |
| D33 | Single branch `master`: the GitHub default branch, the base of every PR and prod. Short-lived `feat/*`, `fix/*`, `chore/*` branches PR into it; merging publishes the front end, so a PR that needs a backend change is merged after the backend is live. **Reverses** the `develop` part of D18 | Owner's choice (2026-11-17): one branch is simpler for a two-person project | Built; **reversed** by D38 |
| D38 | Two environments: `develop` (default branch; work is committed to it directly, PRs optional) publishes a TEST copy of the front end under `/test/` on the same Pages site and talks to a test Apps Script bound to a copy of the sheet; `master` publishes the live app. The test copy keeps its own storage keys (`foodies-test.*`), cache and a yellow TEST bar. `master` changes only by PR (branch protection, also for admins). **Reverses** D33 and D10b | Owner's choice (2026-11-18): try changes on the phones before they go live. One Pages site per repo, so a sub-path avoids a second host or deploy secrets | Built (workflow, `IS_TEST`); test backend set up by the owner |

## Open

- Migration from the old sheet: column mapping, shared rating → both scores, "AI Generated" placeholders, `share.google` links, backfilling Place IDs and coordinates.
- Which address components hold city and district for Indonesian places (test with real lookups).
- Whether the new Apps Script project is bound to the new spreadsheet.
- Whether a spreadsheet copy carries its Script Properties (test setup, D38) **Unverified**.
- Quota caps in Google Cloud (see `gcp-setup.md`).
