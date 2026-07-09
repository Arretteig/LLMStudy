# LLMStudy Improvement Plan

*Produced 2026-07-09 from a multi-agent deep dive: full code audit (backend, frontend, learning
mechanics), seed-content audit with adversarial verification of flagged questions, extraction of
the official NCA-GENL Exam Study Guide (r7, Jan 2025), community exam intelligence (5+ first-hand
test-taker writeups), and learning-science research. Detailed reports with sources live in
[docs/research/](research/).*

---

## Verdict

The foundation is sound and was clearly built for these upgrades — pure `sr.ts`, immutable
`answer_attempts`, whitelist repos, reserved schema hooks. Nothing needs a rewrite. The gaps are:

1. **Format mismatch (biggest).** The real exam is 50–60 scenario **multiple-choice** questions in
   60 minutes (~25% "choose two"). The app has 100% open-ended recall and no timed mode.
2. **The two highest-weight domains are the thinnest.** Core ML (30%) has 20/100 questions;
   Software Development (24%) has 19 questions and **zero labs**. The most exam-confirmed cluster —
   NVIDIA tool-purpose mapping (Triton, TensorRT/QAT, ONNX, NCCL/AllReduce, NGC/MIG/Base
   Command/AI Enterprise, NeMo Retriever, LLMOps monitoring) — is almost entirely absent despite
   being official suggested-reading material and community-rated "hardest section, easiest scoring
   once memorized."
3. **Content integrity issues**: 4 confirmed-flawed expected answers (they're grading rubrics, so
   they actively mis-grade correct answers), 6 cross-domain duplicate pairs, 1 misfiled question.
4. **The scheduler doesn't grow.** Fixed 1/2/4/7/14d ladder capped at 14 days: mastered cards recur
   ~2×/month forever, so daily load grows linearly with bank size. No lapse handling, no in-session
   relearning.
5. **The review loop has real bugs/frictions**: a failed submit permanently bricks the session
   (`Review.tsx:66–78,102–106`); rating buttons are enabled *before* reveal (retrieval not
   enforced); zero keyboard shortcuts; all 100 seeded cards land as "due" on day one with no cap.
6. **Overconfidence is structurally invisible.** Weak-area ranking uses self-reported confidence,
   status, and coverage — never the actual ratings in `answer_attempts`. An objective you *feel*
   good about but keep failing never surfaces on "Work on next."

## Exam facts (verified against official sources)

| Fact | Value |
|---|---|
| Format | 50–60 multiple choice, ~75% single / ~25% choose-two, scenario-heavy, no hands-on |
| Duration / price | 60 minutes / $125, Certiverse remote-proctored |
| Passing | Pass/fail, no published cut score (community estimates ~65–70%) |
| Domain weights | Core ML 30 / SW Dev 24 / Experimentation 22 / DA&V 14 / Trustworthy 10 — **seed matches exactly** |
| Community verdict | Terminology + tool-application scenarios; "RAG is usually the right answer"; classic-NLP preprocessing volume surprises people; practice exams rated the single most useful prep (aim ~90%) |
| Confirmed wasted effort | GPU SKU trivia, CUDA code, attention-math derivations, NeMo YAML minutiae |

Full topic checklist per domain (official vs community confidence tags): [research/examResearch.md](research/examResearch.md).

---

## Track A — Content

### A0. Integrity fixes (hours; do first — everything else builds on a trustworthy bank)

1. **Fix 4 confirmed-flawed expected answers** (corrected text drafted in
   [research/verifiedFlaws.md](research/verifiedFlaws.md)):
   - MoE: claims quality advantage over a dense model of equal **size**; correct comparison is equal **compute** (seed ~line 345)
   - Cosine similarity: "negative = opposing meaning" is false in real (anisotropic) embedding spaces
   - Structured output: "raising temperature" typo (should be *lowering*), and answer never addresses the asked comparison
   - Tool calling: "deterministic and secure" overclaim — arguments are still model-generated and injectable
2. **Move the misfiled TensorRT-LLM/Triton question** from Core ML → Software Development.
3. **Dedupe by rewrite** (convert one of each duplicate pair into a missing topic, same domain):

| Duplicate | Rewrite into |
|---|---|
| Perplexity (DA&V copy) | Explained-variance ratio (official objective 2.2, never asked) |
| KV cache (Core copy) | Decoding strategies or context-window cost |
| NeMo fine-tuning (Exp copy) | p-tuning / prompt tuning vs LoRA (NVIDIA's own PEFT method) |
| NeMo Guardrails (Trust copy) | C2PA / content credentials (test-taker-flagged) |
| Overfitting curves (DA&V copy) | Chart-type selection |
| Accuracy-under-imbalance (Trust copy) | Explainability: SHAP/LIME in high-stakes domains |

### A1. Open-ended question expansion: +39 → ~139 total

Bring the big domains up rather than shrinking the over-served small ones. Author in the bank's
stronger "generation-2" style (rubric sentence at the end: "A full answer names X plus two of Y").

| Domain | Now | Add | Priority topics |
|---|---|---|---|
| Core ML (30%) | 20 | **+18** | activation functions, layer norm + residuals, √d_k rationale, decoding strategies, transfer learning, RNN/LSTM-vs-transformer, cross-validation/feature-engineering/ML fundamentals, spaCy/NumPy/XGBoost tool-mapping, diffusion + multimodal awareness, MLM-vs-CLM pretraining, RLHF 3-stage + DPO |
| SW Dev (24%) | 19 | **+12** | Triton dynamic batching/concurrent execution, TensorRT layer fusion + QAT-INT8, ONNX, NCCL + (Ring-)AllReduce, NGC/MIG/AI Enterprise/Base Command/DGX/NeMo Retriever mapping, LLMOps monitoring, system-requirements sizing, CUDA-concept + distillation/pruning |
| Experimentation (22%) | 22 | **+6** | A/B testing mechanics (named in the seed's own objective, never asked), cross-validation, hyperparameter search, GLUE/benchmark suites, labeling quality + inter-annotator agreement |
| DA&V (14%) | 21 | **+2** | WordNet vs word2vec, spaCy applied tasks + EDA-before-fine-tuning |
| Trustworthy (10%) | 18 | **+1** | privacy-vs-consent + energy-conscious AI |

### A2. Labs: 13 new (all consumer-Windows feasible), fix the 5 existing

Zero-lab domains get covered: SW Dev 0→5-6, DA&V 0→4. Highlights (full table with feasibility
notes in [research/contentGap.md](research/contentGap.md)):

| Lab | Domain | Core idea |
|---|---|---|
| Tool calling end-to-end | SW Dev | Ollama/NVIDIA-API function call loop, then break it with prompt injection + add validation |
| Serve and measure | SW Dev | Local LLM behind an API; measure TTFT & tokens/sec vs concurrency |
| Quantization ladder | SW Dev | Same model at Q8/Q4/Q2 GGUF: size/RAM/speed/quality table |
| ONNX export + runtime | SW Dev | DistilBERT → ONNX via optimum; latency vs PyTorch |
| NVIDIA ecosystem mapping + one NIM call | SW Dev | 10 scenarios → pick the right tool; call a hosted NIM (build.nvidia.com) |
| Triton via Docker/WSL2 *(stretch)* | SW Dev | Serve the ONNX model, toggle dynamic batching |
| Tokenizer explorer | DA&V | BPE vs WordPiece vs SentencePiece on identical texts |
| Embedding map + PCA explained variance | DA&V | sentence-transformers → PCA (explained-variance!) → UMAP/t-SNE |
| EDA before fine-tuning | DA&V | pandas on an HF dataset: lengths, balance, dupes → 3 findings |
| cuDF vs pandas *(GPU+WSL2, fallback: Polars)* | DA&V | groupby/join benchmark + transfer-overhead observation |
| A/B test a prompt change | Experimentation | 2 variants × 30 inputs, significance test, ship/no-ship |
| Judge the judge | Experimentation | Measure LLM-judge position bias; rubric and re-measure |
| Bias probe + guardrail | Trustworthy | Counterfactual name-swap deltas; NeMo Guardrails rail blocking a jailbreak |

Existing-lab fixes: labs 1–2 success criteria should demand artifacts (not "I can explain…");
lab 3 (LoRA) needs a named model+dataset and the Windows/bitsandbytes caveat.

### A3. MCQ bank: 150–180 items (the highest-value structural addition)

Three non-overlapping weight-proportional 50-question mock forms + drill slack; ~25% choose-two.
Authoring rules: single-concept scenario stems (which-tool-for-which-job, metric discrimination,
workflow ordering, symptom→diagnosis); 4 homogeneous options; **mandatory per-option explanation**
(UWorld model — every item becomes a teaching object); distractors mined from documented
misconceptions — including the 4 confirmed content flaws, which are field-tested wrong beliefs.

---

## Track B — App features (4 milestones; each leaves the app fully working)

Full feature specs, dependency graph, and effort estimates: [research/featureGap.md](research/featureGap.md).

### M1 — Make the daily loop survivable — ✅ COMPLETE 2026-07-09
- **F1 Fix the review submit-error brick** (confirmed bug, `Review.tsx:66–78,102–106`)
- **F2 Migration runner** (`PRAGMA user_version`) — blocks every later schema change; without it, upgrades destroy study history
- **F3 Backend hygiene**: JSON error middleware, update-path validation, date-format checks, seed NULL-objective dedupe, eager `DB_PATH` export fix
- **F4 Keyboard-first review** (Space=reveal, 1–5=rate, S=skip, U=undo)
- **F5 Gate rating on reveal** (structurally enforce retrieval — the testing effect is the whole point of the app)
- **F6 In-session relearning**: rating 1–2 requeues the card this session (successive relearning, Rawson & Dunlosky)
- **F7 New-card cap (~15/day) + domain interleaving** (kills the 100-card day-one wall; interleaving g=0.42)
- **F8 Undo last rating** · **F9 Session summary v2** · **F10 LabRuns draft protection** (silent data loss on collapse)

### M2 — A scheduler that scales + habit loop — ✅ COMPLETE 2026-07-09
- **F11 Growing-ladder scheduler** ("SM-2 lite"): `next = max(ladder[rating], prev_interval × {3:×1.2, 4:×2.0, 5:×2.5})`, ratings 1–2 reset + count lapses, intervals capped at 60 days absolute — or ~15% of days-to-exam (Cepeda's optimal-gap research) once an exam date is set. **Deliberately not full FSRS** — parameter fitting is meaningless for one user with weeks of data; `sr.ts` purity keeps an FSRS swap contained if ever wanted.
- **F12 Settings + optional exam date + 14-day due forecast**; with no date set, show the mastery-based "ready to schedule" indicator instead of a countdown
- **F13 Minimum-dose streak** (day counts if queue cleared *or* 5 reviews; repair tokens — never hard-reset)
- **F14 Scoped review sessions + dashboard deep links** (`/review?domain=` — drill Core ML before exam day)
- **F15 Retention stats per objective/domain** from `answer_attempts` (also settle the local-vs-UTC timestamp inconsistency first)

### M3 — Calibration and honest weak areas — ✅ COMPLETE 2026-07-09
- **F16 Domains table** (weights currently live only in `Dashboard.tsx` — must move server-side)
- **F17 Weak-area ranking v2**: add accuracy (mean recent rating), recency decay, exam-weight multiplier
- **F18 Item-level confidence** (one-tap sure/probably/guessing *before* reveal)
- **F19 Calibration quadrant**: confident-wrong "danger zone," re-tested at ~2d *and* ~7d (hypercorrection effect + its one-week relapse)
- **F20 Question browser**: search, filters, per-card stats (the `getHistory` API is built but dead)

### M4 — Exam format: MCQ, mocks, error log — ✅ COMPLETE 2026-07-09 (plus 10 verified pilot MCQs seeded)
- **F21 MCQ schema**: `question_format` on `recall_questions` + `question_choices` table with per-option `rationale`; `source`/`session_id`/`selected_choice_id` on `answer_attempts`. (MCQs live in `recall_questions` — not a separate table — so they're reviewable in the same spaced queue.)
- **F22 MCQ Drill mode** — a dedicated untimed practice surface (filterable by domain/objective, keyboard 1–4, immediate feedback showing every option's rationale). The spaced **Review queue stays recall-only**: repeating identical MCQs on a schedule invites answer-pattern memorization and recognition inflates perceived mastery; instead the error log (F24) converts MCQ misses into recall cards that enter the queue. (Mixed formats beat either alone — Adesope 2017: MCQ g=0.70, recall g=0.62 — but each format gets its own surface.)
- **F23 Mock exam mode**: weight-proportional assembly, 60-min timer, flag-for-review, per-domain score screen; exam attempts **skip the SRS cache mirror** (else one mock reschedules every card — decide before building, not after)
- **F24 Error-log workflow**: every miss → classify (knowledge gap / misread / fell-for-distractor) + one-sentence self-explanation → auto-spawn a recall card
- **F25 Readiness estimate**: median of last two mocks ± band, plus predict-your-score-first prompt

### Deliberate non-goals (over-engineering for a single-user local app)
Full FSRS · 4-grade scale migration · interval fuzz · zod validation layer · LLM answer grading
(defer past exam — item confidence + hypercorrection delivers the calibration value offline) ·
RAG study assistant (defer — bottleneck is retrieval practice, not note search) · notification
infra · React-Query-style refactor · comprehensive ARIA pass.

---

## Suggested combined sequence

| When | Software | Content |
|---|---|---|
| Day 1 | F1 (submit brick), F5 (gate rating) | A0 integrity fixes |
| Week 1 | Rest of M1 | A1: SW-Dev NVIDIA cluster + Core ML questions |
| Week 2 | M2 | Finish A1; easy labs (tool calling, serve-and-measure, ecosystem mapping, tokenizer, EDA, A/B) |
| Week 3 | M3 | A3 MCQ authoring (Core + SW Dev first) |
| Week 4+ | M4 | Finish MCQ bank + remaining labs |
| When readiness indicator turns on | — | Take mock 1; schedule the real exam; mocks 2–3 in the final ~2 weeks with error-log review between them |

## Decisions (settled 2026-07-09)

1. **No exam date yet — pacing is mastery-based, not calendar-based.** The user prefers the app to
   adapt to how much they're studying rather than count down to a date. Implications:
   - F11 scheduler uses the **absolute ~60-day interval cap**; the exam-date-aware cap activates
     only if/when a date is set (F12 keeps the optional date picker).
   - Readiness signals are retention-driven: surface per-domain retention + coverage, and a
     **"ready to schedule the exam" indicator** (e.g., all domains ≥ target retention and recent
     MCQ-drill accuracy approaching ~90%, the community's practice-exam bar). Mock timing becomes
     readiness-triggered ("take mock 1 when the indicator turns on") instead of T-21/T-10/T-4;
     those calendar anchors apply once a date exists.
2. **Hardware: RTX 4090 + WSL2 (Python 3.12, CUDA), vLLM installed with local models.** GPU labs
   (Triton, cuDF, LoRA) are primary, not fallback. vLLM upgrades two labs: *serve-and-measure* can
   target a real vLLM server (TTFT/throughput vs concurrency), and continuous-batching behavior can
   be observed directly instead of discussed abstractly. This also de-risks the roadmapped
   inference-benchmark logger.
3. **Content authoring: hybrid.** Claude drafts questions/labs/MCQs (with per-option rationales);
   the user reviews and edits — reviewing is itself high-value study (generation effect).
4. **Scheduler: growing ladder confirmed** (over FSRS and over the fixed ladder).
5. **Format split**: the spaced Review queue stays recall-only; MCQs get their own surfaces —
   untimed **Drill** (immediate per-option rationales) and timed **Mock exam** — and MCQ misses
   feed back into Review as recall cards via the error log. Existing recall questions are NOT
   converted to MCQ; the Questions page remains the library holding both formats.
