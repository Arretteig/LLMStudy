import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DrillAnswerResult, DrillQuestion, Objective } from '@llmstudy/shared';
import { getDrillQuestions, listObjectives, submitDrillAnswer } from '../api/client';
import { ChoiceFeedback } from '../components/ChoiceFeedback';
import { ErrorLogDialog, type ErrorLogTarget } from '../components/ErrorLogDialog';
import { ObjectivePicker } from '../components/ObjectivePicker';
import { truncate } from '../util';

/** The filters a batch was started with — kept so Restart reuses them. */
interface DrillScope {
  domain: string | null;
  objectiveId: number | null;
  limit: number;
}

interface MissedItem {
  question: DrillQuestion;
  result: DrillAnswerResult;
}

type Phase = 'setup' | 'running' | 'summary';

export function DrillPage() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Setup-bar fields.
  const [domain, setDomain] = useState('');
  const [objectiveId, setObjectiveId] = useState<number | null>(null);
  const [limit, setLimit] = useState(10);
  const [starting, setStarting] = useState(false);
  const [emptyScope, setEmptyScope] = useState(false);

  // Batch state.
  const [phase, setPhase] = useState<Phase>('setup');
  const [scope, setScope] = useState<DrillScope | null>(null);
  const [questions, setQuestions] = useState<DrillQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [missed, setMissed] = useState<MissedItem[]>([]);
  // Source-MCQ ids already turned into recall cards (double-add guard).
  const [addedCards, setAddedCards] = useState<Set<number>>(new Set());
  const [errorLog, setErrorLog] = useState<ErrorLogTarget | null>(null);

  useEffect(() => {
    listObjectives()
      .then(setObjectives)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const domains = useMemo(
    () =>
      Array.from(
        new Set(objectives.map((o) => o.domain).filter((d): d is string => !!d)),
      ).sort((a, b) => a.localeCompare(b)),
    [objectives],
  );
  const scopedObjectives = useMemo(
    () => (domain ? objectives.filter((o) => o.domain === domain) : objectives),
    [objectives, domain],
  );

  async function start(s: DrillScope) {
    setStarting(true);
    setError(null);
    setEmptyScope(false);
    try {
      const batch = await getDrillQuestions({
        domain: s.domain ?? undefined,
        objective_id: s.objectiveId ?? undefined,
        limit: s.limit,
      });
      if (batch.length === 0) {
        setEmptyScope(true);
        setPhase('setup');
        return;
      }
      setScope(s);
      setQuestions(batch);
      setIndex(0);
      setAnsweredCount(0);
      setCorrectCount(0);
      setSkippedCount(0);
      setMissed([]);
      setErrorLog(null);
      setPhase('running');
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setStarting(false);
    }
  }

  async function submitAnswer(
    q: DrillQuestion,
    selectedIds: number[],
  ): Promise<DrillAnswerResult> {
    const result = await submitDrillAnswer({
      question_id: q.id,
      selected_choice_ids: selectedIds,
    });
    setAnsweredCount((n) => n + 1);
    if (result.correct) setCorrectCount((n) => n + 1);
    else setMissed((m) => [...m, { question: q, result }]);
    return result;
  }

  function next() {
    if (index + 1 >= questions.length) setPhase('summary');
    else setIndex((i) => i + 1);
  }

  function skip() {
    setSkippedCount((n) => n + 1);
    next();
  }

  function openErrorLog(q: DrillQuestion, result: DrillAnswerResult) {
    setErrorLog({
      questionId: q.id,
      questionText: q.question_text,
      objectiveId: q.objective_id,
      objectiveTitle: q.objective_title,
      correctChoices: result.choices.filter((c) => c.is_correct),
    });
  }

  const current = questions[index];

  return (
    <div>
      <div className="page-head">
        <h1>Drill</h1>
        <p className="muted">
          Untimed multiple-choice practice with full rationales after every
          answer. Drilling never touches your spaced-review schedule.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      {phase === 'setup' && (
        <>
          <form
            className="card drill-setup"
            onSubmit={(e) => {
              e.preventDefault();
              void start({
                domain: domain || null,
                objectiveId,
                limit: Math.max(1, Math.min(50, limit)),
              });
            }}
          >
            <div className="row gap wrap">
              <label>
                Domain
                <select
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    setObjectiveId(null);
                  }}
                >
                  <option value="">All domains</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Objective
                <ObjectivePicker
                  objectives={scopedObjectives}
                  value={objectiveId}
                  onChange={setObjectiveId}
                />
              </label>
              <label>
                Batch size
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 10)}
                  className="drill-limit"
                />
              </label>
              <button className="btn primary drill-start" disabled={starting}>
                {starting ? 'Loading…' : 'Start'}
              </button>
            </div>
          </form>
          {emptyScope && (
            <div className="card drill-empty">
              <h2>No multiple-choice questions here yet</h2>
              <p className="muted">
                Nothing matches this scope. MCQs come from the{' '}
                <Link to="/questions">Questions page</Link> (Add question →
                Multiple choice) or from seed content — author a few, or widen
                the scope and try again.
              </p>
            </div>
          )}
        </>
      )}

      {phase === 'running' && current && (
        <>
          <div className="review-progress">
            <span>
              Question <strong>{index + 1}</strong> of {questions.length} ·{' '}
              {correctCount}/{answeredCount} correct
            </span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(index / questions.length) * 100}%` }}
              />
            </div>
          </div>
          <DrillCard
            key={`${current.id}-${index}`}
            question={current}
            dialogOpen={errorLog !== null}
            alreadyAdded={addedCards.has(current.id)}
            onSubmit={(ids) => submitAnswer(current, ids)}
            onNext={next}
            onSkip={skip}
            onErrorLog={(result) => openErrorLog(current, result)}
            onError={setError}
          />
        </>
      )}

      {phase === 'summary' && (
        <DrillSummary
          correct={correctCount}
          answered={answeredCount}
          skipped={skippedCount}
          missed={missed}
          addedCards={addedCards}
          onErrorLog={(m) => openErrorLog(m.question, m.result)}
          onRestart={() => scope && void start(scope)}
          onChangeScope={() => {
            setPhase('setup');
            setEmptyScope(false);
          }}
          restarting={starting}
        />
      )}

      {errorLog && (
        <ErrorLogDialog
          target={errorLog}
          onSaved={(id) => setAddedCards((s) => new Set(s).add(id))}
          onClose={() => setErrorLog(null)}
        />
      )}
    </div>
  );
}

function DrillCard({
  question,
  dialogOpen,
  alreadyAdded,
  onSubmit,
  onNext,
  onSkip,
  onErrorLog,
  onError,
}: {
  question: DrillQuestion;
  /** True while the error-log dialog is open — suspends drill shortcuts. */
  dialogOpen: boolean;
  alreadyAdded: boolean;
  onSubmit: (selectedIds: number[]) => Promise<DrillAnswerResult>;
  onNext: () => void;
  onSkip: () => void;
  onErrorLog: (result: DrillAnswerResult) => void;
  onError: (msg: string) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<DrillAnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const choices = useMemo(
    () => [...question.choices].sort((a, b) => a.position - b.position),
    [question],
  );

  function toggle(choiceIndex: number) {
    const choice = choices[choiceIndex];
    if (!choice || result) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (question.multi_select) {
        if (next.has(choice.id)) next.delete(choice.id);
        else next.add(choice.id);
      } else if (next.has(choice.id)) {
        next.clear();
      } else {
        next.clear();
        next.add(choice.id);
      }
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0 || submitting || result) return;
    setSubmitting(true);
    try {
      setResult(await onSubmit([...selected]));
    } catch (e) {
      onError(String((e as Error).message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  // Keyboard-first flow. No dependency array: re-attached each render so the
  // handler always sees fresh state (same pattern as the Review page).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialogOpen) return;
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (inField || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      if (!result) {
        if (e.key >= '1' && e.key <= '9') {
          e.preventDefault();
          toggle(Number(e.key) - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          void submit();
        } else if ((e.key === 's' || e.key === 'S') && !submitting) {
          e.preventDefault();
          onSkip();
        }
      } else if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="card review-card">
      <div className="review-meta">
        {question.multi_select && (
          <span className="badge multi" title="More than one choice is correct">
            Select all that apply
          </span>
        )}
        {question.objective_title && (
          <span className="review-objective muted">{question.objective_title}</span>
        )}
        {question.domain && !question.objective_title && (
          <span className="review-objective muted">{question.domain}</span>
        )}
      </div>

      <p className="review-question">{question.question_text}</p>

      {!result ? (
        <>
          <div className="choice-list">
            {choices.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`btn choice-btn ${selected.has(c.id) ? 'selected' : ''}`}
                onClick={() => toggle(i)}
              >
                <kbd>{i + 1}</kbd>
                <span>{c.choice_text}</span>
              </button>
            ))}
          </div>
          <div className="rating-row">
            <div className="row gap">
              <button
                className="btn primary"
                disabled={selected.size === 0 || submitting}
                onClick={() => void submit()}
              >
                {submitting ? 'Checking…' : 'Submit answer'}
              </button>
              <button className="btn skip" disabled={submitting} onClick={onSkip}>
                Skip
              </button>
            </div>
            <div className="kbd-hints muted">
              <kbd>1</kbd>–<kbd>9</kbd> — select · <kbd>Enter</kbd> — submit ·{' '}
              <kbd>S</kbd> — skip
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={`verdict ${result.correct ? 'good' : 'bad'}`}>
            {result.correct ? 'Correct' : 'Incorrect'}
          </div>
          <ChoiceFeedback choices={result.choices} selectedIds={[...selected]} />
          {!result.correct &&
            (alreadyAdded ? (
              <div className="spinoff-done">✓ Recall card added</div>
            ) : (
              <button
                className="btn small spinoff-btn"
                onClick={() => onErrorLog(result)}
              >
                Turn this into a recall card
              </button>
            ))}
          <div className="rating-row">
            <button className="btn primary" onClick={onNext}>
              Next question
            </button>
            <div className="kbd-hints muted">
              <kbd>N</kbd> / <kbd>Enter</kbd> — next
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DrillSummary({
  correct,
  answered,
  skipped,
  missed,
  addedCards,
  onErrorLog,
  onRestart,
  onChangeScope,
  restarting,
}: {
  correct: number;
  answered: number;
  skipped: number;
  missed: MissedItem[];
  addedCards: Set<number>;
  onErrorLog: (m: MissedItem) => void;
  onRestart: () => void;
  onChangeScope: () => void;
  restarting: boolean;
}) {
  return (
    <div className="card review-done">
      <div className="done-emoji">{answered > 0 && correct === answered ? '🎯' : '📋'}</div>
      <h2>
        Batch done — {correct}/{answered} correct
      </h2>
      <p className="muted">
        {answered} answered{skipped > 0 ? `, ${skipped} skipped` : ''}. Misses
        make the best recall cards — log them while the confusion is fresh.
      </p>

      {missed.length > 0 && (
        <div className="drill-missed">
          <div className="done-subhead">Missed this batch</div>
          <ul className="drill-missed-list">
            {missed.map((m) => (
              <li key={m.question.id}>
                <span className="drill-missed-stem">
                  {truncate(m.question.question_text, 90)}
                </span>
                {addedCards.has(m.question.id) ? (
                  <span className="spinoff-done">✓ added</span>
                ) : (
                  <button className="btn small" onClick={() => onErrorLog(m)}>
                    Turn into recall card
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row gap drill-summary-actions">
        <button className="btn primary" onClick={onRestart} disabled={restarting}>
          {restarting ? 'Loading…' : 'Restart with same scope'}
        </button>
        <button className="btn" onClick={onChangeScope}>
          Change scope
        </button>
      </div>
    </div>
  );
}
