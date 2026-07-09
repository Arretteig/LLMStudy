## KEY FINDINGS
- Recommend a growing ladder ('SM-2 lite' with lapse reset and an exam-date-aware interval cap) over full FSRS — FSRS's parameter fitting is meaningless for one user with weeks of data, while the ladder upgrade fixes the real gaps (no growth, no lapse handling) with zero dependencies.
- Milestone 1 must fix the daily review loop first: the confirmed session-bricking bug in Review.tsx (submitting never resets on error), keyboard-first grading, rating gated on reveal, in-session relearning of failed cards, and a new-cards/day cap to kill the 100-card day-one wall.
- A PRAGMA user_version migration runner and a domains table are the only two structural bottlenecks — both small, both needed before scheduler state columns, MCQ, item-level confidence, and weighted mock-exam assembly.
- Calibration is the highest-leverage unshipped insight: item-level confidence capture plus a confident-wrong danger zone directly counters the current design flaw where self-reported confidence dominates weak-area ranking, letting overconfidence hide weaknesses.
- MCQ + mock exam mode lands deliberately last (Milestone 4): recall-first builds durable memory and MCQ format fluency matters most in the final two weeks, but exam-source attempts must bypass the SRS cache mirror — decide that before building, not after.
- Flagged as over-engineering for this single-user local app: full FSRS, migrating to a 4-grade scale, interval fuzz, a zod validation layer, LLM answer grading, RAG assistant, notification infrastructure, and a React Query-style refactor.
- Backend fixes worth bundling into Milestone 1: seed NULL-objective duplication (B1), update-path validation asymmetry (B3), date-format validation (B4), the eager DB_PATH export test trap (B5), and a JSON error middleware (B6); skip B7/B8/B12 as harmless at this scale.

---

# LLMStudy — Prioritized Feature Plan (Feature Gap Analysis)

Synthesized from the backend audit, frontend/UX audit, learning-mechanics audit, and learning-science research. Scope is software changes only; content expansion is handled separately. Guiding constraint: **single user, local-first, fixed exam date** — every recommendation is filtered through "does this help one person pass NCA-GENL, and does it keep the codebase simple?"

Effort key: **S** = hours, **M** = 1–2 days, **L** = multi-day.

---

## 0. Executive summary

The app's architecture (pure `sr.ts`, immutable `answer_attempts`, whitelist repos, injectable DB) was explicitly built for these upgrades — nearly everything below is additive. The plan is four milestones:

1. **M1 — Make the daily loop survivable** (~3–4 days): fix the one session-bricking bug, keyboard-first grading, retrieval gating, in-session relearning, new-card cap + interleaving, undo, plus the small backend foundations (migration runner, error middleware, validation fixes) that everything later depends on.
2. **M2 — A scheduler that scales + habit loop** (~4 days): growing-interval scheduler with exam-date cap, exam-date setting + due forecast, minimum-dose streak, scoped review sessions.
3. **M3 — Calibration and honest weak-area detection** (~4–5 days): item-level confidence, confident-wrong "danger zone," weak-area ranking that finally uses attempt accuracy/recency/exam weight, question browser upgrades.
4. **M4 — Exam format: MCQ, mock exams, error log** (~5–7 days): MCQ schema with per-distractor rationales, mock exam mode with domain-weighted assembly, miss → error-log → recall-card pipeline, readiness estimate.

Headline decision: **do not adopt full FSRS**. Upgrade the fixed ladder to a response-contingent growing ladder ("SM-2 lite") with an exam-date-aware interval cap (rationale in §1).

---

## 1. Key decision: scheduler upgrade

**Options considered:** (a) keep the fixed 1/2/4/7/14d ladder; (b) SM-2; (c) FSRS via `ts-fsrs`.

**Recommendation: (b-lite) — a growing ladder, i.e. SM-2's core idea without its ceremony.**

- **Keep the ladder as the floor, multiply on success.** `next_interval = max(ladder[rating], round(prev_interval × mult[rating]))` with roughly mult = {1: reset to 1d, 2: reset to 2d, 3: ×1.2, 4: ×2.0, 5: ×2.5}. Rating 1–2 also increments a `lapses` counter and triggers in-session relearning (F6).
- **Exam-date-aware cap:** intervals never exceed ~15% of days-remaining-to-exam (learning-science §2, Cepeda et al.: optimal gap ≈ 10–20% of retention interval), so every card gets at least one touch near exam day. Falls back to a 60-day absolute cap if no exam date is set.
- **State:** add `interval_days` and `lapses` to the `recall_questions` cache (two ALTERs — hence the migration runner is a hard dependency). `sr.ts` stays pure; the function signature grows to accept prior state.

**Why not full FSRS:** FSRS's measured advantage (20–30% fewer reviews at equal retention) comes from fitting 17+ parameters to a user's review history — meaningless for one user with weeks of data and a ~100–300 card bank; you'd run it on population defaults anyway. It also costs a dependency, per-card stability/difficulty state, and a forced remapping of the existing 1–5 scale onto 4 grades. For a 1–3 month fixed-horizon cert, the delta is minutes per day. The learning-mechanics audit itself concedes a 14-day cap is "squarely in range" for this horizon (Cepeda) — the real deficiencies are **no growth, no lapse handling, no in-session relearning**, all of which the growing ladder fixes. If the app outlives the exam, `sr.ts`'s purity makes an FSRS swap a contained change later.

**Why not keep the fixed ladder:** the 14-day ceiling means mastered cards recur ~2×/month forever (~7 reviews/day floor at 100 cards, growing linearly with the bank — mechanics audit gap #1). The tool would get worse the more faithfully it's used, which is fatal for a daily-habit product.

**Rating scale:** keep the 1–5 buttons (see §5 pushback), but rewrite the middle anchors with behavioral definitions ("2 — Poor: recalled less than half"; "3 — Okay: got the gist with effort") and demote the interval hint to the tooltip only, since showing "in 14 days" on the button invites grading-to-schedule.

---

## 2. Prioritized feature list, by milestone

### Milestone 1 — Make the daily loop survivable

The Review page is the surface a user must touch every day and is currently the least developed. Each item below is independently shippable; together they turn a ~250-click, brickable, retrieval-optional session into a keystroke-driven one.

| # | Feature | What it is | Justification | Effort | Deps |
|---|---------|-----------|---------------|--------|------|
| F1 | **Fix review submit-error brick** | `onGrade` in `Review.tsx` swallows errors, so `submitting` stays `true` forever and every button disables; rethrow (or return success) and `finally { setSubmitting(false) }` in `ReviewCard.grade` | Frontend audit §1 — confirmed bug (verified at `Review.tsx:66–78, 102–106`); one flaky request kills a session | S | none |
| F2 | **Migration runner** | `PRAGMA user_version` + ordered migration array applied in `applySchema` (`db.ts:26–28`) | Backend audit §1/§3 — blocks every ALTER (scheduler state, MCQ, item confidence, exam-source attempts); without it each schema change destroys study history via `db:reset` | S | none |
| F3 | **Backend hygiene bundle** | Express JSON error middleware + typed domain errors (replaces per-router `messageOf` and substring 404 matching); reject empty/non-string `title`/`question_text` on update paths (B3); `^\d{4}-\d{2}-\d{2}` check on writable date columns (B4); partial unique index for NULL-objective seed dedupe (B1); delete the eager `DB_PATH` export (B5) | Backend audit B1, B3–B6 — the two armed latent bugs plus the JSON-error contract the SPA needs before more features consume the API | M | none |
| F4 | **Keyboard-first review** | Space/Enter = reveal, 1–5 = rate, S = skip, U = undo (F8); autofocus the answer textarea on card mount | Frontend audit rank #1 — turns 2–3 clicks + mouse travel per card into ~2 keystrokes; the single biggest habit lever | S | F1 |
| F5 | **Gate rating on reveal** | Render/enable rating buttons only after `revealed` (or when no expected answer exists) | Frontend audit rank #2 — structurally enforces retrieval, the scientific basis of the tool (testing effect); ~3-line change | S | none |
| F6 | **In-session relearning + skip requeue** | Rating 1–2 pushes the card to the back of the session queue for a same-session re-attempt (second attempt sets the schedule); Skip also requeues instead of discarding | Successive relearning (Rawson & Dunlosky, effect sizes 1.5–4.2); mechanics audit gap #4 — a forgotten card currently vanishes until tomorrow, the worst moment to drop it | S | F1 |
| F7 | **New-card cap + interleaving** | Server-side: limit never-attempted cards in `listDue` to N/day (default 15, setting later); shuffle new cards so ≤2 consecutive share a domain; keep overdue-first ordering | Mechanics audit gap #3 (100-card day-one wall is the likeliest week-one quit trigger) and gap #6; Brunmair & Richter g = 0.42 for interleaving via discriminative contrast; seeded IDs currently arrive objective-blocked | S–M | none |
| F8 | **Undo last rating** | Keep last submission in page state; `DELETE /api/reviews/attempts/:id` (last attempt only) recomputes the question cache by replaying remaining history; re-insert card at front | Frontend audit rank #4 — 1–5 sit adjacent and a misclick reschedules +1d vs +14d permanently; keyboard grading (F4) amplifies misclick risk | M | F2 (replay logic), F4 |
| F9 | **Session summary v2** | `DoneState` gains rating histogram, objectives with most "Forgot"s (linked), tomorrow's due count | Frontend audit rank #11 — converts effort into insight and cues the next session | S | none |
| F10 | **LabRuns draft protection** | Dirty-state confirm on collapse, or debounced autosave of the run draft | Frontend audit — collapsing the editor silently discards the app's longest-form reflective writing; trust-destroying data loss | S | none |

**Milestone exit state:** daily review is fast, safe, retrieval-enforced, and bounded; backend is migration-ready with JSON errors. Fully working app, immediately more valuable for studying.

### Milestone 2 — A scheduler that scales + habit loop

| # | Feature | What it is | Justification | Effort | Deps |
|---|---------|-----------|---------------|--------|------|
| F11 | **Growing-ladder scheduler** | As specified in §1: multiplier on success, lapse reset + counter, exam-date cap; `interval_days`/`lapses` columns on the question cache; `sr.ts` stays pure | Mechanics audit gap #1 (14-day ceiling → permanent load); learning-science §2 recommendation is exactly this shape | M | F2, F12 (for exam-date cap) |
| F12 | **Exam date + settings + due forecast** | `app_settings` key-value table (new table, no migration needed); exam-date picker; dashboard due-cards-per-day histogram for the next 14 days with days-to-exam | Mechanics audit gap #7 — forecast is one query over existing `next_review_date`; critical for pacing ("will I clear the backlog before test day?") | S–M | F2 for later settings, none for table |
| F13 | **Minimum-dose streak + repair** | Day counts if due queue cleared **or** 5 reviews (~3 min); one auto repair token per 7 active days (bank max 2); Dashboard tile with streak + "Due today: N / done: M"; computed from `answer_attempts` dates, no new writes | Learning-science §7 — Lally et al. (missing one day doesn't derail habits; never-miss framing backfires), streak-freeze apps see ~48% longer streaks; frontend audit rank #6 | M | none |
| F14 | **Scoped review sessions + deep links** | `/review?objective=&domain=` filters the queue; Dashboard `WeakRow` "Review" button and readiness-table Due column deep-link to the filtered queue; "Find a lab" passes the objective to the existing LabTemplates filter | Frontend audit rank #8 — the CTAs currently lose context; enables "drill the 30% Core ML domain before exam day" | S–M | none |
| F15 | **Retention stats per objective/domain** | Success rate (rating ≥ 3), again-rate, last-attempt recency from `answer_attempts`; shown on dashboard readiness table; also resolves the B2 timezone convention (standardize on local time) before charting | Mechanics audit gap #7 — "all one query away" from the immutable log; prerequisite for honest weak-area ranking; backend audit B2 must be decided before analytics read timestamps | M | F3 |

**Milestone exit state:** workload decays as material is mastered, is visibly paced against the exam date, and a streak makes the daily dose feel bounded.

### Milestone 3 — Calibration and honest weak-area detection

| # | Feature | What it is | Justification | Effort | Deps |
|---|---------|-----------|---------------|--------|------|
| F16 | **Domains table** | `domains (cert_path, name, weight)` seeded from the current `Dashboard.tsx` constant; dashboard reads weights from the API; objectives' freeform `domain` validated against it | Backend audit §3 decision #1 — weights must leave the web client before weighted exam assembly (F23) or weight-aware ranking (F17) can exist server-side | S | none |
| F17 | **Weak-area ranking v2** | Add to `scoreWeakness`: accuracy term (mean recent rating per objective, inverted), recency decay (days since last attempt), exam-weight multiplier, and scale the due bump by due count | Mechanics audit §3/gap #5 — current ranking measures what the user *did* and *claims*, not what they can *recall*; overconfidence currently hides the weakest areas from "Work on next" | M | F15, F16 |
| F18 | **Item-level confidence capture** | One-tap sure/probably/guessing before reveal (keyboard: J/K/L or 7/8/9); stored as `confidence` on `answer_attempts` (ALTER) | Learning-science §4 — prediction-then-feedback exploits hypercorrection and generates calibration data; the schema's `rating`/`self_score` split anticipated exactly this divergence | M | F2, F5 (reveal gate defines the "before" moment) |
| F19 | **Calibration quadrant + danger zone** | Dashboard 2×2 (confident/unconfident × correct/wrong); confident-wrong items highlighted and rescheduled at 1–2d **and** ~7d (hypercorrected items relapse after ~a week — Butler, Fazio & Marsh 2011); per-objective confidence-vs-accuracy delta flag (confidence ≥ 4, mean rating ≤ 2.5) | Mechanics audit gap #2 — the most damaging permitted failure mode: overconfidence inflates readiness *and* suppresses the objective from the work list, compounding | M | F17, F18 |
| F20 | **Question browser upgrades** | Search box, filters (objective/difficulty/due-status), collapsible groups, per-card stats (next due, last rating, attempt count — finally using the dead `getHistory`); delete the stale "next milestone" copy | Frontend audit rank #9 — 100+ questions in one scroll with zero findability; history endpoint is built but unshipped | M | none |

**Milestone exit state:** the dashboard tells the truth: weak areas are ranked by recall performance weighted by exam impact, and overconfidence is confronted instead of rewarded.

### Milestone 4 — Exam format: MCQ, mock exams, error log

Deliberately last: the evidence (learning-science §1) says recall-first builds the durable memory, and MCQ format fluency matters most in the final ~2 weeks. But since the real NCA-GENL is MCQ, this milestone must exist before exam day.

| # | Feature | What it is | Justification | Effort | Deps |
|---|---------|-----------|---------------|--------|------|
| F21 | **MCQ schema + CRUD** | `question_format` on `recall_questions` (ALTER); new `question_choices` table with `choice_text`, `is_correct`, `position`, and **`rationale` per distractor**; `selected_choice_id` + `source ('review'\|'exam')` + nullable `session_id` on `answer_attempts` (ALTERs); authoring UI on Questions page | Backend audit §3; learning-science §1 (mixed formats strongest, g = 0.70 MCQ) and §6 (per-distractor rationales — elaborated feedback > right/wrong) | M | F2, F3 |
| F22 | **MCQ in the review flow** | Render choices (keyboard 1–4 to select), immediate corrective feedback showing **all four rationales**, correctness maps to a rating for scheduling; optionally unlock 1–2 linked MCQs when a concept's recall card graduates past ~4-day interval | Kang et al. — corrective feedback is what makes MCQ practice safe; Adesope — format mixture beats either alone; transfer-appropriate processing for an MCQ exam | M | F21 |
| F23 | **Mock exam mode** | `exam_sessions` / `exam_items` tables (new, per schema hooks); domain-weighted assembly (30/24/22/14/10) from the MCQ pool; session timer (~60 q / 1 hr); flag-for-review; score screen by domain; exam answers write `answer_attempts` with `source='exam'` and **skip the SRS cache mirror** so a 60-question blitz doesn't reschedule every card | Backend audit §3 decision #2 (decide before building — retrofitting is painful); learning-science §5 (2–3 well-timed full-lengths; suggest T-21/T-10/T-4 in UI copy, don't enforce) | L | F16, F21 |
| F24 | **Error-log workflow** | Every miss or low-confidence-correct ("hidden gap") from mocks or MCQ practice prompts: error classification (knowledge gap / misread stem / fell for distractor) + one-sentence "why is the right answer right" → auto-spawns a recall card into the spaced queue (reuses the lab-runs spin-off pattern) | Learning-science §5 (UWorld protocol — deliberate review predicts scores better than volume) and §6 (self-explanation gate); hypercorrection needs the re-test the queue provides | M | F22 (works with MCQ practice even before F23) |
| F25 | **Readiness estimate** | Median of last two mock scores with an explicit ±5–8% band vs pass threshold — never a single-point prediction; pre-mock "predict your score" prompt, predicted-vs-actual chart over time | Learning-science §5 (median-of-recent beats best-attempt; irreducible day-of noise) and §4 (score prediction trains calibration itself) | S | F23, F18 |

**Milestone exit state:** the full pipeline exists: recall builds durability → MCQ builds discrimination and format fluency → mocks measure readiness → misses feed back into the recall queue.

### Continuous / opportunistic (no dedicated milestone)

| Feature | What / when | Effort |
|---|---|---|
| Shared frontend plumbing (`useApi` hook, `Stat`, `ErrorBanner`, `groupByDomain`, `NumSelect`) | Extract as pages are touched by the features above, not as a big-bang refactor | S each |
| Baseline a11y (`role="alert"` on banners, keyboardable LabRuns expander with `aria-expanded`, progressbar semantics) | Bundle with F4/F10 since those files are open anyway | S |
| Tests: seed-twice idempotency (catches B1), due-queue ordering pin, HTTP contract tests for new endpoints, scheduler-v2 unit tests | Add alongside each feature; the seed-idempotency test lands with F3 | S each |
| 404 route in `App.tsx`, dead CSS cleanup, stale copy removal | Bundle with F20 | S |

---

## 3. Dependency spine

```
F2 migration runner ──► F8 undo (replay) ─┐
        │                                 │
        ├──► F11 scheduler v2 ◄── F12 exam date
        ├──► F18 item confidence ──► F19 calibration quadrant
        └──► F21 MCQ schema ──► F22 MCQ review ──► F24 error log
                                      │
F16 domains table ────────────────► F23 mock exams ──► F25 readiness
F15 retention stats ──► F17 ranking v2 ──► F19
F3 hygiene (error middleware) ──► every new endpoint
```

Only two true bottlenecks: the **migration runner (F2)** and the **domains table (F16)** — both small, both in the first half of the plan.

---

## 4. Bug fixes worth doing first (from the backend audit)

Do in M1 (bundled as F1/F3): the review submit brick (frontend, confirmed), B1 seed NULL-objective duplication (armed trap), B3 update-path validation asymmetry, B4 date-format validation, B5 eager `DB_PATH` export (test-safety trap), B6 JSON error middleware. **Defer or skip:** B7/B8 param edge cases (harmless for one user; the error middleware makes them consistent anyway), B9 missing objective DELETE (add a comment, not a route), B10 unlinked-question dashboard blind spot (fix as a by-product of F17), B12 micro-inefficiencies (skip entirely — 25 objectives).

---

## 5. Pushback: where I disagree with the audits / over-engineering flags

1. **Full FSRS (mechanics audit's implied direction, research §2 option).** Rejected for this app — see §1. Parameter fitting is meaningless at n=1 with weeks of data; the growing ladder captures the substance (growth, lapses, exam-date awareness) with zero dependencies.
2. **Switching to 4 grades (Again/Hard/Good/Easy) — mechanics audit gap #8.** Not worth it. It forces remapping the stored 1–5 history, retraining the user's muscle memory, and touching CHECK constraints, for a marginal noise reduction at the 2/3 boundary. Better anchor copy (behavioral definitions) gets most of the benefit for the cost of a string edit. Revisit only if FSRS ever lands.
3. **Interval fuzz (mechanics audit gap #6, second half).** Skip. Due-date spikes matter at Anki scale (thousands of cards); at 100–300 cards the daily variance is a handful of reviews, and the in-session requeue plus cap absorb it. It's 3 lines if ever wanted.
4. **Full zod/valibot validation layer (backend audit).** Over-engineering for a single-user local API. The error middleware plus targeted repo checks (non-empty strings, date regex, enum checks) covers every real failure mode found. A schema library earns its keep when inputs are adversarial; here the only client is the app's own SPA.
5. **LLM answer grading (roadmap).** Defer past the exam. It breaks the local-first property (API key, network, cost), the "rating nullable + finalize step" flow complicates the schema (backend audit §3), and item-level confidence + hypercorrection (F18/F19) delivers the calibration value self-report can't fake — cheaper and offline. The `attempt_gradings` table design is sound; keep it in the drawer.
6. **RAG study assistant (roadmap).** Defer. Highest-effort roadmap item, and its exam ROI is lower than every feature above — the user's bottleneck is retrieval practice and format fluency, not search over notes. Nothing in this plan conflicts with adding it later.
7. **Notification/reminder infrastructure (research §7 implementation intentions).** A local Express+Vite app has no good push channel; don't build one. Keep the implementation-intention prompt as a one-time text field shown on the dashboard ("your cue: after morning coffee") and let the streak tile do the reminding. XP, leagues, badges: correctly rejected by the research report itself.
8. **Full accessibility pass (frontend audit).** Baseline only (alerts, keyboard expanders, focus on reveal — bundled into M1). The sole user is the developer; keyboard *shortcuts* are a study-speed feature and worth full effort, comprehensive ARIA coverage is not, at this stage.
9. **`useApi`/React Query–style refactor (frontend audit rank #12).** Don't do it as a project. Six pages of copy-pasted fetch logic is ugly but cheap; extract the hook opportunistically when a feature touches a page. A cache layer solves a problem (refetch on route switch) that a local SQLite roundtrip doesn't actually have.
10. **Weekly "write 2 exam questions" task (research §6 move 3).** Good pedagogy, but as software it's just a dashboard nudge linking to the existing question-create form with an objective preselected — fold that one-liner into F14's deep-linking rather than building a task system.
11. **Per-question exam timing / `duration_ms` everywhere.** Capture `time_spent_ms` on `exam_items` only (F23) where pacing matters; skip attempt-level duration tracking in the review flow — fluency measurement is a nice-to-have that adds a column and UI noise for data nobody will act on before the exam.

---

## 6. Milestone summary

| Milestone | Theme | Features | Est. effort | Independently valuable because… |
|---|---|---|---|---|
| M1 | Survivable daily loop | F1–F10 | ~3–4 days | Review sessions become fast, safe, retrieval-enforced, and bounded; foundations (migrations, JSON errors) unblock everything else |
| M2 | Scheduler + habit | F11–F15 | ~4 days | Workload decays with mastery, is paced against the exam date, and the streak sustains the habit |
| M3 | Calibration + weak areas | F16–F20 | ~4–5 days | The dashboard ranks by actual recall performance × exam weight; overconfidence is surfaced instead of hidden |
| M4 | Exam format | F21–F25 | ~5–7 days | MCQ fluency, timed mocks with honest readiness bands, and an error log that feeds misses back into the spaced queue |

Each milestone ends with the app fully working; if study time runs short, stopping after any milestone still leaves a strictly better tool than today.
