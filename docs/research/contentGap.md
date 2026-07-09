## KEY FINDINGS
- The two highest-weight exam domains are the app's thinnest: Core ML (30%) has only 20 of 100 questions and Software Development (24%) has 19 questions and zero labs, while the two smallest domains (DA&V 14%, Trustworthy 10%) are over-served.
- The single most exam-confirmed content cluster — NVIDIA tool-purpose mapping (Triton dynamic batching, TensorRT/QAT, ONNX, NCCL/AllReduce, NGC/MIG/AI Enterprise/Base Command, NeMo Retriever, LLMOps monitoring) — is almost entirely absent despite being official suggested-reading material and community-rated as the hardest yet easiest-to-score exam section.
- The bank is 100% open-ended recall but the real exam is 50-60 timed multiple-choice questions; recommend a separate 150-180-item MCQ bank (three weight-proportional 50-question mock forms, ~25% choose-two) in a new mcq_items table feeding the already-reserved exam_sessions/exam_items schema hooks, with distractors mined from documented misconceptions including the four confirmed answer flaws.
- Several topics named verbatim in official objectives or suggested readings are never asked: explained variance (objective 2.2), A/B testing (official reading + named in the seed's own objective), cross-validation, activation functions, GLUE, transfer learning, and community-surprise topics WordNet-vs-word2vec, spaCy, C2PA, and multimodal awareness.
- Recommend +39 open-ended questions (Core +18, SW Dev +12, Experimentation +6, DA&V +2, Trustworthy +1) plus dedupe-by-rewrite converting the 6 duplicate pairs into 6 missing topics with zero count change, targeting ~139 questions.
- Proposed 13 new labs, all feasible on consumer Windows with free/local tools (Ollama, HF, pandas, onnxruntime), giving the zero-lab domains 5-6 SW-Dev labs and 4 DA&V labs; RAPIDS/cuDF and Triton labs need WSL2 and are marked optional/fallback.
- Priority 1 is the cheap integrity work: apply the 4 confirmed expected_answer fixes, rewrite the 6 duplicates, and move the misfiled TensorRT/Triton question out of Core ML — these currently corrupt self-grading rubrics and domain-readiness scores.
- Deliberate non-goals confirmed by test-takers: GPU SKU trivia, CUDA code, attention-math derivations, and NeMo YAML minutiae.

---

# NCA-GENL Content Gap Analysis — LLMStudy

Synthesis of the seed-content audit (`c:/Code/LLM/LLMStudy/db/seed/nca-genl.json`, 25 objectives / 100 questions / 5 labs) against the verified exam blueprint (official study guide r7, Jan25) and community exam intelligence.

**Bottom line:** Domain weights in the seed exactly match the official blueprint, and answer quality is high — but the bank has three structural gaps: (1) the two highest-weight domains are the thinnest (Core ML 30% has 20 Q; Software Development 24% has 19 Q and **zero labs**), (2) the single most exam-confirmed cluster — NVIDIA tool-purpose mapping (Triton/TensorRT/ONNX/NCCL/NGC/MIG/NeMo Retriever) — is almost entirely absent, and (3) the bank is 100% open-ended recall while the real exam is 50–60 timed multiple-choice questions, so there is no format-matched practice at all.

Legend: **[O]** official objective/suggested reading · **[OC]** official DLI course objective · **[C]** community/test-taker confirmed.

---

## 1. Coverage Matrix — blueprint topics vs current 100 questions + 5 labs

### Domain 1 — Core Machine Learning and AI Knowledge (30% · 20 Q · 2 labs · 0.67 Q per weight-point, lowest density in the bank)

| Status | Topics |
|---|---|
| **COVERED** | Self-attention Q/K/V, multi-head, positional encoding, causal masking, O(n²) + mitigations; backprop, loss functions, Adam vs SGD, LR pathologies, overfitting; BERT/GPT/T5 family-to-task mapping; MoE; scaling laws + Chinchilla; zero-shot/few-shot/CoT prompting (+ both labs); instruction tuning vs RLHF; RAG-vs-fine-tune decision; KV cache |
| **THIN** | RLHF as an explicit 3-stage pipeline (SFT → reward model → RL) **[C]**; self-supervised pretraining objectives (MLM vs next-token) **[OC]**; dropout/regularization as a named technique **[C]**; layer normalization and activation functions are *named in the seed objectives but never asked* |
| **MISSING** | Activation functions **[O — official suggested reading]**; residual connections; softmax scaling / why divide by √d_k **[C — confirmed conceptual exam topic]**; decoding strategies as first-class topic (greedy vs beam vs top-k/top-p) **[C]**; transfer learning **[OC]**; ML fundamentals from official objective 1.5 — feature engineering, model comparison, cross-validation **[O]**; traditional ML tooling — spaCy, NumPy, Keras, XGBoost, NetworkX/cuGraph graph analytics **[O/OC]**; supervised/unsupervised/RL taxonomy; RNN/LSTM-vs-transformer; diffusion models **[O — suggested reading]**; multimodal awareness **[C — appeared for some takers]**; foundation-model / autoregressive-model concepts **[O]**; DPO **[C]**; context-window concept |

### Domain 2 — Data Analysis and Visualization (14% · 21 Q · 0 labs · over-served on volume, but misses several confirmed topics)

| Status | Topics |
|---|---|
| **COVERED** | Stemming vs lemmatization; subword tokenization (BPE/WordPiece); dedup/cleaning; TF-IDF vs dense retrieval (+BM25); embeddings + cosine similarity; static vs contextual embeddings; t-SNE/UMAP/PCA visualization + caveats; confusion matrix, correlation heatmap, token-length plots; cuDF / cuDF-vs-cuML-vs-cuGraph / GPU transfer overhead / Dask-cuDF |
| **THIN** | Chart-type selection in general (only 2 specific plots asked) **[O — objective 2.4]**; SentencePiece (*named in the seed objective, never asked*); loss functions for model comparison (only loss-curve reading) |
| **MISSING** | **Proportion of explained variance [O — named verbatim in official objective 2.2 and in the seed's own objective text, never asked]**; WordNet vs word2vec **[C — reported surprise]**; spaCy usage **[O+C]**; lexical diversity vs syntactic complexity **[C]**; EDA workflow / EDA before fine-tuning **[O+C]**; data augmentation **[OC]**; applied NLP tasks — NER, text classification, QA, author attribution **[OC]**; LangGraph **[OC]**; confounding factors in research results **[O — objective 2.5]** |

### Domain 3 — Experimentation (22% · 22 Q · 2 labs · best-covered domain, but three official readings unaddressed)

| Status | Topics |
|---|---|
| **COVERED** | Full FT vs LoRA/QLoRA + rank trade-off; catastrophic forgetting; perplexity, BLEU vs ROUGE, BERTScore, pass@k, precision/recall/F1 under imbalance; validation vs test; seeds/variance/significance/CIs; data leakage; LLM-as-judge biases + mitigations; RAGAS-style RAG eval **[O]**; reproducibility incl. GPU non-determinism; both labs (LoRA VRAM, ROUGE) |
| **THIN** | Human-in-the-loop labeling/annotation quality + RLHF as an experimental process **[O — in the domain description]** (one medical HITL question lives in Trustworthy); machine-translation evaluation beyond BLEU **[O]** |
| **MISSING** | **A/B testing [O — official suggested reading, named in the seed's own objective, community-confirmed with the 50/50-split detail — never asked]**; cross-validation methodology **[O — suggested reading]**; hyperparameter search (grid/random/Bayesian) **[C]**; GLUE benchmark **[O — suggested reading]** and benchmark suites generally (MMLU/HELM); other PEFT methods — prompt tuning / **p-tuning** (NVIDIA's own method, in the official prep curriculum) / adapters **[C]** |

### Domain 4 — Software Development (24% · 19 Q · **0 labs** · biggest blueprint gap in the app)

| Status | Topics |
|---|---|
| **COVERED** | HF pipeline/AutoTokenizer; LangChain vs LlamaIndex; structured/typed output; NIM; NeMo; NeMo Guardrails; RAG pipeline anatomy; agents/ReAct/tool calling; prompt versioning + CI for non-deterministic outputs; quantization trade-offs (generic); static vs continuous batching; speculative decoding; KV cache |
| **THIN** | Triton — only role-level, in one *misfiled* question sitting in a Core ML objective; specific vector DBs (FAISS/Milvus named nowhere) |
| **MISSING** | **Triton specifics — dynamic batching, concurrent model execution, multi-framework serving [O+C — "why/when Triton" confirmed recurring]**; **TensorRT specifics — layer fusion, INT8 quantization-aware training [O — suggested reading]**; **ONNX interoperability [O — suggested reading, C-confirmed]**; **NCCL / AllReduce / Ring-AllReduce distributed training [O — TWO official suggested readings]**; NVIDIA platform mapping — NGC Catalog, MIG, NVIDIA AI Enterprise, Base Command, DGX **[C — wellstsai reports all of these]**; NeMo Retriever **[C]**; CUDA at concept level (what GPU acceleration enables) **[C]**; **LLMOps monitoring of production systems [O — objective 4.5, C — reported surprise topic]**; system/hardware/software requirements identification **[O — objective 4.4]**; Docker/containerization and REST/gRPC serving concepts; distillation/pruning as quantization alternatives; HF datasets big-data handling **[O]** |

### Domain 5 — Trustworthy AI (10% · 18 Q · 1 lab · over-served on volume; gaps are narrow)

| Status | Topics |
|---|---|
| **COVERED** | Bias sources + mitigation; counterfactual augmentation; demographic parity vs equalized odds; four-fifths rule; hallucination taxonomy + mitigation; guardrails; PII/memorization; DP-SGD; extraction attacks; redaction; model cards + datasheets; HITL; prompt injection; jailbreak defense-in-depth; RAG-grounding lab (the app's best lab) |
| **THIN** | NVIDIA's ethical-principles framing (privacy, safety & security, transparency, non-discrimination) as a named framework **[O — objective 5.1]**; robustness to adversarial/noisy input **[C]** |
| **MISSING** | **C2PA / content credentials [C — specifically flagged by a test-taker]**; explainability — SHAP/LIME/attention visualization **[C — healthcare/finance scenarios]**; data privacy **vs consent** balance as framed in official objective 5.2 **[O]**; energy-conscious AI **[O — in the official domain description]** |

### Cross-cutting structural findings
- **Format gap (biggest single gap):** the exam is 50–60 scenario MCQs in 60 minutes, ~75% single-choice / ~25% "choose two." The app has zero MCQ items and no timed mode; `db/schema.sql` line 156 already reserves `exam_sessions/exam_items` for this.
- **6 duplicate pairs across domains** inflate coverage and leak review performance across domain-readiness scores (perplexity, KV cache, NeMo, Guardrails, overfitting, accuracy-under-imbalance).
- **4 confirmed flawed expected_answers** (MoE comparison baseline, negative-cosine claim, "raising temperature" typo, tool-calling "deterministic and secure" overclaim) — these are grading rubrics, so the errors actively mis-grade correct student answers. Exact fixes are already specified in the flaw report (e.g., seed line 345 for MoE).
- **1 misfiled question** (TensorRT-LLM vs Triton under a Core ML objective) distorts both domains' readiness by one question each.
- **Difficulty shape:** no d1 or d5 items; DA&V has zero d4 despite the biggest surplus. Minor — the exam is associate-level and clusters at moderate difficulty anyway; add d1 warm-ups only where new fundamentals questions are added.

---

## 2. Question-Bank Expansion Recommendation

### 2a. Zero-cost fixes first (no count change)
1. **Apply the four confirmed answer fixes verbatim** (MoE @ line 345; cosine/negative clause; structured-output "raising temperature" → "lowering temperature"; tool-calling determinism/security clause). These corrupt the self-grading rubric today.
2. **Move the TensorRT-LLM/Triton question** from "Pre-training, inference, and scaling laws" to a Software Development objective (counts become Core 19 / SW 20 — directionally correct too).
3. **Dedupe by rewrite, not deletion** — convert one member of each duplicate pair into a missing topic *in the same domain*, preserving idempotent seeding and per-objective counts:

| Duplicate pair | Rewrite target (fills a MISSING topic) |
|---|---|
| Perplexity (DA&V Q72; keep Experimentation Q8) | **Explained-variance ratio** — official objective 2.2, promised by the seed's own objective text |
| KV cache (Core Q39; keep SW Q52) | Context window / why long context is expensive, or decoding strategies |
| NeMo fine-tuning (Exp Q55; keep SW Q45) | **p-tuning / prompt tuning vs LoRA** (NVIDIA's own PEFT method) |
| NeMo Guardrails (Trust Q81; keep SW Q47) | **C2PA / content credentials** (community-flagged) |
| Overfitting curves (DA&V Q24; keep Core Q33) | **Chart-type selection** (which plot for which analysis question) |
| Accuracy-under-imbalance (Trust Q59; keep DA&V Q73) | **Explainability: SHAP/LIME in high-stakes domains** |

### 2b. New open-ended questions: +39, target ≈139 total

Current Q-per-weight-point density: Trust 1.8, DA&V 1.5, Exp 1.0, SW 0.79, Core 0.67. Target: bring every domain to ≥ ~1.25 Q/pt rather than shrinking the over-served small domains (surplus there is harmless depth; Dashboard readiness averages per-domain, so extra questions don't skew cross-domain comparison once duplicates are gone).

| Domain | Now | Add | Target | Specific new topics |
|---|---|---|---|---|
| Core ML (30%) | 20 (19 after move) | **+18** | 37–38 | Activation functions ×2 (ReLU/GELU, why non-linearity) · layer norm + residual connections ×2 · √d_k scaling rationale ×1 · decoding strategies (greedy/beam/top-k/top-p/temperature as one family) ×2 · transfer learning ×1 · RNN/LSTM vs transformer ×1 · ML fundamentals (cross-validation concept, feature engineering, classification vs regression) ×3 · traditional-ML tooling (spaCy/NumPy/XGBoost/graph analytics — "which package for which job") ×2 · diffusion + multimodal awareness ×2 · pretraining objectives MLM vs CLM / foundation models ×1 · RLHF 3-stage pipeline + DPO ×1 |
| Software Dev (24%) | 19 (20 after move) | **+12** | 32 | Triton dynamic batching / concurrent model execution / model repository ×2 · TensorRT layer fusion + QAT-INT8 ("FP32-level accuracy at INT8") ×1 · ONNX interop ×1 · NCCL + AllReduce/Ring-AllReduce ×2 · NVIDIA platform mapping (NGC, MIG, AI Enterprise, Base Command, DGX, NeMo Retriever) ×2 · LLMOps production monitoring (drift, cost/latency dashboards, canary evals) ×2 · system-requirements sizing scenario ×1 · CUDA-concept + distillation/pruning ×1 |
| Experimentation (22%) | 22 | **+6** | 28 | A/B testing mechanics (split design, metric choice, when vs offline eval) ×2 · cross-validation methodology ×1 · hyperparameter search (grid/random/Bayesian) ×1 · GLUE + benchmark suites and their limits ×1 · human labeling/annotation quality + inter-annotator agreement / RLHF-as-experiment ×1 |
| DA&V (14%) | 21 | **+2** | 23 | WordNet vs word2vec ×1 · spaCy applied tasks (NER/classification) + EDA-before-fine-tuning ×1 (explained variance + chart choice arrive via dedupe rewrites) |
| Trustworthy (10%) | 18 | **+1** | 19 | Privacy-vs-consent balance + energy-conscious AI framing ×1 (C2PA + explainability arrive via dedupe rewrites) |

Resulting shares ≈ 27/23/20/17/13 vs weights 30/24/22/14/10 — the two small domains stay intentionally deep, the two big domains stop being the thinnest. Author new answers in the bank's stronger "generation-2" style: rubric sentence at the end ("A full answer names X plus at least two of Y").

### 2c. NEW QUESTION TYPE: a multiple-choice bank (the highest-value structural addition)

The current bank is 100% open-ended active recall — excellent for learning, wrong-shaped for rehearsing a 50–60-question, 60-minute, single-best-answer exam. Keep the open-ended bank for the spaced-review loop; **add a separate MCQ bank feeding the roadmapped mock-exam mode** (`exam_sessions`/`exam_items` hooks already reserved in `db/schema.sql`).

**Size: 150–180 MCQ items** (minimum viable 120). Rationale: three non-overlapping 50-question weight-proportional mock forms (50 × 3 = 150) plus drill slack; at 180 the weight-proportional split is Core 54 / SW 43 / Exp 40 / DA&V 25 / Trust 18. Include ~25% multi-select ("choose TWO") to mirror the reported real mix; assemble forms as 60-minute timed sessions.

**Authoring rules:**
- **Single-concept, scenario-framed stems** mirroring the real exam's dominant patterns: which-tool-for-which-job, metric discrimination, workflow ordering (embed → store → retrieve → augment → generate), trade-off choice, symptom → diagnosis.
- **4 homogeneous options** (single-choice) or choose-2-of-5 (multi-select). No "all/none of the above"; keep option lengths comparable so the correct answer isn't the longest.
- **Distractors from documented real misconceptions**, three ready-made sources: (a) the confusable pairs the open-ended bank already teaches (BLEU vs ROUGE vs perplexity, Triton vs TensorRT vs NIM vs NeMo, LoRA vs full FT vs p-tuning, demographic parity vs equalized odds, cosine vs Euclidean, static vs continuous batching); (b) **the four confirmed content flaws — each one is a field-tested wrong belief that graders themselves fell for**: "MoE beats an equal-*size* dense model on quality," "negative cosine = antonym," "raise temperature to fix malformed JSON," "tool calling makes execution deterministic and secure"; (c) community-reported traps ("BLEU measures vocabulary size," "quantization improves accuracy," "fine-tuning is always better than RAG" — note the community heuristic that RAG is usually the right answer).
- **A per-option explanation is mandatory** — why the key is right *and* why each distractor is wrong. This turns every item into a teaching object, powers review after mock exams, and is the natural substrate for the roadmapped LLM answer-grading feature.
- **Tag every item** with objective_id, difficulty, and single/multi flag so mock forms can be assembled weight-proportionally and results can flow into the existing weak-area/domain-readiness dashboard.
- **Schema note:** do not overload `recall_questions` (its `UNIQUE(objective_id, question_text)` seeding contract and review-cache columns are recall-specific); add an `mcq_items` table (stem, options JSON with per-option explanation + correct flags, objective_id FK, difficulty, multi_select flag) and let `exam_items` reference it.

---

## 3. Lab Expansion — 13 concrete new labs

All assume a consumer Windows machine: decent CPU, optional NVIDIA consumer GPU, free/local tools (Python, PyTorch, Hugging Face, Ollama/llama.cpp, pandas). Key Windows caveats flagged: RAPIDS/cuDF and Triton containers are Linux-only → require WSL2; bitsandbytes on native Windows is fragile.

| # | Lab | Domain | Objective | What the learner does | Feasibility |
|---|---|---|---|---|---|
| 1 | **Tool calling end-to-end** | SW Dev | Function/tool-calling control flow | Declare a JSON-schema function (e.g., `get_weather`, calculator) against Ollama (llama3.1-8B supports tools) or the free NVIDIA API catalog (build.nvidia.com); execute the model-emitted call in Python, feed the result back; then break it — inject a prompt that makes the model produce bad arguments, add app-side validation. Artifact: transcript of a successful loop + one blocked bad call | **Easy.** CPU-only OK with Ollama; directly repairs the flawed-answer misconception |
| 2 | **Serve and measure: local LLM as an API** | SW Dev | Deployment, latency/throughput, monitoring (obj 4.1/4.5) | Run `ollama serve` or llama.cpp server; write a Python client; measure TTFT and tokens/sec at concurrency 1/2/4; observe streaming vs blocking. Artifact: table of latency/throughput vs concurrency + one paragraph on batching implications | **Easy.** CPU fine with a 3–4B model |
| 3 | **Quantization ladder** | SW Dev | Quantization trade-offs (TensorRT concepts by proxy) | Pull the same model at Q8/Q4/Q2 GGUF; record file size, RAM, tokens/sec, and correctness on 10 fixed prompts. Artifact: 3×4 results table + where quality degrades first | **Easy.** CPU-only; GPU optional speeds it up |
| 4 | **ONNX export and runtime comparison** | SW Dev | ONNX interoperability (official reading) | Export DistilBERT sentiment to ONNX via `optimum`; run with onnxruntime; compare latency vs PyTorch eager on CPU. Artifact: latency table + 2 sentences on when ONNX matters | **Easy.** Pure CPU, small model |
| 5 | **NVIDIA ecosystem scenario mapping + one real NIM call** | SW Dev | Tool-purpose mapping (hardest-rated exam section) | Given 10 written scenarios, pick Triton/TensorRT/NeMo/NIM/NeMo Retriever/RAPIDS/NGC/MIG/Base Command and justify; browse the NGC catalog; call one hosted NIM endpoint from build.nvidia.com free credits. Artifact: filled mapping table + working API-call script | **Easy.** Browser + free API key; no GPU |
| 6 | **Triton Inference Server via Docker/WSL2** (advanced, optional) | SW Dev | Triton model repository, dynamic batching | Docker Desktop + WSL2: serve the lab-4 ONNX model from a Triton model repository; toggle `dynamic_batching` in config.pbtxt; measure throughput difference under concurrent clients | **Marginal.** Needs WSL2 + Docker (+ GPU passthrough for GPU mode; CPU-only Triton works for the concept). Mark as stretch |
| 7 | **Tokenizer explorer** | DA&V | Subword tokenization; fills the never-asked SentencePiece gap | Load GPT-2 (BPE), BERT (WordPiece), T5/Llama (SentencePiece) tokenizers; tokenize identical texts (rare words, code, non-English, numbers); plot token-count comparisons. Artifact: comparison chart + 3 written observations | **Trivial.** `transformers` on CPU |
| 8 | **Embedding map with PCA explained variance** | DA&V | Embedding visualization + official objective 2.2 | Embed ~200 labeled sentences with sentence-transformers; project with PCA (report explained-variance ratio per component), then UMAP/t-SNE; compare cluster readability; write the interpretation caveats. Artifact: 2 scatter plots + explained-variance table | **Easy.** CPU; ties directly to 9 existing questions plus the objective-promised explained-variance topic |
| 9 | **EDA before fine-tuning** | DA&V | EDA workflow (community-confirmed prerequisite step) | pandas on a small HF dataset (e.g., `ag_news` sample): length distributions, label balance, duplicate detection, top-vocabulary; produce histogram + box plot + 3 findings that would change a fine-tuning plan | **Trivial.** CPU pandas |
| 10 | **cuDF vs pandas benchmark** | DA&V | RAPIDS rationale + transfer overhead | With NVIDIA GPU + WSL2: same groupby/join on 1–5M synthetic rows in pandas vs cuDF (`cudf.pandas`); also time a tiny frame to observe transfer overhead dominating. No-GPU fallback: pandas vs Polars, plus reading-based cuDF answers. Artifact: timing table + when-GPU-wins rule of thumb | **GPU+WSL2 path marginal; fallback easy.** RAPIDS does not run on native Windows — state this in the template |
| 11 | **A/B test a prompt change** | Experimentation | A/B testing (official reading, currently unasked) | Two prompt variants on 30 fixed inputs, randomized order; score outputs; run a two-proportion z-test or bootstrap CI; decide ship/no-ship. Artifact: results CSV + significance verdict + what sample size would be needed | **Easy.** Any LLM access incl. Ollama |
| 12 | **Judge the judge: LLM-as-judge position bias** | Experimentation | LLM-judge risks (already taught, never practiced) | Compare two models' outputs pairwise with a third model as judge; run every pair in both orders; quantify position-bias flip rate; add a rubric and re-measure. Artifact: flip-rate before/after rubric | **Easy.** Ollama with 2 small models + 1 judge |
| 13 | **Bias probe + guardrail** | Trustworthy AI | Bias measurement + NeMo Guardrails hands-on | Template counterfactual probes (swap names/genders) through a small HF sentiment model or local LLM; compute score deltas / disparate-impact style ratio; then add a NeMo Guardrails (pip) input/output rail with a minimal Colang config and show one blocked jailbreak. Artifact: bias-delta table + blocked-prompt transcript | **Easy.** Guardrails logic runs CPU-side over any backend |

Also fix the existing labs (from the audit): rewrite labs 1–2 success criteria to demand artifacts (e.g., "table of 5 outputs per temperature with correctness marked"), and give lab 3 a named model + dataset (e.g., TinyLlama-1.1B or distilgpt2 + a 500-row instruct sample) with the Windows/bitsandbytes caveat.

Resulting lab distribution: Core ML 2 (existing), SW Dev **5–6** (was 0), DA&V **4** (was 0), Experimentation 4, Trustworthy 2 — hands-on weight finally tracks the domains that are most hands-on by nature.

---

## 4. Priority Order

Ranked by (exam weight × community-reported frequency × current gap size × effort):

1. **Fix the 4 flawed expected_answers, dedupe-by-rewrite the 6 pairs, move the misfiled Triton question.** Hours of work; protects grading integrity and un-distorts domain readiness. Do first because everything else builds on a trustworthy bank.
2. **NVIDIA tool-purpose cluster in Software Development (+12 Q, labs 1/2/5).** 24% domain, community calls it both the hardest-rated section and "one of the easiest scoring areas once memorized," and it's the app's largest blueprint miss: Triton specifics, TensorRT/QAT, ONNX, NCCL/AllReduce, NGC/MIG/AI Enterprise/Base Command, NeMo Retriever, LLMOps monitoring are all [O] or strongly [C] and all absent.
3. **Core ML volume + fundamentals (+18 Q).** The 30% domain is the thinnest per weight-point, and its misses are official-reading-backed: activation functions, transfer learning, cross-validation/ML fundamentals, decoding strategies, √d_k, diffusion/multimodal awareness.
4. **MCQ bank + timed mock-exam mode (150–180 items, `mcq_items` + the reserved `exam_sessions`/`exam_items`).** The format mismatch is the single biggest structural gap vs the real exam; community rates format-matched practice exams the most useful prep of all. Ranked 4th only because items 1–3 supply the corrected content MCQs should be authored from — start authoring MCQs as soon as the SW-Dev/Core-ML content lands.
5. **Experimentation blueprint promises (+6 Q, labs 11–12):** A/B testing (official reading AND named in the seed's own objective yet never asked), cross-validation, hyperparameter search, GLUE.
6. **Community-surprise topics (+ dedupe rewrites, +3 Q):** classic NLP (WordNet vs word2vec, spaCy, lexical diversity), explained variance, C2PA, chart choice, explainability. Cheap, each confirmed by a test-taker or the official objective text.
7. **Labs for the zero-lab domains** beyond the priority-2 SW-Dev set: DA&V labs 7–9 (trivial to build, reinforce ~11 existing questions), then labs 10/13.
8. **Lowest priority:** Trustworthy additions beyond the rewrites (domain is 10% and already over-served), difficulty-shape polishing (d1 warm-ups), regulatory frameworks (not exam-reported).

**Deliberate non-goals** (community-confirmed wasted effort — don't add): GPU hardware SKU trivia (H100/H200/GH200), CUDA programming/code, attention-math derivations, NeMo YAML config minutiae, hands-on-graded content for the exam itself (the exam has no lab component — labs are for durable understanding, which the community says is what separates pass from fail).