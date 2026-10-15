# docs — the project's written record

Everything here is history unless it says otherwise. The two documents a working session needs are at the
repository root, not in this folder:

- **`../MASTER-PLAN-P25.2.md`** — the plan that stands: what ships, in what order, with what evidence.
- **`../WORK-SANDBOX-MEMORY.md`** — the working memory: state, traps, the next slice, the pending tasks.
- **`../woodex-master-P25/`** — the release pack (payload zip + manifest + install notes).

## What is here

*On 15 October the superseded master plans (the v2.5 design authority, the v2.0/v2.1 plan family, the
older `MASTER-PLAN-P16`…`P19` phase plans and the hosting/backend plans) were removed at the owner's
direction — one plan family, no competing roadmaps. They remain in git history. The `P*` names in old
commit messages and in `frontend-v1/api/*.php` comments refer to them.*

| File | What it is |
|---|---|
| `PROJECT-ANALYSIS-REPORT-2026-10-13.md` / `.pdf` | The measurement the v2.5 work is based on: 26 pages, 13 branches, 365 API actions, the eight Critical findings. |
| `DEPLOY-HOSTINGER-P25.2.md` | The deployment runbook — the owner's instructions for hPanel. |
| `INTAKE-RULES-P25.2.md`, `PAYMENT-RULES-P25.2.md` | The decision records: how an enquiry becomes a lead, and how money lands on an invoice. |
| `GO-LIVE-AUDIT-REPORT.md`, `AUDIT-REPORT-2026-09-28.md`, `P22-AUDIT-VERIFICATION-REPORT.md` | The audits of the v2.1 line, and the verification of the P22 release. |
| `FRONTEND-MASTER-AUDIT-2026-09-29.md`, `FRONTEND-V1-BUILDER*.md` | The front end and builder audits, and the builder's to-do list. |
| `CMS-SETUP.md` | CMS setup as it is understood now. |
| `MASTER-COMPONENTS.md`, `REDIRECT-PLAN.md`, `P15-TODO.md`, `MASTER-REVIEW-20-articles.md`, `FEATURES.md` | Component inventory, the redirect plan, a phase to-do, an article review, and the feature list (`tools/features-build.mjs` renders `FEATURES.md` into `admin/features.html`). |

## Why these are flat, and not sorted into `plans/` and `audits/`

Because they cross-reference each other by filename, as siblings. Splitting them would silently break
dozens of links inside documents that are only ever read — they are not built, not tested, and not served.
A flat folder with this index is the version that stays correct.

## What is *not* here

- `docs/design/DESIGN-SYSTEM.md` — the design system for the v2.5 console (tokens, primitives, type).
- `docs/A5-sample-quotation.pdf` — the printed quotation sample.
- The legacy material that used to sit at the root: the older release zips (`deploy/`, `woodex-master-P22/`,
  `woodex-vlive-P20/`) were removed from the tree in P25 — the P25 payload supersedes them, and any of them
  is recoverable from history (`git log --diff-filter=A -- <path>`, then `git show <sha>:<path>`). The small
  documents inside those folders were kept, because they are the record of what those releases contained.
