# LLMStudy

A **local-first study OS** for NVIDIA AI certifications — starting with the
**NVIDIA-Certified Associate: Generative AI and LLMs (NCA-GENL)** exam.

Not a flashcard app. It's a practical learning/lab system that makes you *explain*
concepts, *run* small experiments, *document* observations, and *revisit* weak
areas — with everything connected back to the certification blueprint.

> **Status: exam-prep pipeline complete.** Dashboard, objective tracker, recall
> questions, spaced review (growing-interval scheduler), MCQ drill, timed mock
> exams, calibration tracking, labs, and runs all work end-to-end. No auth, no
> cloud — it runs entirely on your machine. LLM grading, RAG, and a benchmark
> logger remain designed-for but intentionally not built.

---

## Stack

| Layer     | Choice                                                   |
| --------- | -------------------------------------------------------- |
| Frontend  | Vite + React 18 + TypeScript (SPA), React Router         |
| Backend   | Express + TypeScript (run via `tsx`), thin `/api`        |
| Database  | SQLite via `better-sqlite3` (single file, WAL)           |
| DB access | Raw SQL: frozen baseline `db/schema.sql` + versioned migrations (`PRAGMA user_version`) |
| Tests     | Vitest — repo/unit tests + a supertest route smoke test  |
| Workspace | npm workspaces: `apps/web`, `apps/server`, `packages/shared` |

One language end-to-end, no ORM, no framework magic. The `/api` boundary is the
seam where a future Python AI service (RAG, grading, benchmarks) can slot in
without touching the frontend or the data model.

## Prerequisites

- **Node.js ≥ 18.18** (Node 20/22/24 all work; a recent LTS is recommended so
  `better-sqlite3` installs a prebuilt binary rather than compiling).
- npm 9+.

## Setup & run

```bash
npm install
npm run dev
```

- **Web** → <http://localhost:5173> (open this)
- **API** → <http://localhost:3001>

On first boot the API creates `db/data/study.db` and **auto-seeds** the NCA-GENL
content, so the app is useful immediately.

## Commands

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `npm run dev`      | Run API + web together (dev)                             |
| `npm run seed`     | Load/refresh starter content (idempotent, non-destructive) |
| `npm run db:reset` | Delete the SQLite file and re-seed from scratch          |
| `npm test`         | Run the server test suite                                |
| `npm run build`    | Production build of the web client                       |

> **Upgrading an existing DB after pulling changes?** New tables are created
> automatically on boot; run `npm run seed` once to pull in new starter content
> (it never duplicates or deletes). Use `npm run db:reset` for a clean slate.

## The modules (and the intended workflow)

1. **Dashboard** (`/`) — where you stand on NCA-GENL and what to work on next:
   headline stats, a ranked **weak-areas** list with reasons and one-click actions,
   and a **domain readiness** table showing the official exam weights.
2. **Objectives** (`/objectives`) — the certification blueprint. Set confidence
   (1–5) and status, record evidence of understanding.
3. **Questions** (`/questions`) — the question library: open-ended **recall**
   cards (feed the spaced Review queue) and **MCQ** items with per-option
   rationales (feed Drill and Exams). Search, filters, per-card attempt history,
   and authoring for both formats.
4. **Review** (`/review`) — the spaced-review queue. One card at a time: answer,
   reveal, self-rate 1–5. Ratings drive the schedule: `1→+1d, 2→+2d, 3→+4d,
   4→+7d, 5→+14d`, then intervals **grow** on repeated success (×1.2/×2.0/×2.5,
   capped at 60 days or ~15% of days-to-exam once a date is set) and reset on a
   lapse. Keyboard-first (`Space` reveal · `1–3` confidence before reveal ·
   `1–5` rate after · `S` skip · `U` undo); rating unlocks only after reveal, so
   retrieval is enforced. Cards rated 1–2 come back later in the same session
   (relearning); new cards are capped per day (default 15, a setting). The
   session summary shows a rating histogram, toughest objectives, and tomorrow's
   load. Recall cards only — MCQs deliberately never enter this queue.
5. **Drill** (`/drill`) — untimed MCQ practice by domain/objective with
   immediate, per-option rationale feedback; misses can be turned into recall
   cards (error-log workflow) that enter the spaced queue.
6. **Exams** (`/exams`) — timed, weight-proportional mock exams (predict your
   score first — calibration training), a question navigator with flagging,
   per-domain score reports with full rationale review, and a readiness estimate
   (median of your last two mocks ± noise band). Exam answers never touch the
   review schedule.
7. **Labs** (`/labs`) — **lab templates**: reusable guided exercises tied to
   objectives (goal, steps, success criteria, reflection questions). Filter by
   objective and **start a run**.
8. **Runs** (`/runs`) — your actual attempts: write a hypothesis *before* you
   start, record commands/results, explain *why*, rate confidence after, and
   **spin recall questions out of your mistakes**.

The loop: dashboard → pick a weak objective (ranked by real recall accuracy ×
exam weight) → learn via labs and recall review → drill MCQs as mastery grows →
turn every miss into a recall card → when the readiness signal turns on, take
timed mocks and schedule the real exam.

## Data model

Single SQLite file, ISO-8601 text dates, enums as `CHECK` constraints, no JSON
blobs in the MVP.

| Table              | Purpose                                                        |
| ------------------ | ------------------------------------------------------------- |
| `objectives`       | Blueprint tracker (confidence, status, evidence, review dates) |
| `recall_questions` | Question bank (recall + MCQ) + denormalized SRS cache          |
| `question_choices` | MCQ options with per-option rationales                         |
| `answer_attempts`  | Immutable attempt history (review / drill / exam sources)      |
| `exam_sessions`, `exam_items` | Timed mock exams and their graded items             |
| `domains`          | Official cert domains + exam weights                           |
| `app_settings`     | Key-value settings (exam date, new-cards/day)                  |
| `lab_templates`    | Reusable guided exercises                                      |
| `lab_runs`         | My attempts at labs (status, hypothesis → result → why)        |
| `tags`, `template_tags` | Normalized tag dictionary + junction                     |

Foreign keys are deliberate: attempts `CASCADE` from their question; objective and
template links use `SET NULL` so deleting one never destroys your history.

## Seed data

`db/seed/nca-genl.json` ships **25 objectives, 139 recall questions, 175 MCQ items
(20% choose-two, all with per-option rationales — enough for three non-overlapping
50-question mock forms), and 18 lab templates** across the five official NCA-GENL domains and their exam weights. The
questions span multiple styles (recall, compare, when-to-use, scenario,
troubleshooting, best-choice) and were drafted from research into the exam's
question patterns, then adversarially reviewed for correctness.

| Domain                                 | Weight |
| -------------------------------------- | ------ |
| Core Machine Learning and AI Knowledge | 30%    |
| Software Development                   | 24%    |
| Experimentation                        | 22%    |
| Data Analysis and Visualization        | 14%    |
| Trustworthy AI                         | 10%    |

Domains and weights are from NVIDIA's
[official certification page](https://www.nvidia.com/en-us/learn/certification/generative-ai-llm-associate/).
The individual objective/question wordings are **representative study targets, not
verbatim official sub-objectives** — edit them freely. Re-seeding never duplicates
rows.

## Data export

The single SQLite file *is* your data:

```bash
sqlite3 db/data/study.db .dump > backup.sql
sqlite3 db/data/study.db ".mode csv" ".output objectives.csv" "SELECT * FROM objectives;"
```

Every column is explicit and dates are ISO-8601 text, so rows map 1:1 to CSV/pandas.

## Testing

```bash
npm test
```

Covers the spaced-repetition scheduler, every repository (CRUD, constraints,
cascades, tag dedup, dashboard aggregation), and a supertest route smoke test that
exercises the real Express wiring against an in-memory DB.

## Project structure

```
LLMStudy/
├── db/
│   ├── schema.sql              # all tables (idempotent, applied on boot)
│   ├── seed/nca-genl.json      # starter content — EDITABLE placeholder
│   └── data/                   # study.db lives here (gitignored)
├── packages/shared/src/types.ts  # domain types shared by API + web
└── apps/
    ├── server/src/
    │   ├── db.ts               # opens SQLite, applies schema
    │   ├── seed.ts             # loads seed JSON
    │   ├── sr.ts               # spaced-repetition scheduler (pure, tested)
    │   ├── *.repo.ts           # objectives / questions / reviews / lab-* / dashboard
    │   ├── routes/             # one router per resource
    │   ├── app.ts              # buildable Express app (createApp)
    │   ├── index.ts            # bootstrap: seed-if-empty + listen
    │   └── bin/{seed,reset}.ts # CLI entrypoints
    └── web/src/
        ├── api/client.ts       # typed fetch wrapper
        ├── components/         # ObjectivePicker (reused across pages)
        └── pages/              # Dashboard, Objectives, Questions, Review, LabTemplates, LabRuns
```

## Roadmap (designed-for, not yet built)

The schema and the `/api` seam are set up so these can be added without a rewrite:

- **RAG study assistant** — strict, cited answers over approved material + your notes.
- **LLM answer grading** — compare a recall answer to a rubric for feedback.
- **Inference benchmark logger** — track local vLLM runs (model, context length,
  latency, tokens/sec, VRAM, failure modes).
- **Troubleshooting scenario simulator** — diagnose latency, context, RAG
  hallucination, data-leakage, and deployment problems.

## Definition of Done — met

1. ✅ Start the app locally
2. ✅ View seeded certification objectives
3. ✅ Add/edit objectives
4. ✅ Add recall questions
5. ✅ Answer and self-score recall questions
6. ✅ See a due review queue
7. ✅ Add lab entries (templates + runs)
8. ✅ Connect labs and questions back to objectives
9. ✅ See a dashboard of weak areas and review progress
10. ✅ Read setup instructions in this README
