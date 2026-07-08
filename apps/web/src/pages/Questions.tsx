import { useEffect, useMemo, useState } from 'react';
import type {
  Objective,
  RecallQuestionWithObjective,
} from '@llmstudy/shared';
import { ObjectivePicker } from '../components/ObjectivePicker';
import {
  createQuestion,
  deleteQuestion,
  listObjectives,
  listQuestions,
  updateQuestion,
} from '../api/client';

const UNLINKED = 'Unlinked questions';

export function QuestionsPage() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [questions, setQuestions] = useState<RecallQuestionWithObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }) {
    const created = await createQuestion({
      question_text: input.question_text.trim(),
      objective_id: input.objective_id,
      expected_answer: input.expected_answer.trim() || null,
      difficulty: input.difficulty,
    });
    // The create response lacks objective_title; fill it from local objectives.
    setQuestions((prev) => [
      ...prev,
      { ...created, objective_title: objectiveTitle(created.objective_id) },
    ]);
  }

  async function saveEdit(
    id: number,
    changes: {
      question_text: string;
      objective_id: number | null;
      expected_answer: string;
      difficulty: number | null;
    },
  ) {
    const updated = await updateQuestion(id, {
      question_text: changes.question_text.trim(),
      objective_id: changes.objective_id,
      expected_answer: changes.expected_answer.trim() || null,
      difficulty: changes.difficulty,
    });
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...updated, objective_title: objectiveTitle(updated.objective_id) }
          : q,
      ),
    );
  }

  async function remove(id: number) {
    await deleteQuestion(id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  const grouped = useMemo(() => groupByObjective(questions), [questions]);

  if (loading) return <p className="muted">Loading questions…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Recall Questions</h1>
        <p className="muted">
          Your active-recall bank. Read a question, answer it out loud or in
          writing, then reveal the expected answer to check yourself. Self-scoring
          and a spaced-review queue arrive in the next milestone.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <QuestionsSummary questions={questions} objectives={objectives} />

      <AddQuestionForm objectives={objectives} onAdd={add} onError={setError} />

      {questions.length === 0 && (
        <p className="muted">
          No questions yet. Add one above, or run <code>npm run seed</code> to load
          the starter set.
        </p>
      )}

      {grouped.map(([title, items]) => (
        <section key={title} className="domain-group">
          <h2 className="domain-title">
            {title} <span className="count">{items.length}</span>
          </h2>
          <div className="obj-list">
            {items.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                objectives={objectives}
                onSave={saveEdit}
                onDelete={remove}
                onError={setError}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function QuestionsSummary({
  questions,
  objectives,
}: {
  questions: RecallQuestionWithObjective[];
  objectives: Objective[];
}) {
  const total = questions.length;
  const linked = questions.filter((q) => q.objective_id !== null).length;
  const coveredIds = new Set(
    questions.map((q) => q.objective_id).filter((id): id is number => id !== null),
  );
  const objectivesWithout = objectives.filter((o) => !coveredIds.has(o.id)).length;

  return (
    <div className="summary">
      <Stat label="Questions" value={total} />
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
  }) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [objectiveId, setObjectiveId] = useState<number | null>(null);
  const [expected, setExpected] = useState('');
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setQuestionText('');
    setObjectiveId(null);
    setExpected('');
    setDifficulty(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!questionText.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        question_text: questionText,
        objective_id: objectiveId,
        expected_answer: expected,
        difficulty,
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
      <label>
        Expected answer / rubric
        <textarea
          rows={3}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="What a strong answer should contain."
        />
      </label>
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
  onSave,
  onDelete,
  onError,
}: {
  question: RecallQuestionWithObjective;
  objectives: Objective[];
  onSave: (
    id: number,
    changes: {
      question_text: string;
      objective_id: number | null;
      expected_answer: string;
      difficulty: number | null;
    },
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);

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
        {question.difficulty != null && (
          <span className="badge diff" title={`Difficulty ${question.difficulty}/5`}>
            D{question.difficulty}
          </span>
        )}
        <p className="q-text">{question.question_text}</p>
      </div>

      {question.expected_answer ? (
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
            Hide answer
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
    </div>
  );
}

function QuestionEditor({
  question,
  objectives,
  onSave,
  onCancel,
}: {
  question: RecallQuestionWithObjective;
  objectives: Objective[];
  onSave: (changes: {
    question_text: string;
    objective_id: number | null;
    expected_answer: string;
    difficulty: number | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [questionText, setQuestionText] = useState(question.question_text);
  const [objectiveId, setObjectiveId] = useState<number | null>(question.objective_id);
  const [expected, setExpected] = useState(question.expected_answer ?? '');
  const [difficulty, setDifficulty] = useState<number | null>(question.difficulty);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!questionText.trim()) return;
    setSaving(true);
    try {
      await onSave({
        question_text: questionText,
        objective_id: objectiveId,
        expected_answer: expected,
        difficulty,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card add-form">
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
      <label>
        Expected answer / rubric
        <textarea
          rows={3}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
      </label>
      <div className="row gap">
        <button className="btn primary" onClick={save} disabled={saving || !questionText.trim()}>
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
  questions: RecallQuestionWithObjective[],
): [string, RecallQuestionWithObjective[]][] {
  const map = new Map<string, RecallQuestionWithObjective[]>();
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
