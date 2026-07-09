## KEY FINDINGS
- The scheduler is completely memoryless: next interval = today + fixed days from the latest rating only (sr.ts:12-26, reviews.repo.ts:55), so intervals never grow past a hard 14-day ceiling — a mastered 100-question bank converges to ~7 reviews/day forever with no ease factor, no stability model, and no credit for overdue-but-remembered cards.
- Lapses 'reset' trivially (rating 1 -> due tomorrow) but there is no relearning step, no same-session re-test of failed cards (the queue is a one-shot snapshot in Review.tsx), no ease penalty, and no leech detection — a card failed 10 times schedules identically to one failed once.
- Weak-area ranking (dashboard.repo.ts scoreWeakness, lines 171-224) never reads answer_attempts: it is driven by self-reported confidence, status, and coverage gaps (no questions/labs/evidence) plus a flat +1 for any due count — actual review accuracy, per-objective average rating, recency, and exam domain weight (display-only in Dashboard.tsx:13-19) are all ignored.
- Overconfidence is structurally invisible: the app stores objective confidence (1-5), per-attempt rating/self_score (identical values by design, reviews.repo.ts:38-41), and lab confidence_after, but no query ever compares confidence against attempt ratings — an objective rated confidence 4 whose reviews keep coming back 1-2 gains at most +1 weakness and never surfaces on 'Work on next'.
- No new-cards/day limit: all 100 seeded questions have next_review_date NULL (seed.ts:102-107) and the due query treats NULL as due, so day one presents the entire bank; new cards are also served in id order grouped by objective (blocked, not interleaved) with no fuzz, so identically-rated cards form recurring due-date spikes.
- The 1-5 rating scale is well-surfaced in the UI (labels Forgot/Poor/Okay/Good/Easy plus exact next-review hints, types.ts:129-135, Review.tsx:150-166) but lacks behavioral anchors between Poor and Okay, doubles as both answer-quality score and scheduling signal, and showing the interval on each button invites grading-to-schedule bias.
- Missing standard SRS instrumentation despite the data supporting it: no retention rate (only a global avg of the last 20 ratings, dashboard.repo.ts:78-82), no due-date forecast, no streaks (schema.sql:66-67 explicitly promises streaks are 'queryable' from answer_attempts), no undo for a misclicked rating, no suspend/bury.
- The design is deliberately swap-friendly: sr.ts is pure and side-effect-free, answer_attempts is an immutable full history, and rating/self_score are separate columns — so retrofitting SM-2/FSRS, calibration views, and forecasts requires no schema change.

---

# Learning-Mechanics Audit: LLMStudy vs Spaced-Repetition Best Practice

Scope: `apps/server/src/sr.ts`, `sr.test.ts`, `reviews.repo.ts`, `questions.repo.ts`, `dashboard.repo.ts`, `objectives.repo.ts`, `routes/reviews.ts`, `db/schema.sql`, `apps/server/src/seed.ts`, `apps/web/src/pages/Review.tsx`, `Dashboard.tsx`, `packages/shared/src/types.ts`.

---

## 1. The scheduler: fixed intervals, memoryless, 14-day ceiling

### How it actually works

The entire algorithm is a static lookup table in `c:/Code/LLM/LLMStudy/apps/server/src/sr.ts:12-18`:

```ts
export const RATING_INTERVAL_DAYS: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 7, 5: 14,
};
```

`recordAttempt` in `c:/Code/LLM/LLMStudy/apps/server/src/reviews.repo.ts:55` computes:

```ts
const nextReview = nextReviewDate(today, input.rating); // today + fixed days
```

It reads **nothing** about the card's past: no prior interval, no repetition count, no ease factor, no lapse count, no elapsed-vs-scheduled delta. `answer_attempts` history exists (immutable, `schema.sql:72-83`) but the scheduler never consults it. Due-ness is `next_review_date IS NULL OR next_review_date <= today` both in SQL (`reviews.repo.ts:10-16` `DUE_SELECT`) and in the pure helper `isDue` (`sr.ts:65-67`) — the two are consistent (NULL = never attempted = due; date arithmetic is DST-safe UTC calendar math, `sr.ts:49-54`, well covered by `sr.test.ts`).

### What is lost vs SM-2 / FSRS

- **No ease growth / no long-term retention curve.** In SM-2, interval(n) = interval(n-1) x EF (EF starting 2.5, modulated by grades); FSRS models per-card stability and difficulty against a target retention. Here, the *n-th* consecutive "Easy" produces exactly the same 14-day interval as the first. Intervals **do not keep growing — they cap at 14 days permanently** (`RATING_INTERVAL_DAYS[5] = 14`). For the seeded 100-question bank, steady state after mastery is ~100/14 ≈ **7 reviews/day forever**, and total workload never declines over a multi-month prep. In a real SRS, mastered cards fall to 1-6 month intervals and the daily load decays toward new material.
- **Lapse handling is only half right.** Rating 1 ("Forgot") does reset the card to +1 day — correct direction, and because the algorithm is memoryless there is technically nothing else to reset. But best practice adds: (a) *relearning steps* — a failed card should reappear within minutes, same session, before graduating back to days (Anki's 1m/10m steps). Here a card rated 1 is gone until tomorrow; the Review page queue is a one-shot snapshot (`listDue()` fetched once in `Review.tsx:12-25`), so a failed card never recirculates in-session. (b) *Ease penalty / lapse memory* — a card failed 10 times schedules identically to one failed once; there is no leech detection or flagging. (c) The `attempted_date`-only model also means a same-day second review just overwrites the cache row (`reviews.repo.ts:73-85`) — harmless, but confirms there is no intra-day scheduling at all.
- **Overdue reviews earn no credit.** If a card scheduled +14d is actually reviewed 40 days later and still rated 5, the next interval is again 14d. SM-2 variants and FSRS both use actual elapsed time — successfully recalling after a long overdue gap is the strongest possible evidence the interval can grow.
- **Rating alone drives everything.** `rating` and `self_score` are stored as the same value in both the attempt and the question cache (`reviews.repo.ts:36-41, 60-71`); the comment explicitly says they are kept as separate columns "so the scheduler can diverge from self-assessment later" — a good hook, currently unused.

**Mitigating design credit:** `sr.ts` is deliberately pure ("kept pure... so it is easy to... later swap for a smarter algorithm", `sr.ts:1-3`), the attempt log is a real immutable table, and the question row is only a denormalized cache (`schema.sql:63-70`). Swapping in SM-2 (needs per-card `ease`, `interval`, `reps`, `lapses` — four columns or derivable from `answer_attempts`) or FSRS (stability/difficulty, fully derivable from the history via replay) requires **no schema break**. This is the single best architectural decision in the module.

## 2. The 1-5 rating scale

Defined in `c:/Code/LLM/LLMStudy/packages/shared/src/types.ts:129-135`:

```ts
{ value: 1, label: 'Forgot', hint: 'tomorrow', days: 1 },
{ value: 2, label: 'Poor',   hint: 'in 2 days', days: 2 },
{ value: 3, label: 'Okay',   hint: 'in 4 days', days: 4 },
{ value: 4, label: 'Good',   hint: 'in 7 days', days: 7 },
{ value: 5, label: 'Easy',   hint: 'in 14 days', days: 14 },
```

Rendered as buttons showing number + label + scheduling hint (`Review.tsx:150-166`), with a `title` tooltip "Next review {hint}". The server validates 1-5 (throws in `intervalForRating`, `sr.ts:20-26`; 400 via `routes/reviews.ts:32-35`; DB CHECK constraints in `schema.sql:76-77`).

Assessment:

- **Better-defined than most MVPs** — every button carries a semantic label *and* its consequence. The page header also states the contract plainly ("Your rating sets when the question comes back", `Review.tsx:36-39`).
- **Anchors are vague in the middle.** "Poor" vs "Okay" has no behavioral definition (e.g., "recalled less than half" vs "recalled the gist with effort"). FSRS/Anki settled on **4 grades** (Again/Hard/Good/Easy) partly because users cannot reliably discriminate 5 levels; the 2/3 boundary here will be noisy, and that noise directly sets intervals.
- **Grade-to-schedule bias.** Displaying "in 14 days" on the button lets the user pick the schedule rather than report recall quality — a known failure mode; a real SRS treats grades as evidence, and showing intervals is optional/configurable.
- The single rating conflates two constructs the schema deliberately separates: answer quality (`self_score`) and scheduling signal (`rating`). Fine for MVP; the roadmap's LLM answer grading is the natural way to split them.

## 3. Weak-area ranking: coverage heuristic, not performance

`scoreWeakness` in `c:/Code/LLM/LLMStudy/apps/server/src/dashboard.repo.ts:171-224` is an additive heuristic per objective:

| Signal | Points |
|---|---|
| confidence NULL | +2.5 ("confidence not set") |
| confidence set | +(5 − confidence): 1→4, 2→3, 3→2, 4→1, 5→0 |
| status not_started / learning | +2 / +1 |
| zero questions | +1; **else** any due questions | +1 (flat, whether 1 or 20 due) |
| zero lab runs | +1 |
| no evidence text | +0.5 |

Top 8 with score > 0 are shown with human-readable reason chips (`Dashboard.tsx:144-182`). The per-objective aggregates come from correlated subqueries in `OBJECTIVE_AGG` (`dashboard.repo.ts:23-31`) whose due predicate matches the review queue exactly — internally consistent.

**Is it sound?** As a *coverage* tracker, yes: deterministic, explainable, bounded (~max 8.5), and it correctly pushes untouched objectives up and fully-worked, confident ones to zero. But measured against the question asked — *does it use attempt accuracy, recency, objective confidence?* —

- **Objective confidence: yes** — it is the dominant term (up to 4 of ~8.5 points).
- **Attempt accuracy: no.** `answer_attempts` is never joined. An objective whose reviews keep coming back rated 1-2 gains at most the flat +1 "questions due" bump. The only rating aggregate anywhere on the dashboard is a *global* average of the last 20 attempts across all objectives (`dashboard.repo.ts:78-82`, surfaced as `avgRecentRating`), not per objective or per domain.
- **Recency: no.** An objective last reviewed 3 months ago scores the same as one reviewed yesterday, given equal due counts. `last_attempted_date` exists on every question and is unused here.
- **Exam weight: no.** The official domain weights live only as a display constant in `Dashboard.tsx:13-19` ("Not stored in the DB — display-only reference"), so a weak objective in the 30% Core ML domain ranks no higher than one in the 10% Trustworthy AI domain.

Net effect: **the ranking measures what the user has *done* and *claims*, not what the user can *recall*.** Because self-reported confidence dominates, an overconfident user actively hides their weakest areas from the "Work on next" list — see section 5.

Minor nits: due pressure is a flat +1 regardless of volume (an objective with 20 overdue cards should outrank one with 1); "confidence not set" (+2.5) and "not started" (+2) nearly always co-occur, front-loading new objectives to 4.5+ — defensible, but it means the top-8 is mostly "untouched stuff" until late in prep.

## 4. Missing vs a real SRS

- **New-cards/day limit: none.** Seeding inserts all 100 questions with `next_review_date` NULL (`seed.ts:102-107`), the due query treats NULL as due, so **day one presents the entire 100-question bank**. Anki-style defaults (10-20 new/day) exist precisely to prevent this first-day wall and the review avalanche it schedules 1-14 days later.
- **Ordering / interleaving: partially right, mostly missing.** `DUE_SELECT`'s `ORDER BY (q.next_review_date IS NULL), q.next_review_date, q.id` (`reviews.repo.ts:15`) correctly serves scheduled/overdue reviews *before* new cards (false sorts first). But within each group, order is `next_review_date, id` — and seeded question ids cluster by objective, so new cards arrive in **objective-blocked runs**, the opposite of the interleaving that the retrieval-practice literature (and every mature SRS) favors. No shuffle, no cross-domain mixing, no domain-weight-aware prioritization.
- **Fuzz: none.** Every card rated the same on the same day lands on the identical future date, producing self-reinforcing due-date spikes ("ease waves"). Anki applies a small random fuzz to intervals to spread load.
- **Retention stats: none.** No % of successful recalls (rating >= 3), no per-domain/per-objective true retention, no again-rate. Only `avgRecentRating` (last 20 attempts, global) and attempt counts (`dashboard.repo.ts:69-82`). The immutable `answer_attempts` table makes all of these one query away.
- **Forecast: none.** `next_review_date` on every card would trivially yield a due-cards-per-day histogram for the next N days (critical for exam-date pacing: "will I clear the backlog before test day?"). Nothing computes it.
- **Streaks: none**, despite `schema.sql:66-67` explicitly justifying the attempts table "so accuracy/streaks are queryable". Dashboard shows `last7Days` and `totalAttempts` only.
- **Other standard machinery absent:** no undo/edit of a misgraded attempt (attempts are immutable and no delete route exists in `routes/reviews.ts`); no suspend/bury; no leech tagging; no session cap; "Skip for now" (`Review.tsx:79, 167-169`) only advances the local index — the card stays due (fine) but nothing re-offers it later in the same session. Cosmetic: the progress bar uses `index/total` so skipped cards count as progress.

## 5. Calibration: data collected, never confronted

Signals the app already stores:

- Objective `confidence` 1-5 (`schema.sql:22`, writable via `objectives.repo.ts` WRITABLE list).
- Per-attempt `rating` and `self_score` 1-5 — currently identical by construction (`reviews.repo.ts:60-71`).
- Lab `confidence_after` 1-5 (`schema.sql:142`).
- Question `difficulty` 1-5 (seeded, `seed.ts:104`) — never used by scheduler or dashboard.

What surfaces overconfidence: **nothing.** The dashboard juxtaposes `avgConfidence` per domain (`dashboard.repo.ts:120-137`) and a global `avgRecentRating`, but never joins confidence to performance at any granularity. Concretely missing:

- Per-objective "confidence vs avg attempt rating" delta (e.g., flag objectives with confidence >= 4 but mean rating <= 2.5 over the last N attempts) — the canonical overconfidence detector, and a natural extra term in `scoreWeakness`.
- Lab `confidence_after` vs subsequent review performance on the same objective — the lab flow ("hypothesis before, confidence after") is textbook calibration design, but `confidence_after` appears nowhere on the dashboard (lab stats are pure counts, `dashboard.repo.ts:84-98`).
- Any trend view: confidence updated over time vs rolling accuracy.

A caveat worth stating: because grading is self-report, "actual accuracy" is itself a self-assessment until the roadmap's LLM answer grading lands. But *relative* calibration (stated objective-level confidence vs in-the-moment recall ratings) is computable today and would catch the most damaging failure mode this system currently permits: since section 3's ranking is confidence-dominated, **overconfidence simultaneously inflates dashboard readiness and suppresses the objective from the 'Work on next' list** — the two mechanisms compound rather than cross-check.

---

## Summary of gaps, ranked by learning impact

1. **14-day interval ceiling / no ease growth** — permanent review load, no long-term retention scheduling (sr.ts:12-18, reviews.repo.ts:55).
2. **No confidence-vs-accuracy check anywhere**, while confidence dominates the weak-area ranking — overconfidence is doubly hidden (dashboard.repo.ts:171-224).
3. **No new-cards/day cap** — 100-card day one, avalanche after (seed.ts:102-107, reviews.repo.ts:10-16).
4. **No in-session relearning of failed cards** — rating 1 disappears until tomorrow (Review.tsx:12-25).
5. **Weak-area ranking ignores answer_attempts entirely** — accuracy, recency, and exam weight all unused.
6. **Objective-blocked new-card ordering, no interleaving, no fuzz.**
7. **No retention rate, forecast, streaks, or undo** — all computable from existing tables with no schema change.
8. Rating scale: 5 points with fuzzy 2/3 anchors; consider 4 grades (Again/Hard/Good/Easy) with behavioral anchors; interval hints on buttons invite grading-to-schedule.

The architecture (pure `sr.ts`, immutable `answer_attempts`, separate `rating`/`self_score` columns, cache-only question SRS state) was explicitly built for these upgrades — SM-2 or FSRS-by-replay, calibration views, forecasts, and caps are all additive changes.