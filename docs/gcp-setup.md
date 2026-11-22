# Google Cloud Setup

State as of the handoff summary, session 2 (2026-11-14). "Verified" means seen in the owner's screenshots; everything else is open. Never paste the API key anywhere, including chat and this file.

## Verified

- Project "Foodies Directory" exists and is linked to a billing account (no organization, currency IDR).
- Places API (New) is enabled.
- API key named "Google Place API" is restricted to Places API (New) only. Application restrictions: None.
- The billing menu item is now called **"Budgets & caps"** (under Cost control), not "Budgets & alerts".
- Quotas & System Limits shows 30 quotas, all adjustable. Defaults seen:

| Quota | Per day | Per minute |
|---|---|---|
| AutocompletePlacesRequest | 175,000 | 12,000 |
| GetPhotoMediaRequest | 175,000 | 600 |
| GetPlaceRequest | 125,000 | 600 |
| LookupMediaRequest | 75,000 | 600 |
| LookupReviewPostsRequest | 75,000 | 600 |

The rest of the list was not seen. SearchTextRequest per day is assumed to exist.

- Budget "Foodies Budget" (seen 2026-11-21): monthly, Rp 50,000, applies to the whole billing account, alerts at 50%, 90% and 100%; spend cap status "Not applicable".
- "Budgets & caps" offers real spend caps on projects and services, not just alerts: a cap pauses those services when exceeded and resets at the start of each month (page text, seen 2026-11-21).

## Replatform: dev environment (set up 2026-11-21, from the owner's Cloud Shell output)

The project ID and site address are kept out of this public file.

- Neon project "foodies-directory" (AWS Singapore), database `foodies`, branches `production` and `dev`; role `app_dev` on `dev`.
- Google Cloud project "Foodies Directory Dev", linked to the open billing account (same budget as above); Firebase added (Blaze); default Hosting site exists.
- APIs enabled: Cloud Run, Artifact Registry, Secret Manager, IAM Credentials, STS, Firebase Hosting, Cloud Resource Manager.
- Artifact Registry Docker repository `foodies` in `asia-southeast1`.
- Service accounts `api-runtime` (no project roles; reads the two secrets) and `deployer` (`run.admin`, `artifactregistry.writer`, `firebasehosting.admin`, `serviceAccountUser` on `api-runtime`).
- Secrets `DATABASE_URL` (Neon `dev`, pooled, `app_dev`) and `DJANGO_SECRET_KEY`, version 1 each.
- Workload Identity pool `github`, provider `github-repo`, condition: this repository and `refs/heads/develop` only; `deployer` grants `workloadIdentityUser` to the repository.
- GitHub: environment `dev` (branch `develop`) with `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`, `DEPLOYER_SA`; repository variable `CLOUD_DEPLOY=on`.
- First deploy 2026-11-21 from `develop`: Cloud Run service `foodies-api` (`asia-southeast1`) and the Hosting site are live; `/api/health` through the site returns `{"ok": true}` (cold ~3 s, warm ~0.3 s). This also proves the WIF login, the secrets and their IAM bindings.
- 2026-11-22: the Phase 2 deploy created the Cloud Run job `foodies-migrate` (runs `manage.py migrate` as `api-runtime` with the same secrets) and its first execution succeeded, so the tables exist on Neon `dev`. The deployer's `run.admin` covered creating and running the job; no new role was needed.
- 2026-11-22, Phase 3 setup round (dev): Google Auth Platform with External audience in Testing mode and both Gmails as test users; a Web OAuth client for the dev site and `http://localhost:5173`; Places API (New) enabled with a server key restricted to it; secrets `ALLOWED_EMAILS` and `PLACES_API_KEY` readable by `api-runtime`; GitHub `dev` variables `GOOGLE_CLIENT_ID` and `DJANGO_CSRF_TRUSTED_ORIGINS`. The photo bucket was not created (photos dropped, D57). Sign-in and a name lookup verified on the dev site by the owner.
- Firebase CLI warns it cannot check API enablement without `roles/serviceusage.serviceUsageConsumer` on `deployer`; harmless, the deploy succeeds.

## Open

- [ ] API key edit page: **Save** clicked?
- [ ] Spend cap: decide whether to add one to the new dev and prod projects (replatform); whether a cap can be set on a billing-account budget is **Unverified**.
- [ ] API key stored in a password manager?
- [ ] Quota caps — deliberately skipped by the owner for now (see below).

## Quota caps (recommended if revisited)

Risk while defaults stay: a leaked key could run up a bill. The in-code counter (`apps-script/src/Usage.js`) does not protect against direct use of the key.

| Quota | Set to |
|---|---|
| SearchTextRequest per day | 30 (raise to ~250 on backfill day only) |
| GetPlaceRequest per day | 30 |
| Every other "per day" quota | 0 |
| Per-minute quotas | unchanged |
