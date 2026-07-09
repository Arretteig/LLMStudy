## KEY FINDINGS
- Counts confirmed: 25 objectives (5/domain), 100 questions, 5 labs. Question share vs exam weight: Core ML 20% vs 30% (-10, most under-served despite highest weight), Software Development 19% vs 24% (-5), Experimentation 22% vs 22% (exact), Data Analysis & Viz 21% vs 14% (+7), Trustworthy AI 18% vs 10% (+8).
- Labs are unevenly distributed: Software Development (24% weight) and Data Analysis & Visualization (14%) have ZERO labs; both Core ML labs cover only the prompting objective.
- Difficulty is compressed: 0 at level 1, 29 at level 2, 58 at level 3, 13 at level 4, 0 at level 5; DA&V has zero difficulty-4 questions while holding a question surplus.
- Style mix is healthy: ~38% recall/definitional, ~16% troubleshooting, ~15% compare, ~15% when-to-use/best-choice, ~9% best-practice, ~5% multi-step scenario — good match for the exam's scenario-MCQ flavor.
- ~7% of the bank is redundant: 6 near-duplicate pairs spanning different domains (perplexity, KV cache, NeMo, NeMo Guardrails, overfitting, accuracy-under-imbalance), which inflates coverage and cross-contaminates domain-readiness scores.
- Answer quality is high and mostly self-gradable — the later ~71 answers include explicit grading-rubric sentences — but 7 suspect items found, worst being an internal contradiction: Q13 lists lowering temperature as a valid hallucination mitigation while Q41's answer explicitly denies it.
- One question is misfiled: the TensorRT-LLM vs Triton question sits under a Core ML objective ('Pre-training, inference, and scaling laws') but is Software Development content, skewing domain analytics.
- Objectives promise topics no question tests: layer normalization, activation functions, explained-variance ratio, SentencePiece, A/B testing mechanics.
- Blueprint-gap candidates absent from the whole bank: RNN/LSTM-vs-transformer, transfer learning, decoding strategies (beam/top-k/top-p as first-class), distillation/pruning, ONNX/Docker/REST, cross-validation/ROC-AUC, hyperparameter search, benchmark suites (MMLU/HELM), explainability (SHAP/LIME), regulatory frameworks, DPO.
- Labs 1, 2, 4, 5 are feasible on any consumer machine; Lab 3 (LoRA vs full fine-tune) requires a CUDA GPU + PEFT/bitsandbytes stack, names no model/dataset, and its 60-minute estimate excludes environment setup. Lab 5's cited-answer-plus-abstention criterion is the only artifact-verifiable success check; labs 1-2 use self-declarative 'I can explain...' criteria.

---

# Seed Content Audit — c:/Code/LLM/LLMStudy/db/seed/nca-genl.json

File read in full (829 lines). Contents: 25 objectives (exactly 5 per domain), 100 questions, 5 lab templates. The file's own `_note` correctly discloses that objectives are representative study targets, not verbatim NVIDIA sub-objectives.

## 1. Per-domain counts vs exam weights

| Domain | Weight | Objectives | Questions | Q share | Delta vs weight | Labs |
|---|---|---|---|---|---|---|
| Core Machine Learning and AI Knowledge | 30% | 5 | 20 | 20% | **-10 pts (underweighted)** | 2 |
| Software Development | 24% | 5 | 19 | 19% | -5 pts | **0** |
| Experimentation | 22% | 5 | 22 | 22% | 0 (exact) | 2 |
| Data Analysis and Visualization | 14% | 5 | 21 | 21% | +7 pts (overweighted) | **0** |
| Trustworthy AI | 10% | 5 | 18 | 18% | +8 pts (overweighted) | 1 |

The highest-weight domain (Core ML, 30%) has the fewest questions relative to weight; the two lowest-weight domains are the most over-served. A weight-proportional 100-question bank would be 30/24/22/14/10. To rebalance: +10 Core ML, +5 Software Development; DA&V and Trustworthy AI need no additions (or accept the surplus as intentional depth).

Question counts per objective (4 avg): every objective has 3–5 questions. Thinnest: Model architecture families (3), Software engineering best practices (3), Responsible and ethical AI (3), Safety and alignment risks (3).

Note: one question ("TensorRT-LLM vs Triton" latency-optimization) is filed under the Core ML objective "Pre-training, inference, and scaling laws" but is really Software Development content — it shifts the domain-readiness signal by one question in each direction.

## 2. Difficulty and style distributions

**Difficulty (1–5 scale):** d1: 0, d2: 29, d3: 58, d4: 13, d5: 0. No warm-up (d1) or expert (d5) items; the bank clusters at d3.

Per-domain difficulty: Core ML d2/d3/d4 = 6/9/5; SW Dev = 6/11/2; Experimentation = 4/16/2; DA&V = 10/11/**0**; Trustworthy = 3/11/4. DA&V has zero hard questions despite the largest question surplus; Core ML carries 5 of the 13 d4 items (appropriate for the top-weight domain).

**Question style (my classification, approximate):**
- Recall / definitional / mechanism ("what is X, how does it work"): ~38
- Troubleshooting (symptom → diagnosis → fix): ~16
- Compare / contrast: ~15
- When-to-use / best-tool-or-approach choice: ~15
- Best-practice / why-do-we-do-this: ~9
- Multi-step applied scenario (design a procedure/strategy): ~5

The bank splits into two visible generations: the first ~29 questions (terse, 1–2 sentence answers, mostly recall) and the later ~71 (the "more recall questions" commit — despite the commit name these are richer scenario/compare items with rubric-style answers). Scenario/troubleshooting coverage is good and matches the multiple-choice-scenario flavor of the real exam.

**Duplicate / near-duplicate pairs (≈7% of the bank):**
1. Perplexity — asked nearly verbatim twice (Evaluation metrics Q8; Interpreting statistical metrics Q72)
2. KV cache — twice, near-identical (Pre-training/scaling Q39; Inference optimization Q52)
3. NeMo as the fine-tuning framework — twice, same answer (NVIDIA ecosystem Q45; Fine-tuning Q55)
4. NeMo Guardrails — twice (NVIDIA ecosystem Q47; Content filtering Q81)
5. Overfitting (train loss down, val loss up) — twice (Interpreting metrics Q24; NN training Q33)
6. Accuracy misleading under class imbalance — twice with different cover stories (toxicity Q59; fraud Q73)
(Prompt injection appears twice — Safety Q29, SW-eng Q51 — but from usefully different angles.)
Because duplicates sit in *different domains*, they inflate apparent coverage and let review performance in one domain leak into another domain's readiness score.

## 3. Per-domain TOPIC INVENTORY (for blueprint diff)

### Core Machine Learning and AI Knowledge (20 Q, 2 labs)
**Covered:** self-attention (QKV weighted sum, long-range dependency), positional encoding (sinusoidal/learned), multi-head attention, causal/masked attention, O(n²) attention scaling + mitigations (FlashAttention, sparse/sliding-window, linear attention), loss functions, backpropagation/gradient descent, overfitting (diagnosis + remedies), Adam vs SGD, learning-rate pathologies (divergence/slow convergence, warmup, clipping), encoder-only vs decoder-only vs encoder-decoder (BERT/GPT/T5-BART), Mixture-of-Experts, neural scaling laws, Chinchilla compute-optimal training (~20 tok/param), KV cache, TensorRT-LLM vs Triton roles, zero-shot vs few-shot/in-context learning, chain-of-thought, instruction tuning vs RLHF, RAG-vs-fine-tune-vs-temperature decision. Labs: few-shot prompting, temperature/determinism.
**Objective-described but never questioned:** layer normalization, transformer-block composition, activation functions.
**Absent:** softmax/√d_k scaling, residual connections, RNN/LSTM-vs-transformer comparison, transfer-learning concept, supervised/unsupervised/RL taxonomy, classification-vs-regression basics, decoding strategies (greedy/beam/top-k/top-p as a first-class topic), context-window concept, DPO/newer alignment, GPU-vs-CPU parallelism rationale, other generative families (diffusion/GAN/VAE).

### Software Development (19 Q, 0 labs)
**Covered:** Hugging Face `pipeline`, `AutoTokenizer`/checkpoint matching, LangChain vs LlamaIndex, structured/typed output (Pydantic, instructor, JSON mode, output parsers), NVIDIA NIM, NeMo, NeMo Guardrails (Colang, input/dialog/output rails), RAPIDS positioning within the stack, agentic-vs-single-call definition, ReAct pattern, function/tool-calling control flow, full RAG pipeline anatomy (chunking, embedding model, vector DB, top-k retrieval), prompt version control, CI/testing for non-deterministic LLM outputs (eval datasets, LLM-judge, property checks, regression gates), prompt injection via system-prompt concatenation, quantization trade-offs, KV cache, static vs continuous (in-flight) batching, speculative decoding.
**Absent:** Docker/containerization, REST/gRPC API design, Triton specifics (model repository, dynamic batching config, concurrent model execution), CUDA fundamentals, ONNX/model export, model streaming, specific vector DBs (FAISS/Milvus), NGC catalog depth, observability/monitoring of LLM apps, distillation/pruning as optimization alternatives to quantization.

### Experimentation (22 Q, 2 labs)
**Covered:** full fine-tuning vs PEFT, LoRA mechanics + rank r trade-off, QLoRA (4-bit NF4), catastrophic forgetting, NeMo for customization, perplexity, BLEU vs ROUGE, BERTScore vs BLEU, pass@k, accuracy vs precision/recall/F1/PR-AUC under imbalance, fixed held-out eval sets, validation-vs-test roles, run-to-run variance / statistical significance / seeds+CIs, data leakage / train-test contamination, LLM-as-a-judge risks (position bias, verbosity bias, rubrics, order swapping), judge-vs-BLEU/ROUGE for open-ended eval, RAGAS-style RAG eval (faithfulness, context relevance, answer relevance), reproducibility (seeds, pinned versions, decoding params, GPU/cuDNN non-determinism, hosted-API drift), greedy decoding for reproducible reports. Labs: LoRA-vs-full-FT VRAM, ROUGE evaluation.
**Absent:** hyperparameter search methods (grid/random/Bayesian), A/B testing mechanics (named in the objective, never asked), standard benchmark suites (MMLU, HELM, HellaSwag...), human-evaluation design, other PEFT methods (prompt/prefix tuning, adapters, IA3), cross-validation, experiment-tracking tooling (MLflow/W&B), ROC-AUC.

### Data Analysis and Visualization (21 Q, 0 labs)
**Covered:** dedup/cleaning rationale (leakage, waste), TF-IDF, stemming vs lemmatization, web-corpus cleaning (HTML stripping, Unicode NFC/NFKC, boilerplate, language filtering), subword tokenization motivation (BPE/WordPiece, OOV), embeddings + cosine similarity, cosine vs Euclidean, static (Word2Vec/GloVe) vs contextual (BERT) embeddings / polysemy, sparse TF-IDF vs dense retrieval (+ BM25 hybrid mention), loss-curve overfitting reading, perplexity (dup), accuracy under imbalance (fraud), precision/recall trade-off + threshold, token-length distribution plots, correlation-matrix heatmap, confusion matrix, t-SNE/UMAP/PCA embedding visualization + interpretation caveats, cuDF, cuDF vs cuML vs cuGraph, GPU transfer overhead on small data, Dask-cuDF multi-GPU/out-of-core.
**Objective-described but never questioned:** explained-variance ratio (named in the "Interpreting statistical metrics" objective), SentencePiece (named in the tokenization objective).
**Absent:** basic chart-type selection (histogram/box/scatter beyond the two asked), pandas/matplotlib mechanics, feature scaling/normalization, EDA workflow, data drift, ROC curves.

### Trustworthy AI (18 Q, 1 lab)
**Covered:** bias entry points + mitigation menu, counterfactual data augmentation, demographic parity vs equalized odds, disparate-impact ratio / four-fifths rule, hallucination-reduction techniques, NeMo Guardrails (dup), intrinsic vs extrinsic hallucination, RAG grounding failure diagnosis, PII memorization in fine-tuning, differential privacy / DP-SGD, training-data extraction attacks, PII redaction + pseudonymization for third-party APIs, model cards, datasheets for datasets, human-in-the-loop (medical), prompt injection, RLHF as alignment, jailbreak defense-in-depth (red-teaming, refusal tuning, rails, monitoring). Lab: tiny RAG with citation + abstention.
**Absent:** explainability/interpretability (SHAP/LIME/attention visualization), regulatory frameworks (EU AI Act, NIST AI RMF, GDPR specifics), watermarking/content provenance, toxicity benchmarks, copyright/IP of generated content, energy/environmental impact.

## 4. Quality assessment

**Overall: high.** I spot-checked ~50 expected_answers in detail; the vast majority are technically accurate and current (Chinchilla ~20 tok/param, QLoRA NF4, speculative decoding's rejection-sampling distribution guarantee, equalized-odds conditioning on ground truth, RAGAS dimensions, Porter-stemmer 'studies'→'studi', DP-SGD clipping+noise — all correct).

**Self-gradability:** the later ~71 answers are excellent for self-grading — most end with an explicit rubric sentence ("The key point is...", "A correct answer names the diagnosis plus at least two mitigations"). The first ~29 are terser but still adequate; "Name two..." questions helpfully enumerate acceptable options ("Any two of: ..."). Almost no trivia: the only memorize-a-number items are the four-fifths (0.8) threshold and the ~20-tokens-per-parameter rule of thumb, both contextualized.

**Defects found** (detail in suspect_questions): one internal contradiction (Q13 lists lowering temperature as a hallucination mitigation; Q41's answer explicitly says it isn't), one muddled comparative claim (MoE "higher quality at lower per-token FLOPs than a dense model of equal size"), one self-undercutting premise (cosine vs Euclidean, which concedes they rank identically on normalized vectors and overclaims "negative = opposing meaning"), a couple of overclaims/non-sequiturs ("keeping execution deterministic and secure" for tool calling; "more reliable than raising temperature" in the JSON-structured-output answer), one jurisdiction-fragile fact (four-fifths rule applied to lending), and one time-sensitive framing (LangChain vs LlamaIndex). Plus the 6 duplicate pairs and the misfiled TensorRT-LLM question noted above.

## 5. Lab template assessment (all 5 read in full)

| Lab | Domain | Feasible on consumer HW? | Scope | Success criteria verify learning? |
|---|---|---|---|---|
| 1. Zero-shot vs few-shot | Core ML | Yes (any LLM access; local Ollama or API — access method unstated) | Good, 30 min realistic | Weak: self-declarative "I can explain..." — no artifact required |
| 2. Temperature and determinism | Core ML | Yes; needs temperature control | Tight, 20 min realistic. Nit: "temperature 0 is deterministic" glosses hosted-API/GPU non-determinism that Q64/Q99 themselves teach | Weak: self-declarative prediction ability |
| 3. LoRA vs full fine-tune VRAM | Experimentation | **Marginal**: needs a CUDA GPU + PyTorch/PEFT/bitsandbytes; the "(or whether it OOMs)" escape hatch saves it on 8–16GB cards, but no model/dataset is suggested and 60 min excludes env setup (optimistic on Windows) | Under-specified — learner must pick model + dataset | Good: concrete deliverable (param counts + where VRAM savings come from) |
| 4. ROUGE evaluation | Experimentation | Yes (`evaluate` + rouge_score); hidden task: sourcing 5–10 reference summaries (no dataset suggested, e.g., CNN/DailyMail sample) | Good, 45 min plausible | Good: requires a concrete counter-example where ROUGE disagrees with human judgment |
| 5. Tiny RAG with citations + abstention | Trustworthy AI | Yes (sentence-transformers + any vector index) | Well-scoped | **Best of the five**: artifact-verifiable — must show a cited grounded answer AND a correct abstention on an out-of-corpus question |

**Structural gaps:** Software Development (24% weight) has **zero labs** — no NVIDIA-tooling exercise (NIM/Triton via Docker, or at least the hosted NVIDIA API catalog), no tool-calling/agent lab, no quantization/serving measurement lab, despite the domain being the most hands-on by nature. Data Analysis and Visualization also has zero labs — a tokenizer-exploration lab (compare BPE/WordPiece/SentencePiece output on the same text) and an embedding-visualization (UMAP scatter) lab would be cheap and directly reinforce 9 existing questions. Both Core ML labs cluster on the single prompting objective; nothing exercises architecture/training-dynamics. Trustworthy AI lacks a bias-audit or guardrails lab. `suggested_commands` in labs 1–3 are pseudo-config, not runnable commands — fine as hints, but inconsistent with lab 4's actual Python.

## 6. Recommendations (priority order)
1. Add ~10 Core ML questions (activation functions, layer norm/residuals, softmax scaling, decoding strategies, RNN-vs-transformer, transfer learning) and ~5 Software Development questions (containers, APIs, Triton specifics, ONNX/distillation) to match weights.
2. De-duplicate the 6 near-identical pairs, or intentionally differentiate them (they currently distort domain readiness).
3. Fix Q13's temperature contradiction and the Q35 MoE wording (see suspects).
4. Move the TensorRT-LLM/Triton question from "Pre-training, inference, and scaling laws" to an SW-Dev objective.
5. Add 2 labs: an SW-Dev tool-calling or NIM/hosted-endpoint lab, and a DA&V tokenizer/embedding-visualization lab. Rewrite labs 1–2 success criteria to demand an artifact (e.g., "produce a table of 5 outputs per temperature with correctness marked").
6. Add question coverage for objective-promised topics never asked: explained-variance ratio, SentencePiece, A/B testing.