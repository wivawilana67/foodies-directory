# frontend — Developer and Agent Guide

The new phone app (replatform, `docs/decisions.md` D39–D63): React + TypeScript + Vite, built to static files and served by Firebase Hosting, which sends `/api/**` to Cloud Run (`firebase.json`). **Phase 4 complete**: sign-in, the All / Wishlist / Near me lists (search, label chips, filters, score or distance sort, Copy list, copy per card), place detail (Maps, Instagram, Copy, Share, Mark as tried, scores, dishes), the edit form with the conflict check, adding, editing and deleting dishes (Best Dish from starred dishes), the Add tab (Google lookup by link or name, Paste, add by name, Android share target), Settings (theme, sign-out, iPhone home-screen hint), the **Install app** button on Android, a service worker so the app opens offline with the saved copy of `/api/bootstrap`, and **Collections** (Phase 5: a Collections tab, List / Map with Type chips, adding from Select, a place's detail or inside a collection). Next: backup (Phase 6) and the switch-over (Phase 7). The live app is still `web/` until the switch-over; its rules (iPhone Safari without install, location stays on the phone, Sticker design) carry over.

Read first: root `CLAUDE.md`, `README.md` (Local development), `docs/decisions.md` D39–D63 and `web/CLAUDE.md` (behaviour being ported).

---

## 1. Folder Directory Map

```
frontend/
├── CLAUDE.md, AGENTS.md
├── package.json, package-lock.json   # React 19, Vite 8, TypeScript 5.9, vite-plugin-pwa (build only); commit the lockfile.
│                                      #   `overrides` pins patched glob / minimatch under workbox-build (D61)
├── tsconfig.json                      # strict; type-checks src/
├── vite.config.ts                     # dev server proxies /api to API_PROXY; VitePWA: manifest (icons, share_target) + service worker
├── index.html                         # theme-color metas, iPhone home-screen metas, early theme script
├── public/icons/                      # icon-192, icon-512 (round picture, transparent corners), icon-maskable-512 (picture
│                                      #   in the 80% safe circle on cream), apple-touch-icon (180, cream, no transparency).
│                                      #   Made from the owner's picture (gitignored /icon-source.*) with Pillow in a throwaway container
└── src/
    ├── main.tsx                       # React root; imports styles.css
    ├── App.tsx                        # Shell: sign-in, bootstrap load + offline copy, routes (list / place / form / dish / new /
    │                                  #   settings), top bar, bottom tabs incl. Add, Back button, readShare (Android share link),
    │                                  #   savePlace / addedPlace / saveDish (merge replies into data + cache)
    ├── SignIn.tsx                     # Google Sign-In button; in the Vite dev server only, a "Local dev token" field
    ├── PlaceList.tsx                  # All / Wishlist / Near me (port of web/list.js): search, filters, label chips, sort, cards;
    │                                  #   Select mode (onAddTo) and `pick` (adding from a collection); exports PlaceCard
    ├── PlaceDetail.tsx                # Place detail (port of renderPlace): actions, scores, price, best dish, dishes, + Add dish
    ├── PlaceForm.tsx                  # Add + edit form (port of openForm / formFields): ChoiceField, LabelsField, suggest fields
    ├── DishForm.tsx                   # Add / edit / delete a dish (port of web/dishes.js, no photos); replies carry bestDish
    ├── AddPlace.tsx                   # Add tab (port of web/add.js): lookup, Paste, result cards with Pick, add by name
    ├── Collections.tsx                # CollectionList (tab), CollectionView (list / map, Type chips, Remove), CollectionForm
    │                                  #   (name + note, 409 "Load latest"), AddToCollection (pick one or create and add)
    ├── CollectionMap.tsx              # Map view: plain pins for places with coordinates; a tapped pin shows its card
    ├── maps.ts                        # loadMaps(): Google's Maps script URL with VITE_MAPS_KEY, once; MAP_ID, mapsConfigured
    ├── Settings.tsx                   # Signed-in name, Sign out, Sign out on every device (second tap confirms), Theme,
    │                                  #   iPhone "Add to Home Screen" hint
    ├── theme.ts                       # getTheme / saveTheme / applyTheme (port of web/app.js): data-theme + theme-color metas
    ├── Toast.tsx                      # toast(message) + <Toast />, copyText (clipboard with textarea fallback)
    ├── api.ts                         # api(path, method, body), ApiError, patchPlace, token + cache in localStorage
    ├── format.ts                      # Ported helpers: text, areaOf, locationOf, unique, coordsOf, formatKm, mapsHref,
    │                                  #   placeText, averageRank, distanceKm, getPosition
    ├── types.ts                       # API JSON shapes (Place, Dish, Person, Collection, Options, Data, LookupResult)
    ├── styles.css                     # "Sticker" tokens and components ported from web/styles.css (light + dark)
    ├── fonts/                         # Nunito + Fredoka woff2 and OFL licences (copied from web/fonts/), bundled by Vite
    ├── google.d.ts                    # Types for the Google Identity Services script and the parts of google.maps used
    └── vite-env.d.ts
```

## 2. Commands (all inside Docker)

| Task | Command (repo root) |
|---|---|
| Dev server (with API and database) | `docker compose up`, then http://localhost:5173 |
| Add a package | `docker compose run --rm web npm install <package>` |
| Type-check + build | `docker compose run --rm web npm run build` (also writes `dist/sw.js` and `dist/manifest.webmanifest`) |
| Try the built app with its service worker | `docker compose run -d --rm --name foodies-preview -p 127.0.0.1:4173:4173 web npx vite preview --host 0.0.0.0 --port 4173`, then http://localhost:4173 (no **Local dev token** field in a build); `docker stop foodies-preview` |
| Sample data + local sign-in | `docker compose run --rm api python manage.py seed_sample` once, then `… dev_token`; paste the token into **Local dev token** (api/CLAUDE.md § 5) |

The `web` container runs as user `node` (uid 1000), so `node_modules/` and `package-lock.json` in `frontend/` belong to you. `node_modules/` and `dist/` are gitignored.

## 3. Conventions

- Text goes into the page through React (escaped); never `dangerouslySetInnerHTML`.
- Calls go to relative `/api/...` paths, so the same build works behind Firebase Hosting and the dev proxy.
- No secrets in the build: `VITE_*` values (Google client ID, Maps key, Map ID) are public by design and come from GitHub environment variables at build time. `VITE_GOOGLE_CLIENT_ID` comes from the environment's `GOOGLE_CLIENT_ID`; without it the page says sign-in is not configured.
- Sign-in uses Google Identity Services, loaded from `https://accounts.google.com/gsi/client` when needed (the one external script, part of D43). The app token from `/api/auth/google` is sent as `Authorization: Bearer`. A `401` from `/api/bootstrap` signs out with the server's message.
- The **Local dev token** field exists only under `import.meta.env.DEV` (the Vite dev server), so production builds do not contain it (D58).
- localStorage keys, every access wrapped in try/catch (private browsing): `foodies.token` (app token), `foodies.cache` (last `/api/bootstrap` reply, shown at once on start and when the API cannot be reached) and `foodies.theme` (`light` / `dark`; absent = System; read early by the inline script in `index.html`). Sign-out removes the first two. They do not clash with the live app's `foodies.*` keys because the sites have different origins.
- Reuse before writing: `api()` for every call, `format.ts` for anything web/ui.js or web/geo.js did, `copyText` / `toast` for clipboard and messages.
- Behaviour follows `web/CLAUDE.md` § 4–6: location stays on the phone (`getPosition` → `distanceKm`), touch targets at least 44 px, status lines with `role="status"`, no browser dialogs (a second tap confirms), sub-views push a history entry so the phone's Back returns, tabs replace it.
- Filtering and sorting run on every render, without memoising: cheap for 1,000+ places.
- Routes live in `history.state` (`Route` in `App.tsx`: `view`, place `id`, `dish`, a picked `google` result or a typed `name`, a `notice`), so the phone's Back and a reload keep the view. The list and the Add tab stay mounted (hidden) under sub-views, so search, filters, chips, lookup results and the scroll position survive opening a place.
- Adding a place: the Add tab looks up only on **Search** (each lookup can be a paid Places call). **Pick** opens the form filled from the result, which sends only the `placeId` plus the filled-in fields (`POST /api/places`; Google data comes from the server's cache, D12). On save the form's history entry is replaced by the new place's detail, with "Saved." or "This place was already in your list." (same Google place), so Back returns to a cleared Add tab.
- Android share target: the manifest's `share_target` (GET, `vite.config.ts`) opens `/?title=&text=&url=`; `readShare` in `App.tsx` reads it once at load, cleans the address and opens the Add tab with the text filled in. It works once the app is installed on Android; iPhone has no share target (copy the link, then **Paste**).
- Service worker (D61, `vite-plugin-pwa`, Workbox `generateSW`): precaches only the built files (`html`, `js`, `css`, `woff2`, the icons, the manifest); navigations fall back to `index.html` except `/api/**`; no runtime caching, so API replies (private data) never enter its cache. `registerType: 'autoUpdate'`: a new deploy takes over on the next open. Registered by the `registerSW.js` file (no inline script). Not active in the Vite dev server.
- Install: Android Chrome's `beforeinstallprompt` shows **Install app** in the top bar (`App.tsx`); iPhone Safari gets a hint in Settings unless already opened from the home screen.
- Firebase Hosting headers (`firebase.json`): `no-cache` on `/`, `index.html`, `sw.js`, `registerSW.js` and the manifest, so a deploy reaches phones; a year, immutable, on the hashed `/assets/**`; `nosniff`, `X-Frame-Options: DENY` and `strict-origin-when-cross-origin` on every file.
- Collections (D49, D62): data in `/api/bootstrap` (`collections`, each with `placeIds`); every reply carries the whole `collection`, merged by `saveCollection` in `App.tsx`. Removing a place or deleting a collection needs a second tap and never deletes places. Select in All / Wishlist opens **Add to collection**; inside a collection, **+ Add places** shows the list in `pick` mode without the places already in it and adds straight away.
- Collection map: `maps.ts` loads `https://maps.googleapis.com/maps/api/js` (the second external script, D50) only when a map is first shown; no npm package. `VITE_MAPS_KEY` and `VITE_MAP_ID` come from the GitHub environment variables `MAPS_KEY` / `MAP_ID` at build time; without both the map says it is not set up. Each opening of the Map view is one billed map load; pins are redrawn without a new load when the Type chips change.
- Dishes are last-write-wins (D25). Each dish reply (`POST /api/dishes`, `PATCH` / `DELETE /api/dishes/<id>`) carries the place's `bestDish`, which is merged without changing the place's `version`. Delete needs a second tap.
- Edits go through `patchPlace` with the version the phone loaded and only the changed fields and ratings (D24). On `409`: the form keeps the user's input, shows the server's message and offers **Load latest (drops your edits)**, which refreshes; the form is keyed by `id:version`, so it restarts with the new values. **Mark as tried** on the detail view refreshes at once and asks to try again (D59).
- Buttons may wrap (`.button` has no `nowrap`, unlike `web/styles.css`), so long labels never widen the page on a 320 px phone. Tab labels do not wrap (five tabs fit 320 px with 6 px label padding).

## 4. Deploy

`.github/workflows/frontend.yml`: build on every PR and push touching `frontend/` or `firebase.json`. When the repository variable `CLOUD_DEPLOY` is `on`, a push to `develop` deploys to the **dev** Firebase project and `master` to **prod**. Keep this file current (root `CLAUDE.md` § 4).
