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

## Open

- [ ] Budget alert (~Rp 50,000, thresholds 50/90/100%) saved?
- [ ] API key edit page: **Save** clicked?
- [ ] Does "Budgets & caps" offer a real spending cap, not just alerts?
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
