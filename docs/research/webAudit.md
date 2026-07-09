## KEY FINDINGS
- The daily-driver Review flow is mouse-only (2-3 clicks per card, zero keyboard shortcuts, no autofocus on the answer box) and the app-wide grep confirms not a single keydown handler exists — the single biggest obstacle to daily habit formation given the seed drops 100 due cards on day one with no cap.
- Retrieval is not enforced: the 1-5 rating buttons in Review.tsx (lines 150-170) are visible and enabled before the expected answer is revealed, so users can grade without recalling, corrupting the SRS signal the whole app depends on.
- Confirmed bug: a failed review submit permanently bricks the current card — ReviewCard.grade (Review.tsx 102-106) sets submitting=true and the parent onGrade (66-78) swallows the error, so all rating and skip buttons stay disabled until a full page reload.
- The scheduler has a hard 14-day interval ceiling with no growth on repeated success (REVIEW_RATINGS in shared/types.ts), so every card recurs at least twice a month forever and daily review load grows unboundedly with bank size.
- No undo for ratings, failed/skipped cards are not requeued within the session, and the end-of-session summary shows only reviewed/skipped counts — no rating breakdown, weak-objective callouts, streak, or tomorrow forecast.
- LabRuns.tsx silently discards unsaved run drafts when the row header is clicked closed (RunEditor unmounts with no dirty check or autosave) — a data-loss trap on the page asking for the longest reflective writing.
- The Questions page renders all 100 questions in one scroll with no search, filters, pagination, bulk ops, or per-card review stats; the getHistory API in client.ts line 98 is dead code, so stored user answers and attempt history surface nowhere.
- Dashboard calls-to-action lose context: weak-objective Review buttons link to the unfiltered global queue and 'Find a lab' ignores the objective filter LabTemplates already implements; there is also no streak or daily-goal display despite the habit-formation purpose.
- Accessibility is absent by grep (zero aria-*, role=, tabIndex, onKeyDown in apps/web/src): click-only div error banners, a mouse-only expand header in LabRuns, an unlabeled progress bar, and focus lost when the reveal button unmounts.
- Code quality is otherwise clean but repetitive: the Stat component is declared 4 times, groupByDomain 3 times, the fetch-on-mount loading/error pattern and error banner are copy-pasted on every page, and deleteQuestion duplicates the del helper in client.ts.

---

# LLMStudy Frontend — Deep Read: Judged as a Study Tool

Scope: all of `c:/Code/LLM/LLMStudy/apps/web/src` (`App.tsx`, `main.tsx`, `api/client.ts`, `util.ts`, `styles.css`, `components/ObjectivePicker.tsx`, `pages/{Dashboard,Objectives,Questions,Review,LabTemplates,LabRuns}.tsx`), plus targeted reads of `packages/shared/src/types.ts` and `apps/server/src/reviews.repo.ts` to understand queue ordering and rating semantics.

**Overall verdict:** The information architecture is genuinely good for a study tool — weak-area triage on the Dashboard, objective-linked questions, hypothesis-first lab runs, and the "spin a recall question from a mistake" flow (`LabRuns.tsx` `SpinOffQuestion`, lines 388–465) show real pedagogy. But the Review page — the module a user must touch *every day* — is the least developed surface: mouse-only, retrieval not enforced, one confirmed bricking bug, no undo, no session scoping, and fixed 14-day-max intervals that guarantee unbounded review pileup as the bank grows. As a daily-habit tool it currently fights the user exactly where it needs to be frictionless.

---

## 1. The review-session flow (`pages/Review.tsx`)

### Cost per card
- **Minimum 2 mouse clicks per card**: "Show expected answer" (line 142) then one of five rating buttons (lines 153–165). If the user actually types an answer (the point of active recall), it's **3 clicks + typing**, because the answer textarea (lines 125–133) is **not autofocused** — `autoFocus` is used in the add-forms on Questions/Objectives/LabTemplates but not here, where it matters most.
- **Zero keyboard shortcuts.** A grep across `apps/web/src` finds no `onKeyDown`, no `keydown` listener, no `tabIndex`, nothing. Anki's core loop is Space → number key. Here, with the seed data, day one presents **100 due cards** (all seed questions are new, and `apps/server/src/reviews.repo.ts` line 15 puts them all in the queue with no cap) — that's ~200–300 mouse clicks with mouse travel between a mid-card reveal button and a bottom-row rating grid. This is the single biggest habit-killer in the app.

### Does it enforce retrieval before reveal?
**No.** The rating row (lines 150–170) renders unconditionally and is enabled *before* the answer is revealed. A user can grade a card without revealing the expected answer or attempting recall. The textarea is even labeled "(optional)". Anki structurally enforces retrieval by hiding grade buttons until the answer is shown; here nothing gates rating on `revealed`, so the path of least resistance under fatigue is rate-without-recalling — which silently destroys the value of the SRS data.

### Confirmed bug: a failed submit permanently bricks the card
`ReviewCard.grade` (lines 102–106) sets `setSubmitting(true)` and never resets it. The parent's `onGrade` (lines 66–78) catches `submitReview` errors internally and only sets the error banner — so the promise resolves, the card does **not** advance (index unchanged, same `key`), the component stays mounted, and `submitting` stays `true`. All five rating buttons *and* the Skip button are `disabled={submitting}` (lines 157, 167). One transient network/server error and the session is dead until a full page reload. The success path relies on unmount ("component unmounts on advance… no state reset needed", line 105) — the failure path was not considered.

### Other flow gaps
- **No undo.** Ratings 1–5 sit adjacent in a grid; a misclick permanently reschedules a card (+1d vs +14d) with no way back. Anki's `Z`/undo exists precisely for this.
- **Rating 1 ("Forgot") exits the session.** Intervals are fixed per rating (`REVIEW_RATINGS`, `packages/shared/src/types.ts` lines 129–135) and a failed card is not re-queued within the session — you forget something and don't see it again until tomorrow. Anki re-shows lapsed cards within minutes (learning steps), which is what actually re-encodes the memory.
- **"Skip for now" (line 167–169) just advances the index** — skipped cards vanish for the session rather than moving to the back of the queue, and the DoneState counts them as "skipped" with no way to pick them back up except a full queue reload.
- **Session summary is thin.** `DoneState` (lines 191–213) shows only reviewed/skipped counts — no rating breakdown (how many Forgot vs Easy), no per-objective weak spots surfaced, no time spent, no streak update, no "come back tomorrow: N due". After 100 cards of effort the payoff screen teaches the user nothing.
- **No session scoping or caps.** You cannot review only one objective/domain (e.g., the 30%-weighted Core ML domain before exam day), and there is no new-cards-per-day limit, so the day-one wall of 100 and post-vacation pileups are unmitigated.
- **Past attempts are invisible.** `user_answer` is dutifully stored on submit, and `getHistory` exists in `api/client.ts` (line 98), but it is **dead code — never imported anywhere**. The user's typed answers and rating history surface nowhere in the UI, so a key feedback loop (am I improving on this card?) is built server-side but unshipped in the UI.

### Scheduling ceiling (shared/server, but a UX outcome)
Because intervals are a fixed map (best case +14d forever, no growth with consecutive successes), every question in the bank recurs at least ~2×/month indefinitely. At 100 questions that's a floor of ~7 reviews/day *forever*, growing linearly with the bank. Anki-style ease multiplication is what keeps mature cards from crowding out new material.

## 2. Friction and missing affordances, page by page

### Questions (`pages/Questions.tsx`)
- **No search, no filters, no pagination, no group collapse.** 100 questions across 25 objectives render as one giant scroll grouped by objective title (lines 118–136). Finding or auditing a specific question is a Ctrl+F exercise.
- **No per-question review metadata** — no next-due date, last rating, or attempt count on cards, even though the data exists (`next_review_date` is on the type; history endpoint unused).
- **No bulk operations** (re-link several questions to an objective, bulk delete, bulk difficulty).
- **Stale copy:** the page header still says "Self-scoring and a spaced-review queue arrive in the next milestone" (lines 96–98) — Review shipped; this actively misdirects a new user away from an existing feature.
- Delete is a native `confirm()` with no undo (lines 375–384).

### Objectives (`pages/Objectives.tsx`)
- Status/confidence selects **auto-save on change** (lines 253–283) — good, low friction. On failure the controlled value correctly stays stale, but the only feedback is a generic banner at the top of a long page, far from the row that failed.
- No filter by status/confidence/domain and no search; a "show only weak" toggle is the obvious missing affordance given the whole app's premise.
- `ObjectiveEditor` (lines 302–361) has a Save button but no Cancel (you must find the row's Edit/Close toggle above it).

### Dashboard (`pages/Dashboard.tsx`)
- Strong concept (weak-list with reason chips, readiness table). But the calls to action **lose context**: `WeakRow`'s "Review" button (line 165) links to the whole `/review` queue, not that objective's cards; "Find a lab" (line 170) links to `/labs` without pre-setting the objective filter that `LabTemplates.tsx` already has (`objectiveFilter`, line 43) — a query param would wire this in minutes.
- `DOMAIN_WEIGHTS` (lines 13–19) is a hardcoded string-keyed map that must exactly match DB domain strings; any drift silently renders "—".
- Error state replaces the page with a banner and **no retry button** (line 31); no refetch affordance at all.
- Habit-formation gap: "Reviews (7d)" tile exists (line 57) but **no streak, no daily goal, no due-today forecast** — the cheapest known levers for daily-use tools.

### Review (covered above), LabTemplates (`pages/LabTemplates.tsx`)
- The only page with a real filter (objective dropdown, lines 120–136 — weak objectives even get a "— weak" suffix, nice). But **tags are rendered as inert chips** (lines 229–237): not clickable, not filterable, despite being the natural browse axis.
- "Start lab run" → navigate to `/runs?open=ID` (lines 86–98) is a well-designed handoff.

### LabRuns (`pages/LabRuns.tsx`)
- **Unsaved-draft data loss:** `RunEditor` holds a local `draft` (line 242); collapsing the row (`onToggle` on the clickable header, line 198) unmounts the editor and **silently discards everything typed** — no dirty check, no warning, no autosave. This page asks for the longest, most reflective writing in the app (hypothesis, why-it-happened, mistakes); losing 20 minutes of reflection to a stray header click is a trust-destroying failure mode.
- The clickable `run-head` div is mouse-only: no `role="button"`, no `tabIndex`, no key handler, no `aria-expanded`.
- `SpinOffQuestion` pre-seeding from the mistakes field (line 404: `Explain: ${seedText}`) is a great idea, but it dumps the *entire* mistakes blob into one question rather than letting the user pick a line/selection.
- Status auto-stamping of dates in `changeStatus` (lines 249–257) is a thoughtful touch.

### Cross-cutting
- **Loading states** are bare `<p>` text on every page; fine for a local app, but there are **no error-retry buttons anywhere** — every error path is "banner + click to dismiss," and on Dashboard the banner replaces all content.
- **Empty states** are decent (Review's EmptyState, seed hints on Questions/Templates/Runs) — this is the best-handled category.
- No 404 route in `App.tsx` (unknown paths render an empty `<main>`); `.nav-soon` in `styles.css` (line 68) is dead CSS.

## 3. What Anki does that this lacks (ranked by relevance)
1. **Keyboard-driven grading** (Space reveal, 1–4 rate, Z undo) — here: nothing.
2. **Grade buttons hidden until reveal** — structural retrieval enforcement.
3. **Intra-session relearning of failed cards** (learning steps) — here: rating 1 exits until tomorrow.
4. **Daily new-card and review caps** — here: 100-card day-one wall.
5. **Growing intervals / ease factor** — here: hard 14-day ceiling → unbounded mature-card load.
6. **Undo last answer.**
7. **Deck/tag-scoped sessions** — here: one global queue only.
8. **Card browser with search/sort/bulk edit** — here: Questions page has none of it.
9. **Session/answer stats and heatmap-style streaks** — here: reviewed/skipped counts only.
10. **Bury/suspend** — here: Skip discards for the session with no requeue.

Things this app has that Anki doesn't (worth preserving): objective→exam-weight mapping, weak-area triage with reasons, labs that feed mistakes back into the card bank.

## 4. Code quality

**State management.** Plain `useState` + fetch-on-mount per page — appropriate scale for a local SPA, no over-engineering. But the identical load pattern (loading/error/data + `Promise.all`) is copy-pasted across all six pages with no shared `useApi` hook, no AbortController cleanup, and no cache — every route switch refetches everything. The error-coercion incantation `String((e as Error).message ?? e)` appears ~14 times.

**API client (`api/client.ts`).** Clean, typed, thin — good. Two nits: `deleteQuestion` (lines 77–83) reimplements the `del` helper (lines 159–165) verbatim; and `getHistory` (line 98) is exported dead code.

**Component reuse.** Real duplication: `Stat` is re-declared in `Objectives.tsx` (124), `Questions.tsx` (169), `LabRuns.tsx` (162), with a near-clone `Tile` in `Dashboard.tsx` (115); `groupByDomain` is triplicated (`Objectives.tsx` 363, `LabTemplates.tsx` 484, `ObjectivePicker.tsx` 43); `DifficultySelect` (`Questions.tsx` 471) ≡ `NumSelect` (`LabTemplates.tsx` 416); the dismissible error banner JSX is copy-pasted on five pages. `ObjectivePicker` is the one properly extracted shared component and it's well done (optgroup by domain, weak-suffix at one call site).

**Correctness issues found:** (a) the Review submit-failure brick (Section 1 — the one real bug); (b) LabRuns draft loss on collapse (data-loss-by-design); (c) Questions page's `objectiveTitle` backfill (lines 50–54) is a reasonable workaround for the create response lacking the join field, correctly commented.

**Accessibility.** Weak across the board — the grep for `aria-|role=|tabIndex|onKeyDown` returns **zero matches** in the entire web src:
- Error banners are click-to-dismiss `<div>`s: not focusable, not keyboard-dismissible, no `role="alert"` so screen readers never announce failures.
- `LabRuns` expand/collapse header is a mouse-only `<div onClick>`.
- The review progress bar (`Review.tsx` 56–61) has no `role="progressbar"`/`aria-valuenow`.
- Focus is dropped when "Show expected answer" unmounts itself (focus falls to `<body>`), and form open/close never moves focus.
- On the plus side: inputs are consistently wrapped in `<label>` elements (implicit association works), buttons are real `<button>`s, and `confirm()` dialogs are at least accessible.

**CSS.** Single hand-rolled stylesheet, coherent tokens, sensible responsive touches (`.table-scroll`, `run-editor` collapse at 720px). No dark mode; topbar nav will overflow on narrow phones (no wrap/media query).

## 5. Ranked UX improvements (impact on daily-habit formation)

1. **Keyboard shortcuts in Review** (`Review.tsx`): Space/Enter = reveal, 1–5 = rate, S = skip, autofocus the answer textarea on card mount. Turns 2–3 clicks/card into ~2 keystrokes; this alone changes whether a 30-card day feels like 3 minutes or 10.
2. **Gate rating on reveal** (`Review.tsx` 150–170): render or enable the rating row only after `revealed` (or when there's no expected answer). This is a ~3-line change that structurally enforces retrieval — the entire scientific basis of the tool.
3. **Fix the submit-error brick** (`Review.tsx` 66–78 + 102–106): have `onGrade` rethrow (or return success) so `ReviewCard` can `finally { setSubmitting(false) }`. Without this, one flaky request kills a session.
4. **Undo last rating**: keep the last submission in page state and re-insert the card at the front; needs a delete-last-attempt or re-schedule endpoint. Removes the anxiety tax on fast grading (which shortcut adoption will amplify).
5. **Requeue failed and skipped cards within the session**: on rating 1, push the card to the back of `queue`; make Skip do the same instead of discarding. Matches how memory actually consolidates and makes "session complete" mean something.
6. **Daily caps + streak/goal on Dashboard**: cap new cards per day (~15–20), show "Due today: N / done: M" and a consecutive-day streak on `Dashboard.tsx`. The 100-card day-one wall is the likeliest single reason a user quits in week one; a visible streak is the likeliest reason they return in week three.
7. **Growing intervals** (shared/server, surfaced in the rating hints): multiply the previous interval on 4–5 instead of the fixed 7/14-day map, so mature cards decay out of the daily load. Without this, the tool gets *worse* the more faithfully you use it.
8. **Scoped review sessions**: accept `?objective=`/`?domain=` on `/review`, and make Dashboard's `WeakRow` "Review" button (Dashboard.tsx 165) and the readiness-table Due column deep-link to a filtered queue. Also pass the objective through to `/labs` (the filter already exists there).
9. **Questions page: search box + filters (objective/difficulty/due-status), collapsible groups, and per-card review stats** (next due, last rating, attempts — finally using `getHistory`). Also delete the stale "arrive in the next milestone" copy (lines 96–98).
10. **LabRuns draft protection**: dirty-state guard on collapse (confirm) or debounced autosave of the run draft; the reflective-writing surface must never silently lose work.
11. **Post-session summary upgrade** (`DoneState`): rating histogram, objectives that had the most "Forgot"s with links, tomorrow's due count. Converts effort into insight and cues the next session.
12. **Extract shared plumbing** (`useApi` hook, `Stat`, `ErrorBanner`, `groupByDomain`, `NumSelect`) and add baseline a11y (`role="alert"` on banners, keyboardable expanders with `aria-expanded`, progressbar semantics, focus management on reveal). Lower direct habit impact but reduces the cost of every improvement above.
