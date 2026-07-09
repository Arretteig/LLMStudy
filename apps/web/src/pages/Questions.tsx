import { useEffect, useMemo, useState } from 'react';
import type {
  AnswerAttempt,
  NewQuestionChoice,
  Objective,
  QuestionChoice,
  QuestionListItem,
} from '@llmstudy/shared';
import { groupByDomain, ObjectivePicker } from '../components/ObjectivePicker';
import {
  ChoicesEditor,
  emptyChoices,
  validateChoices,
} from '../components/ChoicesEditor';
import {
  createQuestion,
  deleteQuestion,
  getHistory,
  getQuestionChoices,
  listObjectives,
  listQuestions,
  updateQuestion,
} from '../api/client';
import { todayIso, truncate } from '../util';

const UNLINKED = 'Unlinked questions';

/** How pre-reveal confidence values read in the attempt history. */
const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'guessing',
  2: 'probably',
  3: 'sure',
};

/** Objective filter: any, unlinked-only, or a specific objective id. */
type ObjectiveFilter = 'any' | 'none' | number;
type StatusFilter = 'any' | 'due' | 'scheduled' | 'never';
type FormatFilter = 'any' | 'recall' | 'mcq';

/** Trim choice fields before they hit the API. */
function trimChoices(choices: NewQuestionChoice[]): NewQuestionChoice[] {
  return choices.map((c) => ({
    choice_text: c.choice_text.trim(),
    is_correct: c.is_correct,
    rationale: c.rationale.trim(),
  }));
}

export function QuestionsPage() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Browser filters — combined with AND.
  const [search, setSearch] = useState('');
  const [objectiveFilter, setObjectiveFilter] = useState<ObjectiveFilter>('any');
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('any');
  // Group-collapse state (by group title) + per-question attempt-history cache.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<Record<number, AnswerAttempt[]>>({});

  useEffect(() => {
    Promise.all([listObjectives(), listQuestions()])
      .then(([objs, qs]) => {
        setObjectives(objs);
        setQuestions(qs);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  function objectiveTitle(id: number | null): string | null {
    if (id === null) return null;
    return objectives.find((o) => o.id === id)?.title ?? null;
  }

  async function add(input: {
    question_text: string;
    objective_id: number | null;
    expected_answer: string;
    difficulty: number | null;
    question_format: 'recall' | 'mcq';
    choices: NewQuestionChoice[] | null;
  }) {
    const created = await createQuestion({
      question_text: input.question_text.trim(),
      objective_id: input.objective_id,
      difficulty: input.difficulty,
      question_format: input.question_format,
      ...(input.question_format === 'mcq'
        ? { choices: trimChoices(input.choices ?? []) }
        : { expected_answer: input.expected_answer.trim() || null }),
    });
    // The create response lacks the list-only fields; fill them locally.
    setQuestions((prev) => [
      ...prev,
      {
        ...created,
        objective_title: objectiveTitle(created.objective_id),
        attempt_count: 0,
        last_rating: null,
      },
    ]);
  }

  async function saveEdit(
    id: number,
    changes: {
      question_text: string;
      objective_id: number | null;
      expected_answer: string;
      difficulty: number | null;
      /** Full replacement choice set for MCQs; null for recall cards. */
      choices: NewQuestionChoice[] | null;
    },
  ) {
    const updated = await updateQuestion(id, {
      question_text: changes.question_text.trim(),
      objective_id: changes.objective_id,
      difficulty: changes.difficulty,
      ...(changes.choices !== null
        ? { choices: trimChoices(changes.choices) }
        : { expected_answer: changes.expected_answer.trim() || null }),
    });
    // Spread over the old row to keep attempt_count / last_rating intact.
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, ...updated, objective_title: objectiveTitle(updated.objective_id) }
          : q,
      ),
    );
  }

  async function remove(id: number) {
    await deleteQuestion(id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  /** Lazy-fetch a question's attempt history; cached per id for the session. */
  async function loadHistory(questionId: number) {
    if (history[questionId]) return;
    try {
      const attempts = await getHistory(questionId);
      setHistory((h) => ({ ...h, [questionId]: attempts }));
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const today = todayIso();
    return questions.filter((q) => {
      if (needle) {
        const haystack =
          `${q.question_text}\n${q.expected_answer ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (objectiveFilter === 'none') {
        if (q.objective_id !== null) return false;
      } else if (objectiveFilter !== 'any' && q.objective_id !== objectiveFilter) {
        return false;
      }
      if (difficultyFilter !== null && q.difficulty !== difficultyFilter) {
        return false;
      }
      if (formatFilter !== 'any' && q.question_format !== formatFilter) {
        return false;
      }
      if (statusFilter === 'never' && q.attempt_count > 0) return false;
      if (
        statusFilter === 'due' &&
        !(q.next_review_date !== null && q.next_review_date <= today)
      ) {
        return false;
      }
      if (
        statusFilter === 'scheduled' &&
        !(q.next_review_date !== null && q.next_review_date > today)
      ) {
        return false;
      }
      return true;
    });
  }, [questions, search, objectiveFilter, difficultyFilter, statusFilter, formatFilter]);

  const grouped = useMemo(() => groupByObjective(filtered), [filtered]);

  if (loading) return <p className="muted">Loading questions…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Questions</h1>
        <p className="muted">
          Your question bank. Recall cards run on a spaced schedule in the
          Review tab; multiple-choice questions feed Drill and mock exams.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <QuestionsSummary questions={questions} objectives={objectives} />

      <AddQuestionForm objectives={objectives} onAdd={add} onError={setError} />

      {questions.length === 0 ? (
        <p className="muted">
          No questions yet. Add one above, or run <code>npm run seed</code> to load
          the starter set.
        </p>
      ) : (
        <>
          <div className="toolbar">
            <label className="grow">
              Search
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Question or expected answer…"
              />
            </label>
            <label>
              Objective
              <select
                value={objectiveFilter === 'any' ? '' : String(objectiveFilter)}
                onChange={(e) =>
                  setObjectiveFilter(
                    e.target.value === ''
                      ? 'any'
                      : e.target.value === 'none'
                        ? 'none'
                        : Number(e.target.value),
                  )
                }
              >
                <option value="">Any objective</option>
                <option value="none">Unlinked only</option>
                {groupByDomain(objectives).map(([domain, items]) => (
                  <optgroup key={domain} label={domain}>
                    {items.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <select
                value={difficultyFilter ?? ''}
                onChange={(e) =>
                  setDifficultyFilter(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              >
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Format
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value as FormatFilter)}
              >
                <option value="any">Any</option>
                <option value="recall">Recall</option>
                <option value="mcq">MCQ</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                title="MCQs are never due or scheduled — they live in Drill and mocks"
              >
                <option value="any">Any</option>
                <option value="due">Due now</option>
                <option value="scheduled">Scheduled</option>
                <option value="never">Never attempted</option>
              </select>
            </label>
          </div>

          <div className="results-bar">
            <span className="muted small-text">
              Showing {filtered.length} of {questions.length} question
              {questions.length === 1 ? '' : 's'}
            </span>
            {grouped.length > 1 && (
              <>
                <button
                  className="btn small"
                  onClick={() =>
                    setCollapsed(
                      Object.fromEntries(grouped.map(([title]) => [title, true])),
                    )
                  }
                >
                  Collapse all
                </button>
                <button className="btn small" onClick={() => setCollapsed({})}>
                  Expand all
                </button>
              </>
            )}
          </div>

          {filtered.length === 0 && (
            <p className="muted">No questions match the current filters.</p>
          )}

          {grouped.map(([title, items]) => {
            const isCollapsed = !!collapsed[title];
            return (
              <section key={title} className="domain-group">
                <h2
                  className="domain-title group-toggle"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [title]: !isCollapsed }))
                  }
                  title={isCollapsed ? 'Expand group' : 'Collapse group'}
                >
                  <span className="group-caret">{isCollapsed ? '▸' : '▾'}</span>
                  {title} <span className="count">{items.length}</span>
                </h2>
                {!isCollapsed && (
                  <div className="obj-list">
                    {items.map((q) => (
                      <QuestionRow
                        key={q.id}
                        question={q}
                        objectives={objectives}
                        history={history[q.id]}
                        onLoadHistory={loadHistory}
                        onSave={saveEdit}
                        onDelete={remove}
                        onError={setError}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function QuestionsSummary({
  questions,
  objectives,
}: {
  questions: QuestionListItem[];
  objectives: Objective[];
}) {
  const total = questions.length;
  const linked = questions.filter((q) => q.objective_id !== null).length;
  const mcqCount = questions.filter((q) => q.question_format === 'mcq').length;
  const coveredIds = new Set(
    questions.map((q) => q.objective_id).filter((id): id is number => id !== null),
  );
  const objectivesWithout = objectives.filter((o) => !coveredIds.has(o.id)).length;

  return (
    <div className="summary">
      <Stat label="Questions" value={total} />
      {mcqCount > 0 && <Stat label="MCQs" value={mcqCount} />}
      <Stat label="Linked to objective" value={linked} />
      <Stat label="Unlinked" value={total - linked} />
      <Stat
        label="Objectives w/o questions"
        value={objectivesWithout}
        tone={objectivesWithout > 0 ? 'warn' : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'warn';
}) {
  return (
    <div className={`stat ${tone === 'warn' ? 'stat-warn' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function AddQuestionForm({
  objectives,
  onAdd,
  onError,
}: {
  objectives: Objective[];
  onAdd: (i: {
    question_text: string;
    objective_id: number | null;
    expected_answer: string;
    difficulty: number | null;
    question_format: 'recall' | 'mcq';
    choices: NewQuestionChoice[] | null;
  }) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'recall' | 'mcq'>('recall');
  const [questionText, setQuestionText] = useState('');
  const [objectiveId, setObjectiveId] = useState<number | null>(null);
  const [expected, setExpected] = useState('');
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [choices, setChoices] = useState<NewQuestionChoice[]>(emptyChoices());
  // Only surface MCQ validation errors after a submit attempt.
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setFormat('recall');
    setQuestionText('');
    setObjectiveId(null);
    setExpected('');
    setDifficulty(null);
    setChoices(emptyChoices());
    setAttempted(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!questionText.trim()) return;
    if (format === 'mcq') {
      setAttempted(true);
      if (validateChoices(choices).length > 0) return;
    }
    setSaving(true);
    try {
      await onAdd({
        question_text: questionText,
        objective_id: objectiveId,
        expected_answer: expected,
        difficulty,
        question_format: format,
        choices: format === 'mcq' ? choices : null,
      });
      reset();
      setOpen(false);
    } catch (err) {
      onError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn primary add-btn" onClick={() => setOpen(true)}>
        + Add question
      </button>
    );
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="format-toggle" role="radiogroup" aria-label="Question format">
        {(['recall', 'mcq'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`conf-chip ${format === f ? 'selected' : ''}`}
            onClick={() => setFormat(f)}
          >
            {f === 'recall' ? 'Recall' : 'Multiple choice'}
          </button>
        ))}
        <span className="muted small-text">
          {format === 'recall'
            ? 'Spaced-review card — answer from memory.'
            : 'Drill / mock-exam item — never enters the spaced queue.'}
        </span>
      </div>
      <label>
        Question
        <textarea
          autoFocus
          rows={2}
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="e.g. Why do transformers need positional encoding?"
        />
      </label>
      <div className="row gap wrap">
        <label>
          Objective
          <ObjectivePicker
            objectives={objectives}
            value={objectiveId}
            onChange={setObjectiveId}
          />
        </label>
        <label>
          Difficulty
          <DifficultySelect value={difficulty} onChange={setDifficulty} />
        </label>
      </div>
      {format === 'recall' ? (
        <label>
          Expected answer / rubric
          <textarea
            rows={3}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="What a strong answer should contain."
          />
        </label>
      ) : (
        <ChoicesEditor choices={choices} onChange={setChoices} showErrors={attempted} />
      )}
      <div className="row gap">
        <button className="btn primary" disabled={saving || !questionText.trim()}>
          {saving ? 'Saving…' : 'Save question'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function QuestionRow({
  question,
  objectives,
  history,
  onLoadHistory,
  onSave,
  onDelete,
  onError,
}: {
  question: QuestionListItem;
  objectives: Objective[];
  /** Cached attempts (newest first), or undefined while not yet fetched. */
  history: AnswerAttempt[] | undefined;
  onLoadHistory: (questionId: number) => void;
  onSave: (
    id: number,
    changes: {
      question_text: string;
      objective_id: number | null;
      expected_answer: string;
      difficulty: number | null;
      choices: NewQuestionChoice[] | null;
    },
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // MCQ-only: lazily fetched choice set (answers + rationales).
  const [choices, setChoices] = useState<QuestionChoice[] | null>(null);
  const isMcq = question.question_format === 'mcq';

  function loadChoices() {
    setRevealed(true);
    if (choices !== null) return;
    getQuestionChoices(question.id)
      .then((cs) => setChoices([...cs].sort((a, b) => a.position - b.position)))
      .catch((err) => {
        setRevealed(false); // allow a retry instead of a stuck loading state
        onError(String((err as Error).message ?? err));
      });
  }

  if (editing) {
    return (
      <QuestionEditor
        question={question}
        objectives={objectives}
        onCancel={() => setEditing(false)}
        onSave={async (changes) => {
          try {
            await onSave(question.id, changes);
            setEditing(false);
            // Drop the cached choice set — the edit may have replaced it.
            setChoices(null);
            setRevealed(false);
          } catch (err) {
            onError(String((err as Error).message ?? err));
          }
        }}
      />
    );
  }

  return (
    <div className="card question">
      <div className="q-head">
        {isMcq && (
          <span className="badge mcq" title="Multiple choice — drilled, not spaced-reviewed">
            MCQ
          </span>
        )}
        {question.difficulty != null && (
          <span className="badge diff" title={`Difficulty ${question.difficulty}/5`}>
            D{question.difficulty}
          </span>
        )}
        <p className="q-text">{question.question_text}</p>
      </div>

      <div className="muted small-text q-stats">
        attempts {question.attempt_count}
        {question.last_rating != null && <> · last rating {question.last_rating}</>}
        {question.next_review_date != null && (
          <> · next due {question.next_review_date}</>
        )}
        {choices !== null && (
          <> · {choices.length} choice{choices.length === 1 ? '' : 's'}</>
        )}
      </div>

      {isMcq ? (
        revealed ? (
          choices === null ? (
            <span className="muted small-text">Loading choices…</span>
          ) : (
            <div className="q-answer">
              <div className="q-answer-label">Choices</div>
              <ul className="mcq-choice-list">
                {choices.map((c) => (
                  <li key={c.id} className={c.is_correct ? 'mcq-correct' : ''}>
                    {c.is_correct ? '✓' : '✗'} {c.choice_text}
                    {c.rationale && (
                      <span className="muted"> — {c.rationale}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <button className="btn small" onClick={loadChoices}>
            Show choices
          </button>
        )
      ) : question.expected_answer ? (
        revealed ? (
          <div className="q-answer">
            <div className="q-answer-label">Expected answer</div>
            {question.expected_answer}
          </div>
        ) : (
          <button className="btn small" onClick={() => setRevealed(true)}>
            Show expected answer
          </button>
        )
      ) : (
        <span className="muted small-text">No expected answer recorded.</span>
      )}

      <div className="q-actions">
        {revealed && (
          <button className="btn small" onClick={() => setRevealed(false)}>
            {isMcq ? 'Hide choices' : 'Hide answer'}
          </button>
        )}
        {question.attempt_count > 0 && (
          <button
            className="btn small"
            onClick={() => {
              const next = !showHistory;
              setShowHistory(next);
              if (next) onLoadHistory(question.id);
            }}
          >
            {showHistory ? 'Hide history' : `History (${question.attempt_count})`}
          </button>
        )}
        <button className="btn small" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          className="btn small danger"
          onClick={() => {
            if (confirm('Delete this question?')) {
              onDelete(question.id).catch((err) =>
                onError(String((err as Error).message ?? err)),
              );
            }
          }}
        >
          Delete
        </button>
      </div>

      {showHistory && (
        <div className="attempt-history">
          {history === undefined ? (
            <span className="muted small-text">Loading history…</span>
          ) : history.length === 0 ? (
            <span className="muted small-text">No attempts recorded.</span>
          ) : (
            <ul className="attempt-list small-text">
              {history.map((a) => (
                <li key={a.id}>
                  <span className="muted">{a.attempted_date.slice(0, 10)}</span>
                  {' · rated '}
                  {a.rating}
                  {a.confidence != null && (
                    <> · {CONFIDENCE_LABELS[a.confidence] ?? `confidence ${a.confidence}`}</>
                  )}
                  {a.user_answer && (
                    <span className="muted"> · “{truncate(a.user_answer, 80)}”</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionEditor({
  question,
  objectives,
  onSave,
  onCancel,
}: {
  question: QuestionListItem;
  objectives: Objective[];
  onSave: (changes: {
    question_text: string;
    objective_id: number | null;
    expected_answer: string;
    difficulty: number | null;
    choices: NewQuestionChoice[] | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const isMcq = question.question_format === 'mcq';
  const [questionText, setQuestionText] = useState(question.question_text);
  const [objectiveId, setObjectiveId] = useState<number | null>(question.objective_id);
  const [expected, setExpected] = useState(question.expected_answer ?? '');
  const [difficulty, setDifficulty] = useState<number | null>(question.difficulty);
  // MCQ-only: the editable choice set, loaded from the server on mount.
  const [choices, setChoices] = useState<NewQuestionChoice[] | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isMcq) return;
    getQuestionChoices(question.id)
      .then((cs) =>
        setChoices(
          [...cs]
            .sort((a, b) => a.position - b.position)
            .map((c) => ({
              choice_text: c.choice_text,
              is_correct: c.is_correct,
              rationale: c.rationale ?? '',
            })),
        ),
      )
      .catch(() => setChoices(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!questionText.trim()) return;
    if (isMcq) {
      setAttempted(true);
      if (choices === null || validateChoices(choices).length > 0) return;
    }
    setSaving(true);
    try {
      await onSave({
        question_text: questionText,
        objective_id: objectiveId,
        expected_answer: expected,
        difficulty,
        choices: isMcq ? choices : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card add-form">
      {isMcq && (
        <span className="muted small-text">
          Multiple-choice question — the format can't be changed after creation.
        </span>
      )}
      <label>
        Question
        <textarea
          rows={2}
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
        />
      </label>
      <div className="row gap wrap">
        <label>
          Objective
          <ObjectivePicker
            objectives={objectives}
            value={objectiveId}
            onChange={setObjectiveId}
          />
        </label>
        <label>
          Difficulty
          <DifficultySelect value={difficulty} onChange={setDifficulty} />
        </label>
      </div>
      {isMcq ? (
        choices === null ? (
          <span className="muted small-text">Loading choices…</span>
        ) : (
          <ChoicesEditor choices={choices} onChange={setChoices} showErrors={attempted} />
        )
      ) : (
        <label>
          Expected answer / rubric
          <textarea
            rows={3}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </label>
      )}
      <div className="row gap">
        <button
          className="btn primary"
          onClick={save}
          disabled={saving || !questionText.trim() || (isMcq && choices === null)}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DifficultySelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">—</option>
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

function groupByObjective(
  questions: QuestionListItem[],
): [string, QuestionListItem[]][] {
  const map = new Map<string, QuestionListItem[]>();
  for (const q of questions) {
    const key = q.objective_title ?? UNLINKED;
    const list = map.get(key) ?? [];
    list.push(q);
    map.set(key, list);
  }
  // Unlinked group sorts last; everything else alphabetically.
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === UNLINKED) return 1;
    if (b === UNLINKED) return -1;
    return a.localeCompare(b);
  });
}
