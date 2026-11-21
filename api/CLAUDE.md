# api — Developer and Agent Guide

The new backend (replatform, `docs/decisions.md` D39–D52): a Django app in one Docker image. It runs locally in `docker compose` and in production on Cloud Run (`asia-southeast1`), with PostgreSQL (local container, Neon in the cloud). **Phase 1 scaffold**: only `GET /api/health` exists. The live backend is still `apps-script/` until the switch-over.

Read first: root `CLAUDE.md`, `README.md` (Local development) and `docs/decisions.md` D39–D52.

---

## 1. Folder Directory Map

```
api/
├── CLAUDE.md, AGENTS.md
├── Dockerfile          # python:3.13-slim + postgresql-client (pg_dump); gunicorn on $PORT (8080) by default
├── requirements.txt    # Django 5.2 LTS, dj-database-url, psycopg 3, gunicorn
├── .dockerignore
├── manage.py
├── config/             # Django project: settings (all from env), urls, wsgi
└── foodies/            # The app: views (health), tests
```

## 2. Endpoints

| Method + path | View | Response |
|---|---|---|
| `GET /api/health` | `foodies.views.health` | `{"ok": true}` after a `SELECT 1`; `503 {"ok": false, "error": "Database unavailable"}` when the database is unreachable |

## 3. Settings (environment variables)

| Variable | Required | Local (`docker-compose.yml`) | Cloud Run |
|---|---|---|---|
| `DATABASE_URL` | yes | the `db` container | Secret Manager `DATABASE_URL` (Neon pooled string, `sslmode=require`) |
| `DJANGO_SECRET_KEY` | yes | `local-dev-only` | Secret Manager `DJANGO_SECRET_KEY` |
| `DJANGO_DEBUG` | no | `1` | unset (off) |
| `DJANGO_ALLOWED_HOSTS` | no | `*` | `*` (default) |
| `PORT` | no | — (runserver on 8000) | set by Cloud Run; image default 8080 |

Time zone `Asia/Jakarta`; logs go to stdout (Cloud Logging on Cloud Run). Never log tokens, keys or a user's location.

## 4. Commands (all inside Docker)

| Task | Command (repo root) |
|---|---|
| Run API + database + web | `docker compose up` |
| Tests | `docker compose run --rm api python manage.py test` |
| Django shell / any manage.py command | `docker compose run --rm api python manage.py <command>` |
| Rebuild after changing `requirements.txt` | `docker compose build api` |

## 5. Conventions

- Settings only from environment variables; no secret, ID or URL in code (root `CLAUDE.md` § 5).
- Views log their entry point and writes, catch, log with context and return a clear error.
- Every change keeps `python manage.py test` green; CI (`.github/workflows/api.yml`) runs it in the built image against Postgres 17.

## 6. Deploy

`.github/workflows/api.yml`: tests on every PR and push touching `api/`. When the repository variable `CLOUD_DEPLOY` is `on`, a push to `develop` deploys the image to the **test** project and `master` to **prod** (GitHub environments `test` / `prod`, Workload Identity Federation, service `foodies-api`, runtime service account `api-runtime`). Keep this file current (root `CLAUDE.md` § 4).
