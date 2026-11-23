# frontend — Developer and Agent Guide

The new phone app (replatform, `docs/decisions.md` D39–D59): React + TypeScript + Vite, built to static files and served by Firebase Hosting, which sends `/api/**` to Cloud Run (`firebase.json`). **Phase 4b**: sign-in, the All / Wishlist / Near me lists (search, label chips, filters, score or distance sort, Copy list, copy per card), place detail (Maps, Instagram, Copy, Share, Mark as tried, scores, dishes listed) and the edit form with the conflict check, Settings with sign-out, and an offline copy of `/api/bootstrap`. Still to come: adding and editing dishes and Add a place (4c), theme setting, install and service worker (4d). The live app is still `web/` until the switch-over; its rules (iPhone Safari without install, location stays on the phone, Sticker design) carry over.

Read first: root `CLAUDE.md`, `README.md` (Local development), `docs/decisions.md` D39–D59 and `web/CLAUDE.md` (behaviour being ported).

---

## 1. Folder Directory Map

```
frontend/
├── CLAUDE.md, AGENTS.md
├── package.json, package-lock.json   # React 19, Vite 8, TypeScript 5.9; commit the lockfile
├── tsconfig.json                      # strict; type-checks src/
├── vite.config.ts                     # dev server proxies /api to API_PROXY (the api container)
├── index.html
└── src/
    ├── main.tsx                       # React root; imports styles.css
    ├── App.tsx                        # Shell: sign-in, bootstrap load + offline copy, routes (list / place / form / settings),
    │                                  #   top bar, bottom tabs, Back button, savePlace (merges a saved place into data + cache)
    ├── SignIn.tsx                     # Google Sign-In button; in the Vite dev server only, a "Local dev token" field
    ├── PlaceList.tsx                  # All / Wishlist / Near me (port of web/list.js): search, filters, label chips, sort, cards
    ├── PlaceDetail.tsx                # Place detail (port of renderPlace): actions, scores, price, best dish, dishes (read-only)
    ├── PlaceForm.tsx                  # Edit form (port of openForm / formFields): ChoiceField, LabelsField, suggest fields
    ├── Settings.tsx                   # Signed-in name, Sign out, Sign out on every device (second tap confirms)
    ├── Toast.tsx                      # toast(message) + <Toast />, copyText (clipboard with textarea fallback)
    ├── api.ts                         # api(path, method, body), ApiError, patchPlace, token + cache in localStorage
    ├── format.ts                      # Ported helpers: text, areaOf, locationOf, unique, coordsOf, formatKm, mapsHref,
    │                                  #   placeText, averageRank, distanceKm, getPosition
    ├── types.ts                       # API JSON shapes (Place, Dish, Person, Collection, Options, Data)
    ├── styles.css                     # "Sticker" tokens and components ported from web/styles.css (light + dark)
    ├── fonts/                         # Nunito + Fredoka woff2 and OFL licences (copied from web/fonts/), bundled by Vite
    ├── google.d.ts                    # Types for the Google Identity Services script
    └── vite-env.d.ts
```

## 2. Commands (all inside Docker)

| Task | Command (repo root) |
|---|---|
| Dev server (with API and database) | `docker compose up`, then http://localhost:5173 |
| Add a package | `docker compose run --rm web npm install <package>` |
| Type-check + build | `docker compose run --rm web npm run build` |
| Sample data + local sign-in | `docker compose run --rm api python manage.py seed_sample` once, then `… dev_token`; paste the token into **Local dev token** (api/CLAUDE.md § 5) |

The `web` container runs as user `node` (uid 1000), so `node_modules/` and `package-lock.json` in `frontend/` belong to you. `node_modules/` and `dist/` are gitignored.

## 3. Conventions

- Text goes into the page through React (escaped); never `dangerouslySetInnerHTML`.
- Calls go to relative `/api/...` paths, so the same build works behind Firebase Hosting and the dev proxy.
- No secrets in the build: `VITE_*` values (Google client ID, Maps key, Map ID) are public by design and come from GitHub environment variables at build time. `VITE_GOOGLE_CLIENT_ID` comes from the environment's `GOOGLE_CLIENT_ID`; without it the page says sign-in is not configured.
- Sign-in uses Google Identity Services, loaded from `https://accounts.google.com/gsi/client` when needed (the one external script, part of D43). The app token from `/api/auth/google` is sent as `Authorization: Bearer`. A `401` from `/api/bootstrap` signs out with the server's message.
- The **Local dev token** field exists only under `import.meta.env.DEV` (the Vite dev server), so production builds do not contain it (D58).
- localStorage keys, every access wrapped in try/catch (private browsing): `foodies.token` (app token) and `foodies.cache` (last `/api/bootstrap` reply, shown at once on start and when the API cannot be reached; the page itself loads offline only once the 4d service worker exists). Sign-out removes both. They do not clash with the live app's `foodies.*` keys because the sites have different origins.
- Reuse before writing: `api()` for every call, `format.ts` for anything web/ui.js or web/geo.js did, `copyText` / `toast` for clipboard and messages.
- Behaviour follows `web/CLAUDE.md` § 4–6: location stays on the phone (`getPosition` → `distanceKm`), touch targets at least 44 px, status lines with `role="status"`, no browser dialogs (a second tap confirms), sub-views push a history entry so the phone's Back returns, tabs replace it.
- Filtering and sorting run on every render, without memoising: cheap for 1,000+ places.
- Routes live in `history.state` as `{view, id}` (`App.tsx`), so the phone's Back and a reload keep the view. The list stays mounted (hidden) under sub-views, so search, filters, chips and the scroll position survive opening a place.
- Edits go through `patchPlace` with the version the phone loaded and only the changed fields and ratings (D24). On `409`: the form keeps the user's input, shows the server's message and offers **Load latest (drops your edits)**, which refreshes; the form is keyed by `id:version`, so it restarts with the new values. **Mark as tried** on the detail view refreshes at once and asks to try again (D59).
- Buttons may wrap (`.button` has no `nowrap`, unlike `web/styles.css`), so long labels never widen the page on a 320 px phone.

## 4. Deploy

`.github/workflows/frontend.yml`: build on every PR and push touching `frontend/` or `firebase.json`. When the repository variable `CLOUD_DEPLOY` is `on`, a push to `develop` deploys to the **dev** Firebase project and `master` to **prod**. Keep this file current (root `CLAUDE.md` § 4).
