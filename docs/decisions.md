# Decisions

Why the project is built the way it is. Each entry: the decision, the reason, and its status. Add new entries at the end; when one is reversed, mark it **Reversed** and link the replacement instead of deleting it.

Source: handoff summary, session 2 (2026-11-14), plus the repo-structure decisions taken when the scaffold was built (D10+).

## Goal and users

Turn the Google Sheet "Foodies Checklist" (~230 restaurants in tab "Food List"; "Haven't Tried Yet" is a filtered copy; "Master" holds dropdown lists) into a phone-friendly directory for 2 people, Android first. Uses, in priority order: (1) near me now, (2) filter by craving, (3) plan meals for a trip to a city, (4) pick from places not yet tried. Free tools; a public app may come later.

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
| D10 | Standalone script that opens the sheet by `SPREADSHEET_ID` (not bound to the sheet) | Same code for dev and prod; dev runs against a sheet copy | Built |
| D11 | Columns are found by header text, never by index; the app owns 8 extra columns appended at the right | The real headers are not confirmed yet, and the user may reorder columns | Built; user header names **unverified** |
| D12 | The phone sends only a `placeId` to save; the server takes place data from its 10-minute lookup cache | Never trust place data computed in the browser; avoids a second paid call | Built |
| D13 | The backend is split into small files by concern (Api, Sheet, Places, MapsLink, Usage, Backfill, Setup, Config) | Avoid one large backend file; each file maps to one section of `apps-script/CLAUDE.md` | Built |
| D14 | Front end is deployed by `git subtree push --prefix web origin gh-pages` (npm `deploy-web`), not GitHub Actions | Pages "deploy from branch" only serves `/` or `/docs`; an Actions deploy needs `pages: write` + `id-token: write` permissions and a workflow to maintain | **Reversed** by D18 |
| D15 | Service worker is network-first | Phones get new versions on the next online launch without cache-version bumps | Built |
| D16 | One README for people; a CLAUDE.md per folder for detail; a `development-documentation` skill keeps them in sync | Same three-layer doc structure as the owner's other Apps Script repo, minus duplicate per-folder READMEs | Built |
| D17 | Script time zone `Asia/Jakarta` | **Assumption** (billing currency is IDR); only affects when the daily counter resets | Built; confirm |
| D18 | `master` is prod, `develop` is the base (GitHub default branch, PR base). A GitHub Actions workflow publishes `web/` to Pages on every push to `master`; no `gh-pages` branch | Owner's choice: one prod branch, deploy by merging. The deploy job alone gets `pages: write` + `id-token: write`; actions are SHA-pinned, Dependabot bumps them | Built (`.github/workflows/pages.yml`) |

## Open

- Real "Food List" headers and the format of the tried column (run `checkColumns`).
- Whether to add an action to mark a place as tried from the phone.
- Quota caps in Google Cloud (see `gcp-setup.md`).
