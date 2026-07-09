## KEY FINDINGS
- Seed domain weights exactly match the current official blueprint (study guide r7, Jan 2025): Core ML/AI 30%, Software Development 24%, Experimentation 22%, Data Analysis 14%, Trustworthy AI 10%.
- Official logistics: 50-60 multiple-choice questions (roughly 25% multi-select per test-takers), 60 minutes, $125, Certiverse remote-proctored, pass/fail with no published cut score (community estimates 65-70%), valid 2 years, 14-day retake wait, max 5 attempts/year, no formal prerequisites.
- The full official study guide PDF was extracted verbatim: 10 Core-ML objectives, 5 Data Analysis, 5 Experimentation (a copy-paste duplicate of Data Analysis in NVIDIA's own PDF), 7 Software Development, 4 Trustworthy AI, plus suggested readings that signal testable topics (Attention Is All You Need, LoRA, ONNX, TensorRT INT8/QAT, NCCL/AllReduce, scaling laws, GLUE, RAG evaluation, A/B testing).
- Community consensus: the exam is scenario-based terminology/application, not hands-on; NVIDIA tool-purpose mapping (Triton=serving, TensorRT=optimization, NeMo=training/customization, NIM=microservices, RAPIDS/cuDF=GPU data science, ONNX=interop, plus NGC/MIG/Base Command/AI Enterprise) is the most distinctive and score-rich section.
- Over-represented vs expectations: classic NLP preprocessing (lemmatization, WordNet vs word2vec, spaCy), RAG ('a RAG answer is probably correct'), evaluation metrics (BLEU/ROUGE/perplexity/F1), LLMOps monitoring, and some multimodal questions; under-represented: attention math derivations, NeMo YAML minutiae, H100/H200 hardware specs, CUDA code.
- Prep consensus: official DLI courses + practice exams (rated most useful; aim ~90% on practice), 4-6 weeks study for ML-background candidates, up to 3 months casual or 8-10 weeks for newcomers.
- The report includes a granular per-domain checklist with [O]fficial vs [C]ommunity confidence tags suitable for auditing the 100-question bank, plus 6 concrete audit implications.

---

# NVIDIA NCA-GENL Exam Research Report

Research date: 2026-07-09. Sources: official NVIDIA certification page, the official Exam Study Guide PDF (extracted in full), NVIDIA program FAQ, and 8+ community sources (NVIDIA Developer Forums, LinkedIn/Medium test-taker writeups, GitHub cheat sheet, prep-course curricula).

---

## 1. Official Exam Logistics

| Attribute | Value | Source |
|---|---|---|
| Exam name | NVIDIA-Certified Associate: Generative AI LLMs (NCA-GENL) | Official cert page |
| Questions | **50–60 multiple-choice** (official page); program FAQ says NVIDIA exams "contain between 40 and 60 questions"; community consistently reports ~50 questions, roughly **75% single-choice / 25% multi-select ("choose two")** | Official page + program FAQ + DolbyUUU cheat sheet, wellstsai |
| Duration | **60 minutes** (official: "1 hour") | Official cert page |
| Price | **$125 USD** (community notes occasional 50% promos, free vouchers at GTC) | Official cert page; wellstsai |
| Delivery | Online, remote-proctored via **Certiverse** (NVIDIA Authorized Testing Partner); secure browser, video/audio/screen monitoring | Official cert page + program page |
| Format | Scenario-based multiple choice; **no hands-on lab component** | Official + NVIDIA forums |
| Passing | **Pass/fail; NVIDIA publishes no numeric cut score and no score report.** Community estimates converge on ~65–70% | NVIDIA program FAQ; community |
| Validity | **2 years** from issuance; recertify by retaking | Official cert page |
| Retakes | 14-day wait between attempts; max **5 attempts per 12 months**; each attempt purchased separately | NVIDIA program FAQ |
| Prerequisites | None formal; "a basic understanding of generative AI and large language models" recommended | Official cert page |
| Languages | English (community reports Simplified Chinese also available) | Official page; wellstsai |
| Credential | Digital badge via Credly within ~24h, optional certificate | NVIDIA program FAQ |
| Level / audience | Associate (entry-level); AI DevOps engineers, data scientists, ML engineers, software engineers, solutions architects, GenAI specialists | Official cert page |

### Blueprint version and domain weights — VERIFIED ✅
Current official study guide: **"NVIDIA-Certified Associate: Generative AI LLM Exam Study Guide", revision r7, © 2025 NVIDIA, footer code "3639250. Jan25"** (PDF: `https://nvdam.widen.net/s/rpdddpdgtc/nvt-certification-exam-study-guide-gen-ai-llm-3262644-r7-web`).

Weights in both the study guide and the live cert page **exactly match the seed data**:

| Domain | Official weight | Seed weight | Match |
|---|---|---|---|
| Core Machine Learning and AI Knowledge | 30% | 30% | ✅ |
| Software Development | 24% | 24% | ✅ |
| Experimentation | 22% | 22% | ✅ |
| Data Analysis (cert page: "Data Analysis and Visualization") | 14% | 14% | ✅ |
| Trustworthy AI | 10% | 10% | ✅ |

Naming nit: the PDF titles the 14% domain **"Data Analysis"**; the web page's topics list says "data analysis and visualization." The seed's name is fine.

⚠️ Quirk in the official guide: the **Experimentation objectives (3.1–3.5) are verbatim identical to the Data Analysis objectives (2.1–2.5)** — apparently a copy-paste artifact in NVIDIA's own PDF. The real differentiation comes from the domain description ("how to perform, evaluate, and interpret experiments, including AI model evaluation and the use of human subjects in labeling or RLHF") and its suggested-readings list.

⚠️ Source-reliability note: examcert.app's "2026 guide" claims 60 Q / 90 min / Pearson VUE / $300 / 3-year validity / 6 domains — **all contradicted by NVIDIA's own pages**; likely AI-generated or conflated with another exam. Its logistics were discarded; its content observations (below) align with other sources and are cited only where corroborated. FlashGenius's "10 domains / 70% passing" is that vendor's own practice-test taxonomy, not the official blueprint.

---

## 2. Official Topic List (full extraction from the r7 Study Guide PDF)

### Job-role framing (guide, verbatim highlights)
The target role "contributes to development, programming, and QA of generative AI LLM systems": develops datasets; selects models; trains models; implements testing/debugging; understands deployment; performs **prompt engineering**; **defines, curates, labels, and annotates LLM datasets**; performs **experimentation like A/B testing, evaluating prompts, evaluating models, and producing POCs**. Assumed background: Python, C, PyTorch/TensorFlow, neural nets/deep learning.

### Domain 1 — Core Machine Learning and AI Knowledge (30%)
Official objectives (verbatim):
- 1.1 Assist in deployment and evaluation of model scalability, performance, and reliability (supervised)
- 1.2 Awareness of extracting insights from large datasets via data mining, data visualization, and similar techniques
- 1.3 Build LLM use cases such as **retrieval-augmented generation (RAG), chatbots, and summarizers**
- 1.4 **Curate and embed content datasets for RAGs**
- 1.5 Fundamentals of ML (feature engineering, model comparison, cross-validation)
- 1.6 Capabilities of Python NL packages (**spaCy, NumPy, vector databases**, etc.)
- 1.7 Read research papers to identify emerging LLM trends/technologies
- 1.8 **Select and use models to create text embeddings**
- 1.9 Use **prompt engineering principles** to achieve desired results
- 1.10 Use Python packages (spaCy, NumPy, Keras, etc.) for traditional ML analyses

Official course-objective signals: deep-learning training fundamentals; common data types/architectures; **transfer learning**; transformers as LLM building blocks; **self-supervision in BERT, Megatron and variants**; XGBoost; graph algorithms (NetworkX, cuGraph); iterative prompt engineering; **encoder models for semantic analysis, embedding, QA, zero-shot classification**; conditioned decoder models.

Official suggested readings (= testable concept signals): *Attention Is All You Need*; ONNX model transitioning; "Generative AI — What Is It and How Does It Work?"; **Activation Function**; **Feature engineering for text data**; **Autoregressive Model**; **What Are Foundation Models?**; **LoRA: Low-Rank Adaptation of LLMs**; **diffusion-based models** (Demystifying Diffusion); **backpropagation**.

### Domain 2 — Data Analysis (14%)
Official objectives (verbatim):
- 2.1 Awareness of extracting insights from large datasets (data mining, data visualization, etc.)
- 2.2 **Compare models using statistical performance metrics such as loss functions or proportion of explained variance**
- 2.3 Conduct data analysis (supervised)
- 2.4 **Create graphs, charts, or other visualizations** to convey analysis results using specialized software
- 2.5 **Identify relationships and trends or any factors that could affect research results**

Course-objective signals: **data augmentation**; transformer text classification; **NER**; author attribution; question-answering; **LangChain** workflow composition; LangChain + **LangGraph** for pipelines/agents; **cuDF accelerating pandas, Polars, and Dask**.
Suggested readings: **RAPIDS**; **cuML docs**; GPU-accelerated data science with RAPIDS; Data Exploration; **Stemming and Lemmatizing with sklearn Vectorizers**.

### Domain 3 — Experimentation (22%)
Domain description: performing/evaluating/interpreting experiments, **AI model evaluation**, and **human subjects in labeling or RLHF**. (Objectives 3.1–3.5 duplicate 2.1–2.5 verbatim — see quirk above.)

Course-objective signals: transfer learning; experimenting with transformer models across NLP tasks; **test and compare model performance on question-answering**; graph algorithms; **Hugging Face model repository and Transformers API**; LangChain.
Suggested readings (high-signal): **How to Conduct A/B Testing in ML**; **Inference Optimization**; **Zero-Shot Testing**; Speech and Language Processing; **Machine Translation methods**; **Hallucinations in LLMs**; **GLUE (General Language Understanding Evaluation)**; **Evaluating RAG Applications**; **Cross-Validation in ML**; Benchmarking Elementary Language Tasks.

### Domain 4 — Software Development (24%)
Official objectives (verbatim):
- 4.1 Assist in deployment and evaluation of model scalability, performance, and reliability (supervised)
- 4.2 Build LLM use cases: **RAGs, chatbots, summarizers**
- 4.3 Capabilities of Python NL packages (spaCy, NumPy, **vector databases**)
- 4.4 **Identify system data, hardware, or software components required to meet user needs**
- 4.5 **Monitor functioning of data collection, experiments, and other software processes**
- 4.6 Python packages for traditional ML analyses
- 4.7 Write software components or scripts (supervised)

Course-objective signals: **manage inference challenges, deploy refined models for live applications**; **deploy ML models on Triton Inference Server**; write application code harnessing LLMs (generative tasks, document analysis, chatbots).
Suggested readings: **TensorRT Get Started**; **Best Practices — NVIDIA NeMo**; **Mastering LLM Techniques: Customization**; **FP32 accuracy for INT8 inference via Quantization-Aware Training with TensorRT**; **NCCL multi-GPU collective communications**; **AllReduce / Ring-AllReduce distributed training** (two readings); Hugging Face datasets for big data; **"Deep Learning Scaling Is Predictable, Empirically" (scaling laws)**; **BERT paper**.

### Domain 5 — Trustworthy AI (10%)
Domain description: ethical, **energy-conscious**, reliable AI; transparent, fair, verifiable design.
Official objectives (verbatim):
- 5.1 Describe the **ethical principles of trustworthy AI**
- 5.2 Describe the **balance between data privacy and the importance of data consent**
- 5.3 Describe **how to use NVIDIA and other technologies to improve AI trustworthiness**
- 5.4 Describe **how to minimize bias in AI systems**

Suggested readings: Trustworthy AI for a Better World; What Is Trustworthy AI? (NVIDIA blog); What Is Retrieval-Augmented Generation aka RAG?

### Official recommended training (cert page)
Getting Started With Deep Learning ($90/8h) or Fundamentals of Deep Learning (workshop $500); Accelerating End-to-End Data Science Workflows ($90) or Fundamentals of Accelerated Data Science (workshop); Introduction to Transformer-Based NLP ($30/6h); Building Transformer-Based NLP Applications (workshop); Building LLM Applications With Prompt Engineering ($90 or workshop); Rapid Application Development With LLMs ($90 or workshop).

---

## 3. Community Intelligence (what actually appears)

Primary first-hand sources: wellstsai.com passing writeup (GTC 2026-era, very detailed notes), NVIDIA Developer Forums thread (user jhonm5288, passed), LinkedIn writeup (Peter McCormack, passed Nov 2025), DolbyUUU GitHub cheat sheet, Medium 5-part series (Roan Brasil Monteiro, May 2026).

### NVIDIA stack — confirmed to appear, mostly as "which tool for which job" questions
Called "one of the easiest scoring areas" (wellstsai). Tested at role/purpose level, not config minutiae:
- **Triton Inference Server** — why/when: dynamic batching, concurrent multi-model, multi-framework serving (forums: "Triton questions were mostly about why/when to use it")
- **TensorRT / TensorRT-LLM** — inference optimization: quantization, layer fusion, latency reduction; "Triton hosts inference; TensorRT optimizes computation"
- **NeMo framework** — end-to-end GenAI training/customization, native LoRA; forum poster says know "the structure of a NeMo model config, how training/inference works, and what each component does" (scenario questions: given a NeMo config/pipeline, what's wrong / what changes / expected output) — though McCormack over-studied NeMo YAML details and saw none
- **NeMo Guardrails** (safety/hallucination/jailbreak) and **NeMo Retriever** (enterprise RAG retrieval)
- **NIM (NVIDIA Inference Microservices)** — models packaged as standardized API microservices
- **RAPIDS: cuDF, cuML** — GPU-accelerated pandas/scikit-learn equivalents
- **ONNX** — cross-framework interoperability
- **MIG** (GPU partitioning), **NGC Catalog**, **NVIDIA AI Enterprise**, **Base Command** (DGX cluster mgmt), DGX — all reported by wellstsai
- **CUDA** — high-level only: "don't stress about code, just know what GPU acceleration enables and when it matters" (forums)

### Transformer depth
Conceptual, not mathematical. Q/K/V roles, scaled dot-product intuition (why divide by √d_k), multi-head vs single-head rationale, positional encoding, layer norm, BERT (encoder-only) vs GPT (decoder-only) vs T5 (enc-dec) task mapping, autoregressive generation, temperature, beam search. McCormack: detailed self-attention walkthroughs "never came up"; Monteiro counters that conceptual theory is what separates pass from fail.

### Confirmed recurring topics
- **RAG — heavily featured.** McCormack: "anytime a scenario answer suggests 'creating a RAG model' — that's probably the correct answer." Workflow/ordering questions (embed → store → retrieve → augment → generate), chunking, vector DBs, RAG-vs-fine-tuning trade-offs, RAG as hallucination mitigation.
- **Fine-tuning / PEFT**: full FT vs LoRA vs adapters vs prompt/p-tuning; QLoRA mentioned by prep guides; catastrophic forgetting; NeMo's LoRA support.
- **Prompt engineering**: zero-shot, few-shot/in-context, chain-of-thought, system prompts.
- **Alignment**: RLHF 3-stage pipeline (SFT → reward model → RL); DPO appears in prep material.
- **Evaluation metrics — over-represented vs expectations**: perplexity (lower better), BLEU (n-gram overlap, translation — "measures similarity, not vocabulary size"), ROUGE (summarization/recall), F1 (imbalanced data), accuracy, cosine similarity, GLUE; loss functions and explained variance for model comparison.
- **Classic NLP preprocessing — a reported surprise (more than expected)**: lemmatization vs stemming, subword tokenization, **WordNet vs word2vec**, **spaCy**, lexical diversity vs syntactic complexity (McCormack).
- **Experimentation**: A/B testing (50/50 split), cross-validation, EDA before fine-tuning, hyperparameter tuning.
- **Distributed training**: All-Reduce/NCCL concept-level; scaling laws; dropout.
- **Trustworthy AI**: hallucination mitigation, RLHF, bias/fairness, explainability, robustness, data privacy/consent, **content credentials / C2PA** (wellstsai flags this specifically).

### Surprises / over-represented (per test-takers)
- LLMOps: **monitoring and production scaling** (forums — maps to official objective 4.5)
- **Multi-modal models** getting a few questions (forums; official guide only hints via diffusion-model reading)
- NLP/text-processing volume (McCormack)
- NVIDIA ecosystem breadth — "beyond just CUDA is essential" (cheat sheet); it's the hardest-rated section (★★★ vs ★★ for fundamentals)

### Under-represented / wasted study effort (per test-takers)
- Deep attention math derivations (McCormack)
- NeMo YAML config minutiae (McCormack; mild tension with the forums poster — keep coverage conceptual)
- GPU hardware SKUs: H100/H200/GH200 specifics — "none of it came up"
- CUDA programming/code
- Anything hands-on: exam is 100% scenario multiple-choice

### Overall character
"Not extremely difficult... relies on terminology understanding and tool-application scenarios" (wellstsai, finished in 20–30 min). "Applied understanding over pure theory... don't memorize, focus on understanding why" (forums). "80%+ of questions center on core concepts" (wellstsai).

---

## 4. Prep Resources and Study Time

**Official**: study guide PDF (r7); the 6 DLI courses listed above ($30–$500); NVIDIA blogs on LLMs/RAG; "The Fast Path to Developing With LLMs" video.
**Community favorites**: practice exams rated the single most useful prep (McCormack did 4 sets 2–3× each, said real questions were "very similar"; aim ~90% on practice, or 72%+ per Preporato); Coursera "Exam Prep (NCA-GENL)" 6-course specialization (~26h content: ML fundamentals, DL, NLP/transformers, LLM deployment/PEFT/ONNX, prompt engineering + p-tuning + RAG + data analysis, experimentation/A-B testing/BioNeMo-Triton-TensorRT/ethical AI); Udemy courses (~16h; McCormack: only 60–70% exam-relevant); DolbyUUU GitHub cheat sheet (EN/中文); wellstsai notes; Hugging Face NLP course ch. 1–4; CertBoosters/other question banks; NeMo GitHub + GTC talks (forums).
**Study duration reports**: ~4–6 weeks part-time is the modal recommendation for people with Python/ML background (Whizlabs, Preporato); ~3 months casual (McCormack); 8–10 weeks if new to ML; experienced LLM practitioners report passing with days of review (wellstsai's "20-minute guide" framing, GTC voucher crowd).

---

## 5. PER-DOMAIN TOPIC CHECKLIST (for question-bank audit)

Confidence key: **[O]** = official study guide/cert page objective or suggested reading; **[OC]** = official DLI course objective cited in the study guide (strong signal); **[C]** = community/test-taker reported; **[C-]** = weak/single low-quality source.

### Domain 1 — Core Machine Learning and AI Knowledge (30%)
- [O] ML fundamentals: feature engineering; model comparison; cross-validation
- [O] Traditional ML with Python (spaCy, NumPy, Keras); [OC] XGBoost; [OC] graph analytics (NetworkX, cuGraph)
- [O] Neural-net training: backpropagation; activation functions (ReLU/GELU); loss functions; [C] dropout/regularization; [OC] transfer learning
- [O+C] Transformer architecture: self-attention Q/K/V (query seeks, key matches, value carries); scaled dot-product (÷√d_k rationale); multi-head attention (why multiple heads); positional encoding; layer normalization — conceptual depth, not derivations
- [O+C] Architecture families and task mapping: BERT encoder-only/bidirectional/classification; GPT decoder-only/generation; T5 encoder-decoder/text-to-text; [OC] Megatron; [O] self-supervision/pretraining objectives
- [O] Autoregressive models; foundation models; [O] diffusion models (awareness); [C] multimodal models (awareness — appeared for some)
- [O] Text embeddings: selecting embedding models; word embeddings/semantic vectors; [C] cosine similarity; [O] vector databases
- [O] RAG as a use case: curating + embedding datasets for RAG; chatbots; summarizers; [C] "RAG is usually the right answer" scenario pattern
- [O] Prompt engineering principles: [C] zero-shot; few-shot/in-context learning; chain-of-thought; system prompts; [OC] iterative prompt refinement
- [C] Alignment: RLHF (SFT → reward model → PPO/RL); DPO (prep-material level)
- [O] LoRA (official reading); [C] PEFT family: adapters, prompt tuning, p-tuning, full fine-tuning trade-offs; catastrophic forgetting
- [C] Tokenization: subword (BPE/WordPiece) rationale; vocabulary-size trade-offs
- [C] Decoding: beam search vs greedy; temperature/sampling
- [O] Reading research literature / emerging LLM trends (e.g., knowing landmark papers: Attention Is All You Need, BERT, LoRA, scaling laws)

### Domain 2 — Data Analysis and Visualization (14%)
- [O] Data mining / extracting insights from large datasets
- [O] Statistical model comparison: loss functions; proportion of explained variance
- [O] Creating graphs/charts/visualizations to communicate results ("specialized software" — expect matplotlib/pandas-level and chart-choice questions)
- [O] Identifying relationships, trends, confounding factors in research results
- [O] EDA / data exploration; [C] EDA as a required pre-fine-tuning step (distribution, length, vocabulary, label balance)
- [O] Stemming vs lemmatization (sklearn vectorizers); [C] WordNet vs word2vec; spaCy usage; lexical diversity vs syntactic complexity — community says classic-NLP volume exceeds expectations
- [O+C] RAPIDS: cuDF (accelerates pandas/Polars/Dask), cuML (sklearn-like), GPU data-science rationale
- [OC] Data augmentation for dataset improvement
- [OC] Applied NLP analysis tasks: text classification, NER, question-answering, author attribution
- [OC] LangChain (and LangGraph) for organizing data pipelines and LLM workflows

### Domain 3 — Experimentation (22%)
- [O] A/B testing in ML ([C] 50/50 traffic split detail); evaluating prompts and models; producing POCs
- [O] Cross-validation methodology
- [O+C] Evaluation metrics — heavily tested: perplexity; BLEU (translation, n-gram precision); ROUGE (summarization, recall/coverage); F1/precision/recall (imbalanced data); accuracy; [O] GLUE benchmark; [O] machine-translation evaluation methods
- [O] Evaluating RAG applications (retrieval quality + generation quality)
- [O] Zero-shot testing/classification
- [O] Hallucinations in LLMs — detection and causes
- [O] Inference optimization concepts (latency/throughput trade-offs)
- [O] Human-in-the-loop: data labeling/annotation; RLHF as experimental process (domain description)
- [OC] Hugging Face model hub + Transformers API for experiments; QA-task performance comparison
- [OC] Transfer-learning experiments; [C] hyperparameter tuning
- [O-quirk] Officially shares objectives 2.1–2.5 (data mining, statistical comparison, visualization of results, trend identification) — bank may legitimately double-cover these here

### Domain 4 — Software Development (24%)
- [O] Deployment + evaluation of model scalability, performance, reliability
- [O] Building LLM applications: RAG pipelines, chatbots, summarizers, document analysis
- [O] Identifying system/data/hardware/software requirements for user needs
- [O+C] Monitoring data collection, experiments, software processes — [C] LLMOps/production monitoring reported as a surprise topic
- [O] Writing software components/scripts; Python NLP package capabilities; vector databases
- [O+C] **Triton Inference Server**: dynamic batching, concurrent model execution, multi-framework serving — when/why questions
- [O+C] **TensorRT / TensorRT-LLM**: layer fusion, quantization (INT8/FP8/FP16), QAT for INT8 with FP32-level accuracy, latency optimization; "quantization saves memory/latency, not accuracy"
- [O+C] **NeMo**: end-to-end training/customization framework, LoRA support, best practices; [C] conceptual config/pipeline structure (what each component does)
- [C] **NIM**: models as standardized inference microservices (post-dates guide r7 but confirmed appearing)
- [C] NeMo Guardrails (safety) and NeMo Retriever (RAG retrieval) as ecosystem components
- [O] **ONNX**: cross-framework model interoperability/transitioning
- [O] Distributed training: NCCL; AllReduce / Ring-AllReduce gradient synchronization; multi-GPU concepts
- [O] Scaling laws ("Deep Learning Scaling Is Predictable, Empirically")
- [O] LLM customization landscape (Mastering LLM Techniques: prompt eng → PEFT → full FT spectrum)
- [OC] LangChain application code for generative tasks
- [O] Hugging Face datasets / big-data handling
- [C] CUDA at concept level only: what GPU acceleration enables, when it matters (no code)
- [C] Broader NVIDIA platform mapping: NGC Catalog (model/software repo), NVIDIA AI Enterprise (supported cloud-native platform), MIG (GPU partitioning), Base Command (DGX cluster mgmt), DGX systems
- [C] Trade-off reasoning patterns: FP16 vs INT8; RAG vs fine-tuning; Triton-vs-TensorRT role split

### Domain 5 — Trustworthy AI (10%)
- [O] Ethical principles of trustworthy AI (NVIDIA's framing: privacy, safety & security, transparency, non-discrimination/fairness)
- [O] Data privacy vs data consent balance
- [O] NVIDIA + other technologies for trustworthiness — [C] NeMo Guardrails; [C] content credentials / **C2PA** provenance standard (specifically reported)
- [O] Minimizing bias: dataset bias sources, fairness metrics, EDA for bias detection
- [O+C] Hallucination mitigation strategies (RAG, guardrails, grounding)
- [C] RLHF as alignment/safety mechanism
- [C] Explainability (high-stakes domains: healthcare/finance); robustness to noise/adversarial inputs
- [O] Energy-conscious AI (in official domain description; rarely reported in questions)
- [C-] Prompt-injection awareness (prep-guide level only)

---

## 6. Audit Implications for the LLMStudy Question Bank

1. Seed domain weights are exactly correct against blueprint r7 — no rebalancing needed.
2. Highest-leverage additions if missing: NVIDIA tool-purpose mapping questions (Triton vs TensorRT vs NeMo vs NIM vs RAPIDS vs ONNX vs NGC/MIG/Base Command) — community calls this both the hardest section and the easiest scoring once memorized.
3. Ensure metric-discrimination items (BLEU vs ROUGE vs perplexity vs F1; loss vs explained variance) and RAG-workflow-ordering items.
4. Keep transformer items conceptual (why multi-head, Q/K/V roles, arch-to-task mapping) rather than derivations; avoid GPU hardware SKU trivia and CUDA code.
5. Include the community-surprise topics: classic NLP preprocessing (lemmatization, WordNet vs word2vec, spaCy), LLMOps monitoring, multimodal awareness, C2PA/content credentials, A/B testing mechanics.
6. Question style to mirror: scenario-based single-best-answer plus some choose-two items.

## Sources
- Official cert page: https://www.nvidia.com/en-us/learn/certification/generative-ai-llm-associate/
- Official Exam Study Guide PDF (r7, Jan25): https://nvdam.widen.net/s/rpdddpdgtc/nvt-certification-exam-study-guide-gen-ai-llm-3262644-r7-web (direct PDF: https://nvdam.widen.net/content/fbzbnuylhy/original/nvt-certification-exam-study-guide-gen-ai-llm-3262644-r7-web.pdf)
- NVIDIA certification program page/FAQ: https://www.nvidia.com/en-us/learn/certification/
- wellstsai passing guide + notes: https://wellstsai.com/en/post/nvidia-nca-genl-exam-study-guide/
- NVIDIA Developer Forums thread: https://forums.developer.nvidia.com/t/anyone-recently-pass-nca-genl-how-practical-is-the-nvidia-llm-exam-really/334081
- LinkedIn test-taker writeup (McCormack): https://www.linkedin.com/pulse/from-curious-certified-my-experience-nvidia-nca-genl-exam-mccormack-5qoge
- DolbyUUU cheat sheet: https://github.com/DolbyUUU/Cheat-Sheet-for-NVIDIA-Certified-Associate-Generative-AI-LLMs-NCA-GENL-
- Medium 5-part series (Monteiro): https://medium.com/@roanmonteiro/nca-genl-part-1-5-core-ml-ai-knowledge-nvidia-certification-59c13d4eb521
- Coursera exam-prep specialization: https://www.coursera.org/specializations/exam-prep-nca-genl-nvidia-certified-generative-ai-llms-associate
- Preporato guide: https://preporato.com/certifications/nvidia/generative-ai-llm-associate/articles/nvidia-nca-genl-certification-complete-guide-2025
- Flagged-unreliable for logistics: https://www.examcert.app/blog/nvidia-generative-ai-certification-guide-2026/ ; non-official taxonomy: https://flashgenius.net/certification/nca-genl