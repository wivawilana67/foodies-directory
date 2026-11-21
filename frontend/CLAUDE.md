# frontend — Developer and Agent Guide

The new phone app (replatform, `docs/decisions.md` D39–D52): React + TypeScript + Vite, built to static files and served by Firebase Hosting, which sends `/api/**` to Cloud Run (`firebase.json`). **Phase 1 scaffold**: one page that shows whether `/api/health` answers. The live app is still `web/` until the switch-over; its rules (iPhone Safari without install, location stays on the phone, Sticker design) carry over.

Read first: root `CLAUDE.md`, `README.md` (Local development), `docs/decisions.md` D39–D52 and `web/CLAUDE.md` (behaviour being ported).

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
    ├── main.tsx                       # React root
    ├── App.tsx                        # Phase 1: API health status
    └── vite-env.d.ts
```

## 2. Commands (all inside Docker)

| Task | Command (repo root) |
|---|---|
| Dev server (with API and database) | `docker compose up`, then http://localhost:5173 |
| Add a package | `docker compose run --rm web npm install <package>` |
| Type-check + build | `docker compose run --rm web npm run build` |

The `web` container runs as user `node` (uid 1000), so `node_modules/` and `package-lock.json` in `frontend/` belong to you. `node_modules/` and `dist/` are gitignored.

## 3. Conventions

- Text goes into the page through React (escaped); never `dangerouslySetInnerHTML`.
- Calls go to relative `/api/...` paths, so the same build works behind Firebase Hosting and the dev proxy.
- No secrets in the build: `VITE_*` values (Google client ID, Maps key, Map ID) are public by design and come from GitHub environment variables at build time.

## 4. Deploy

`.github/workflows/frontend.yml`: build on every PR and push touching `frontend/` or `firebase.json`. When the repository variable `CLOUD_DEPLOY` is `on`, a push to `develop` deploys to the **dev** Firebase project and `master` to **prod**. Keep this file current (root `CLAUDE.md` § 4).
