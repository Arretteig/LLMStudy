# LLMStudy

A **local-first study OS** for NVIDIA AI certifications — starting with the
**NVIDIA-Certified Associate: Generative AI and LLMs (NCA-GENL)** exam.

Not a flashcard app. The goal is a practical learning/lab system that makes you
*explain* concepts, *run* small experiments, *document* observations, and
*revisit* weak areas.

> **Status: Milestone 3 (Spaced Review).** The blueprint tracker, the active-recall
> question bank, and the spaced-review queue are working end-to-end. The lab
> notebook and the dashboard are scaffolded in the nav as "coming soon" and land in
> the next milestones.
>
> **Upgrading from an earlier milestone?** The schema grew (questions in M2, the
> `answer_attempts` table in M3). New tables are created automatically on boot; run
> `npm run seed` once to load new starter content (non-destructive), or
> `npm run db:reset` for a clean slate.

---

## Stack

| Layer     | Choice                                             |
| --------- | -------------------------------------------------- |
| Frontend  | Vite + React 18 + TypeScript (SPA), React Router   |
| Backend   | Express + TypeScript (run via `tsx`), thin `/api`  |
| Database  | SQLite via `better-sqlite3` (single file, WAL)     |
| DB access | Raw SQL + a single idempotent `db/schema.sql`      |
| Tests     | Vitest (focused on the data layer)                 |
| Workspace | npm workspaces: `apps/web`, `apps/server`, `packages/shared` |

No framework magic, no ORM, no auth — one language end-to-end. The `/api` boundary
is the seam where a future Python AI service (RAG, grading, benchmarks) slots in
without touching the frontend or the data model.

## Prerequisites

- **Node.js ≥ 18.18** (Node 20 or 22 LTS recommended so `better-sqlite3` installs
  a prebuilt binary rather than compiling).
- npm 9+ (ships with modern Node).

## Setup

```bash
npm install
```

This installs every workspace. `better-sqlite3` is a native module; on a standard
Node LTS it pulls a prebuilt binary (no compiler needed).

## Run

```bash
npm run dev
```

This starts both processes together:

- **API** on <http://localhost:3001>
- **Web** on <http://localhost:5173> (open this in your browser)

On first boot the API creates `db/data/study.db` and **auto-seeds the NCA-GENL
objectives**, so the app is useful immediately.

## Useful commands

| Command             | What it does                                              |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Run API + web together (dev)                             |
| `npm run seed`      | Load starter objectives (idempotent — no duplicates)     |
| `npm run db:reset`  | Delete the SQLite file and re-seed from scratch          |
| `npm test`          | Run the data-layer tests                                 |
| `npm run build`     | Production build of the web client                       |

## Project structure

```
LLMStudy/
├── db/
│   ├── schema.sql              # all tables (idempotent, applied on boot)
│   ├── seed/nca-genl.json      # starter objectives — EDITABLE placeholder content
│   └── data/                   # study.db lives here (gitignored)
├── packages/shared/src/types.ts  # domain types shared by API + web
└── apps/
    ├── server/src/
    │   ├── db.ts               # opens SQLite, applies schema (the only SQLite-aware file)
    │   ├── seed.ts             # loads seed JSON
    │   ├── objectives.repo.ts  # objective queries
    │   ├── routes/objectives.ts
    │   ├── index.ts            # Express bootstrap (+ auto-seed on empty)
    │   └── bin/{seed,reset}.ts # CLI entrypoints
    └── web/src/
        ├── api/client.ts       # typed fetch wrapper
        └── pages/Objectives.tsx
```

## Seed data

`db/seed/nca-genl.json` contains 25 starter objectives across the five official
NCA-GENL domains and their exam weights:

| Domain                                | Weight |
| ------------------------------------- | ------ |
| Core Machine Learning and AI Knowledge | 30%   |
| Software Development                   | 24%   |
| Experimentation                        | 22%   |
| Data Analysis and Visualization        | 14%   |
| Trustworthy AI                         | 10%   |

Domains and weights come from NVIDIA's
[official certification page](https://www.nvidia.com/en-us/learn/certification/generative-ai-llm-associate/).
The individual objective wordings are **representative study targets, not verbatim
official sub-objectives** — edit them freely. Re-running the seed never duplicates
rows (keyed on `cert_path` + `title`).

## Data export

The single SQLite file *is* your data. Export any time:

```bash
sqlite3 db/data/study.db .dump > backup.sql          # full schema + data
sqlite3 db/data/study.db ".mode csv" ".output objectives.csv" "SELECT * FROM objectives;"
```

Every column is explicit (no JSON blobs), dates are ISO-8601 text, so rows map 1:1
to CSV/pandas.

## Roadmap

- **M1 — Objective tracker** ✅
- **M2 — Recall questions** linked to objectives ✅
- **M3 — Answer + self-score + spaced-review queue** ✅ (this milestone) (`1→+1d, 2→+2d, 3→+4d, 4→+7d, 5→+14d`)
- **M4 — Lab notebook** (hypothesis → change → observe → explain → next)
- **M5 — Weak-areas / progress dashboard**
- **M6 — Full seed content, scripts, tests, README polish**

Designed to grow later (schema hooks already planned, not yet built): strict-citation
RAG assistant, LLM answer grading, timed mock exams, and an inference/vLLM benchmark
logger.
