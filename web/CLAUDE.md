# web — Developer and Agent Guide

The phone app: a static PWA with no build step, served from GitHub Pages under a sub-path (`/<repo>/`), so every path is **relative** (`./`, `icons/…`). Read first: root `CLAUDE.md`, root `README.md`, `docs/decisions.md`.

---

## 1. Folder Directory Map

```
web/
├── CLAUDE.md               # This file (published to Pages with the rest of web/; it holds nothing secret)
├── index.html              # One page: views #view-list, #view-place, #view-form, #view-add, #view-dish, #view-photos, #view-setup + bottom tab bar
├── styles.css              # Design tokens on :root (light + dark), layout, tab bar, cards, detail, dishes
├── app.js                  # Entry: init, refresh, tabs, Near me, settings and theme, install button, Back handling
├── state.js                # Shared in-memory data + change hook (onChange / changed)
├── ui.js                   # DOM helpers, formatting, Maps link, copy / share / toast, show(view)
├── list.js                 # All / Wishlist / Near me list: label chips, filters, score / distance sort, cards with cover photo, Copy list
├── place.js                # Place detail (Copy, Share, Photos), add / edit form incl. labels and suggestions, update with conflict check
├── dishes.js               # Dish list on the detail view, dish form (with photos), delete
├── add.js                  # Add tab: lookup, results, manual add, Paste, Android share target
├── photos.js               # Place and dish photos: shrink to JPEG, upload, gallery, full-screen viewer, remove
├── api.js                  # call(action, data), settings, theme and list cache in localStorage
├── geo.js                  # distanceKm (haversine), getPosition (Geolocation API)
├── sw.js                   # Service worker: network-first for own files, cache fallback offline
├── manifest.webmanifest    # name, icons, standalone display, share_target (Android)
├── fonts/                  # Nunito (body) and Fredoka (headings), Latin woff2 + their OFL licences
└── icons/                  # icon-192.png, icon-512.png (also maskable), apple-touch-icon.png (180)
```

Module graph (no cycles): `app` → `list`, `place`, `dishes`, `add`, `photos`; `list` → `place`, `photos`; `add` → `place`; `place` → `dishes`, `photos`; `dishes` → `photos`; all → `state`, `ui`, `api`. Cross-module re-rendering goes through `changed()` (list) and the `popstate` handler in `app.js` (detail view).

---

## 2. File Reference

| File | Key functions / parts |
|---|---|
| `app.js` | `init`, `apply(data)`, `refresh`, `locate`, `selectTab`, `saveSetup`, `initInstall`, `applyTheme`, `initTheme`, `onChange` handler (cache + re-render), `popstate` handler (re-renders the gallery for `photos`), Copy list wiring |
| `state.js` | `state`, `onChange`, `changed`, `placeById`, `dishesOf`, `upsert` |
| `ui.js` | `$`, `el`, `text`, `httpsUrl`, `areaOf`, `locationOf`, `labelsOf`, `unique`, `coordsOf`, `formatKm`, `mapsHref`, `placeText`, `toast`, `copyText`, `canShare`, `sharePlace`, `show(view, push)` (`VIEWS` includes `photos`) |
| `list.js` | `renderFilters`, `renderLabelChips`, `renderList`, `placeCard` (copy icon, cover thumbnail via `coverOf` / `photoImg`), `copyList`, `averageRank` (score rank = position in Master `rating`) |
| `place.js` | `openPlace`, `renderPlace` (incl. the Photos section), `openForm({place|google|manual})`, `save`, `update`, `formFields` (kinds: text, url, choice, `suggest` = text + `<datalist>` of values used elsewhere, labels, rating, note, check), `choiceControl`, `labelsControl` |
| `dishes.js` | `dishList`, `openDish`, `renderDishPhotos` (saved dishes only), `initDishes` (save, two-tap delete) |
| `add.js` | `initAdd`, `lookup`, `resultCard`, `paste`, `addManual`, `readShare` |
| `photos.js` | `MAX_PHOTOS`, `photoIdsOf`, `photoUrl` (`drive.google.com/thumbnail`, **Unverified**), `photoImg`, `coverOf`, `shrink` (canvas → JPEG, longest side 1600 px, quality 0.8), `upload`, `addPhotoButton`, `openGallery`, `renderGallery`, `openViewer` (two-tap Remove) |
| `api.js` | `call`, `getSettings`, `saveSettings`, `getTheme`, `saveTheme`, `readCache`, `writeCache` |
| `geo.js` | `distanceKm`, `getPosition` |
| `sw.js` | `SHELL` list (add every new file here), `install` / `activate` / `fetch` handlers |

### Backend calls

| Call | Where | Sends |
|---|---|---|
| `list` | `app.js` `refresh`, `saveSetup` | — |
| `lookup` | `add.js` | `input` |
| `add` | `place.js` `save` | `placeId` (or empty for manual), `fields` (every form field) |
| `update` | `place.js` `update` | `id`, `changes` (changed fields only), `original` (their values when the form opened) |
| `saveDish` / `deleteDish` | `dishes.js` | `dish{id?, place, name, price, liked, best, note}` / `id` |
| `addPhoto` | `photos.js` `upload` | `target` (`place` or `dish`), `id`, `data` (base64 JPEG, shrunk) |
| `deletePhoto` | `photos.js` `openViewer` | `target`, `id`, `photoId` |

### localStorage keys (per device)

| Key | Holds |
|---|---|
| `foodies.backendUrl` | Apps Script `/exec` URL (must match `https://script.google.com/macros/s/…/exec`) |
| `foodies.token` | Shared token |
| `foodies.cache` | Last data `{places, dishes, options, people}` for offline / instant start; rewritten after every change |
| `foodies.theme` | Theme choice: `system` (default), `light` or `dark`; an inline script in `index.html` `<head>` applies it before first paint |

---

## 3. Reuse Before You Write

| Need | Use |
|---|---|
| Call the backend | `call('action', {...})` — adds the token, throws on `ok:false` |
| Build DOM safely | `el(tag, props, ...children)` with `textContent` (drops `null` / `''` / `false` children) |
| Trimmed text from any value / a safe external link | `text(v)` / `httpsUrl(v)` |
| A place's "district, city" / full "landmark, district, city, country" | `areaOf(p)` / `locationOf(p)` |
| A place's labels as a list | `labelsOf(p)` (the sheet stores `"A, B"`) |
| The text to copy or share for a place | `placeText(p)`: name, location, Maps link on three lines |
| Copy with a "Copied" message / a short message | `copyText(value, doneMessage)` / `toast(msg)` |
| A place's coordinates | `coordsOf(p)` → `{lat, lng}` or `null` |
| A link to open in Google Maps | `mapsHref(p)` (`Link Google`, else a Maps search) |
| Switch view | `show(view, push)`; `push` adds a history entry so the phone's Back returns |
| Update data and re-render lists | `upsert(state.places | state.dishes, item)` then `changed()` |
| A record's photo IDs / a thumbnail `<img>` / the Add photo control | `photoIdsOf(record)` / `photoImg(id, width, className)` / `addPhotoButton(target, id, status, done)` |
| Sorted unique values (filters, label chips, suggestions) | `unique(list)` (`ui.js`) |

---

## 4. Conventions

- Vanilla ES modules, no framework, no CDN, no build. `node --check` each changed file.
- Every storage access is wrapped in `try/catch` (private mode can block it); the app must still run without storage.
- Place text goes into the DOM with `textContent`. Links from the sheet are used only when they start with `https://`.
- Status lines (`#status`, `#place-status`, `#form-status`, `#add-status`, `#dish-status`, `#setup-status`, `#photos-status`, `#viewer-status`, `#toast`) carry `role="status"`; touch targets are at least 44 px.
- A control holding several buttons (the labels field) is wrapped in a `div`, not a `label`: a `label` forwards taps on its text to its first button.
- No browser dialogs (`alert` / `confirm`): destructive actions use a second tap.
- The phone never sends Google place data to save; it sends `placeId` and the user's own fields (`docs/decisions.md` D12).

---

## 5. Platform Rules

- **Android = installable app.** Chrome needs the manifest (`display: standalone`, 192 / 512 + maskable icons, `start_url`, `scope`), the service worker and HTTPS. `initInstall` keeps Chrome's `beforeinstallprompt` and shows **Install app** in the top bar; it hides after `appinstalled`.
- **iPhone = everything works in Safari from the URL**; a home-screen icon is optional. No feature may depend on install, the share target or clipboard read. Settings shows an "Add to Home Screen" hint on iOS when not already installed.
- **Bottom tab bar** is fixed with `padding-bottom: env(safe-area-inset-bottom)` (needs `viewport-fit=cover`, set in `index.html`), and `main` has matching bottom padding.
- **Location never leaves the phone.** `getPosition` → `distanceKm` → sort. Do not send coordinates to the backend.
- **Share target is Android only.** `share_target` opens `./?title=&text=&url=`; `readShare` moves that into the Add box and cleans the URL. iPhone users copy the link and use **Paste** or long-press paste.
- **Clipboard read** (`navigator.clipboard.readText`) may be refused; the fallback is a message asking for a manual paste.
- **Clipboard write** (`copyText`) uses `navigator.clipboard.writeText`, falling back to a hidden textarea + `execCommand('copy')` (older iPhone Safari). Both need a real tap; a scripted click is refused.
- **Share** uses the Web Share API (`navigator.share`, Android Chrome and iPhone Safari); the button is left out where the browser has no share menu. Cancelling the menu is not an error.
- **Back button:** sub-views (place, form, dish, photos, settings) are pushed with `history.pushState`; `popstate` re-renders the detail view and shows the previous view. Tabs replace the current entry. The full-screen photo viewer pushes its own entry, so Back closes it first.
- **Photos on both phones:** the picker is a `label` wrapping `input type="file" accept="image/*" multiple`, so the camera or the library opens on Android and iPhone Safari. Not yet tested on real phones (**Unverified**).
- **Photo URLs:** thumbnails and the viewer load `https://drive.google.com/thumbnail?id=…&sz=w<width>` (`photoUrl`). That URL is widely used but undocumented: **Unverified**; test on both phones.
- **Photos are not offline:** they are cross-origin (Drive), so the service worker does not cache them. The rest of the app still works offline.
- **Shrinking:** `shrink` draws the picture on a canvas (the browser applies the photo's rotation on decode), then sends JPEG, longest side 1600 px, quality 0.8, as base64. The backend refuses a photo over 1.5 MB.
- **Suggestions (`suggest` fields):** Country, City and District are free text with a `<datalist>` of values already used. Behaviour of `<datalist>` on iPhone Safari is **Unverified**.
- **Theme:** Settings → Theme (System / Light / Dark), stored per phone in `foodies.theme` and applied before first paint.
- **Service worker** is network-first, so a deploy reaches phones on their next online launch with no cache-version bump. New files must be added to `SHELL` to work offline (`photos.js` is in `SHELL`).
- **Backend URL and token** are entered on first launch (Settings view) and stored only in `localStorage`; never hardcode them.

---

## 6. Design Preferences

- **"Sticker" look** (owner's pick, 2026-11-16): every box has a 2 px ink outline (`--line`), rounded corners (14–18 px; chips and badges fully round) and a solid offset shadow (`--shadow`, `--shadow-big`); pressing a button shifts it into its shadow.
- Tokens in `styles.css` `:root`: `--bg`, `--surface`, `--soft`, `--text`, `--muted`, `--line`, `--accent` (tomato), `--accent-text`, the pastel fills `--sun` (wishlist, toast, active tab, Install), `--mint` (tried), `--lilac` (labels) with `--on-pastel` text, `--body` / `--display` fonts.
- **Theme** (Settings → Theme, key `foodies.theme`): System follows `prefers-color-scheme`; Light and Dark set `data-theme` on `<html>`. Dark tokens are defined twice in `styles.css`: under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`. They redefine the tokens only; pastels keep dark text in both themes. `theme-color` follows the chosen theme.
- Fonts are bundled (works offline, no Google request): Nunito for text, Fredoka for headings, Latin subset only, in `fonts/` with their SIL Open Font Licences; both are in `SHELL`. Other scripts fall back to the system font.
- Single column, max 640 px, 16 px side gutter; sticky cream top bar (title, Install app, ⚙); fixed bottom tabs All · Wishlist · Near me · Add.
- English UI; the sheet's own labels (Tipe, Genre, Jenis) are kept.
- Icon: cream plate on orange (`icons/`), motif kept inside the maskable safe zone.
- `[hidden]` is forced to `display: none` so classes with `display` cannot reveal hidden elements.

---

## 7. Deploy Notes

- `master` is prod. A push to `master` that touches `web/**` runs `.github/workflows/pages.yml`, which uploads `web/` as-is and deploys it to GitHub Pages (source: GitHub Actions). It can also be run by hand (Actions → Run workflow); the deploy job runs only on `master`.
- Keep this file current (root `CLAUDE.md` § 4).
