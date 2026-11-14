# web — Developer and Agent Guide

The phone app: a static PWA with no build step, served from GitHub Pages under a sub-path (`/<repo>/`), so every path is **relative** (`./`, `icons/…`). Read first: root `CLAUDE.md`, root `README.md`, `docs/decisions.md`.

---

## 1. Folder Directory Map

```
web/
├── CLAUDE.md               # This file (published to Pages with the rest of web/; it holds nothing secret)
├── index.html              # One page, three views: #view-list, #view-add, #view-setup
├── styles.css              # Design tokens on :root (light + dark), layout, cards, buttons
├── app.js                  # UI: render list, filters, near me, lookup + save, setup, share target, SW register
├── api.js                  # call(action, data), settings + list cache in localStorage
├── geo.js                  # distanceKm (haversine), getPosition (Geolocation API)
├── sw.js                   # Service worker: network-first for own files, cache fallback offline
├── manifest.webmanifest    # name, icons, standalone display, share_target (Android)
└── icons/                  # icon-192.png, icon-512.png (also maskable), apple-touch-icon.png (180)
```

---

## 2. File Reference

| File | Key functions / parts |
|---|---|
| `app.js` | `init`, `show(view)`, `render`, `renderFilters`, `placeCard`, `mapsHref`, `refresh`, `toggleNearMe`, `lookup`, `save`, `paste`, `saveSetup`, `readShare` |
| `api.js` | `call`, `getSettings`, `saveSettings`, `readCache`, `writeCache` |
| `geo.js` | `distanceKm`, `getPosition` |
| `sw.js` | `SHELL` list (add every new file here), `install` / `activate` / `fetch` handlers |

### localStorage keys (per device)

| Key | Holds |
|---|---|
| `foodies.backendUrl` | Apps Script `/exec` URL (must match `https://script.google.com/macros/s/…/exec`) |
| `foodies.token` | Shared token |
| `foodies.cache` | Last `list` response `{places, fields}` for offline / instant start |

---

## 3. Reuse Before You Write

| Need | Use |
|---|---|
| Call the backend | `call('action', {...})` — adds the token, throws on `ok:false` |
| Build DOM safely | `el(tag, props, ...children)` with `textContent` |
| Trimmed text from any value | `text(v)` |
| A place's categories / city | `categoriesOf(p)` / `areaOf(p)` (user city first, then Google area) |
| A place's coordinates | `coordsOf(p)` → `{lat, lng}` or `null` |
| A link to open in Google Maps | `mapsHref(p)` |

---

## 4. Conventions

- Vanilla ES modules, no framework, no CDN, no build. `node --check` each changed file.
- Every storage access is wrapped in `try/catch` (private mode can block it); the app must still run without storage.
- Place text goes into the DOM with `textContent`. Links from the sheet are used only when they start with `https://`.
- Status lines (`#status`, `#add-status`, `#setup-status`) carry `role="status"`; touch targets are at least 44 px.

---

## 5. Platform Rules

- **Location never leaves the phone.** `getPosition` → `distanceKm` → sort. Do not send coordinates to the backend.
- **Share target is Android only.** `share_target` opens `./?title=&text=&url=`; `readShare` moves that into the Add box and cleans the URL. iPhone PWAs cannot receive shares: the user copies the link and uses **Paste** or long-press paste.
- **Clipboard read** (`navigator.clipboard.readText`) may be refused; the fallback is a message asking for a manual paste.
- **Service worker** is network-first, so a deploy reaches phones on their next online launch with no cache-version bump. New files must be added to `SHELL` to work offline.
- **Backend URL and token** are entered on first launch (Settings view) and stored only in `localStorage`; never hardcode them.

---

## 6. Design Preferences

- Tokens in `styles.css` `:root`: `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent` (`#c2410c` light / `#fb923c` dark), `--accent-text`. Dark mode follows `prefers-color-scheme`.
- Single column, max 640 px, 16 px side gutter; sticky orange top bar with the three view buttons.
- Icon: cream plate on orange (`icons/`), motif kept inside the maskable safe zone.

---

## 7. Deploy Notes

- `master` is prod. A push to `master` that touches `web/**` runs `.github/workflows/pages.yml`, which uploads `web/` as-is and deploys it to GitHub Pages (source: GitHub Actions). It can also be run by hand (Actions → Run workflow); the deploy job runs only on `master`.
- Keep this file current (root `CLAUDE.md` § 4).
