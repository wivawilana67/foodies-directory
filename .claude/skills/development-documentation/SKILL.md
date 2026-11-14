---
name: development-documentation
description: Keep the CLAUDE.md files, README.md and docs/ of this repo (foodies-directory) in sync with the code. Use this skill EVERY time development changes a file, function, API action, request/response field, sheet column or header, Script Property, Places field mask, limit, view, localStorage key, manifest entry, deploy step or design decision in `apps-script/` or `web/` — even if the user doesn't mention documentation. Also use when asked to "document this", "update the readme" or "sync docs". The change is not done until the matching docs are updated in the same commit.
---

# Development Documentation

The docs describe the code as it is **now** (root `CLAUDE.md` § 2). This skill edits documentation only; it never pushes, deploys or runs `clasp` / `npm run`.

## Which doc

| Changed | Update |
|---|---|
| `apps-script/src/*` | `apps-script/CLAUDE.md` (file map § 1, actions / editor functions / Script Properties § 2, helpers § 3, conventions § 4, domain rules § 5, deploy § 6) |
| `web/*` | `web/CLAUDE.md` (file map § 1, functions + localStorage keys § 2, helpers § 3, platform rules § 5, design § 6) |
| The API contract (action, request or response field) | Both CLAUDE.md files above **and** README Data Flow table |
| Anything the user sees or does | README **Business Flow** |
| Which data moves where, a column, a Script Property, a Places call count | README **Data Flow** |
| Setup, deploy or install steps | README Setup / Install, root `CLAUDE.md` § 5 |
| A folder, top-level file, coding rule, workflow | Root `CLAUDE.md` (folder map, "Where do I change…?", rules) |
| A design decision made, changed or reversed | `docs/decisions.md` (append; mark reversed ones, never delete) |
| Google Cloud setup | `docs/gcp-setup.md` |

## Workflow

1. **Identify the change** with `git diff` and `git status`. Document what the diff shows; do not guess intent. If unclear, ask (root `CLAUDE.md` § 3, "Facts only").
2. **Read the target docs** and the changed source so names, fields and rules are exact.
3. **Edit in place.** Rewrite stale statements, remove deleted behaviour, add new behaviour. No changelog entries.
4. **Keep "Unverified" markers honest.** Remove one only when the fact was confirmed (e.g. `checkColumns` output, a real link tested); add one for every new assumption.
5. **Verify** every function, file, action, column, property and key named in the docs exists in the code, and the folder maps list every file.
6. **Report** in the final message which doc sections changed and why (one line each), or why none needed to.

## Style

- Exact identifiers in backticks; describe behaviour, not line numbers.
- Keep README at the level of what happens and where data goes; rules and quirks go in the folder CLAUDE.md.
- Never include the API key, token, script ID, spreadsheet ID, deployment URL or personal data — this repo is public.
