import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  ExamItemView,
  ExamResult,
  ExamReviewItem,
  ExamSessionDetail,
} from '@llmstudy/shared';
import { finishExam, getExam, updateExamItem } from '../api/client';
import { ChoiceFeedback } from '../components/ChoiceFeedback';
import { ErrorLogDialog, type ErrorLogTarget } from '../components/ErrorLogDialog';

/** Warn (red timer) when under 5 minutes remain. */
const LOW_TIME_MS = 5 * 60_000;

/**
 * Server timestamps may be ISO or SQLite's 'YYYY-MM-DD HH:MM:SS' (UTC).
 * Falls back to "now" when unparseable so the timer degrades to a full
 * countdown instead of NaN.
 */
function parseServerDate(s: string): number {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)
    ? `${s.replace(' ', 'T')}Z`
    : s;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Date.now() : t;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ExamRunnerPage() {
  const params = useParams();
  const examId = Number(params.id);

  const [session, setSession] = useState<ExamSessionDetail | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(examId)) {
      setError('Invalid exam id.');
      setLoading(false);
      return;
    }
    getExam(examId)
      .then((resp) => {
        // Contract: completed sessions come back as ExamResult.
        if (resp.completed_at !== null) setResult(resp as ExamResult);
        else setSession(resp as ExamSessionDetail);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, [examId]);

  if (loading) return <p className="muted">Loading exam…</p>;

  if (result) return <ExamResults result={result} />;

  if (!session) {
    return (
      <div>
        {error && <div className="banner error">{error}</div>}
        <p className="muted">
          Exam not found. <Link to="/exams">Back to exams</Link>
        </p>
      </div>
    );
  }

  return (
    <ExamRunner
      session={session}
      error={error}
      setError={setError}
      onFinished={setResult}
    />
  );
}

// ---------------------------------------------------------------------------
// Runner (in-progress session)
// ---------------------------------------------------------------------------

function ExamRunner({
  session,
  error,
  setError,
  onFinished,
}: {
  session: ExamSessionDetail;
  error: string | null;
  setError: (msg: string | null) => void;
  onFinished: (result: ExamResult) => void;
}) {
  const [items, setItems] = useState<ExamItemView[]>(() =>
    [...session.items].sort((a, b) => a.position - b.position),
  );
  const [idx, setIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Ref (not state) so the auto-finish effect can't fire twice in one tick.
  const finishRef = useRef(false);

  // Timer: remaining is recomputed from wall clock each tick, so a refresh
  // stays honest — nothing is persisted locally, server state is truth.
  const durationMs = session.duration_minutes * 60_000;
  const endAt = useMemo(
    () => parseServerDate(session.started_at) + durationMs,
    [session.started_at, durationMs],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remainingMs = Math.max(0, Math.min(endAt - now, durationMs));

  async function doFinish() {
    if (finishRef.current) return;
    finishRef.current = true;
    setConfirming(false);
    setFinishing(true);
    try {
      onFinished(await finishExam(session.id));
    } catch (e) {
      setError(String((e as Error).message ?? e));
      finishRef.current = false;
      setFinishing(false);
    }
  }

  // Auto-finish at 0:00 (also catches resuming an already-expired session).
  useEffect(() => {
    if (remainingMs <= 0) void doFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs]);

  /** Optimistic update + immediate PUT; banner on failure (state is retried
   * implicitly — the next change re-sends the full value). */
  function patchItem(
    position: number,
    patch: { selected_choice_ids?: number[]; flagged?: boolean },
  ) {
    setItems((prev) =>
      prev.map((it) => (it.position === position ? { ...it, ...patch } : it)),
    );
    updateExamItem(session.id, position, patch).catch((e) =>
      setError(`Couldn't save — ${String((e as Error).message ?? e)}`),
    );
  }

  const current = items[idx];

  function toggleChoice(choiceIndex: number) {
    if (!current || finishing) return;
    const sorted = [...current.choices].sort((a, b) => a.position - b.position);
    const choice = sorted[choiceIndex];
    if (!choice) return;
    const selected = new Set(current.selected_choice_ids ?? []);
    if (current.multi_select) {
      if (selected.has(choice.id)) selected.delete(choice.id);
      else selected.add(choice.id);
    } else if (selected.has(choice.id)) {
      selected.clear();
    } else {
      selected.clear();
      selected.add(choice.id);
    }
    patchItem(current.position, { selected_choice_ids: [...selected] });
  }

  function toggleFlag() {
    if (!current || finishing) return;
    patchItem(current.position, { flagged: !current.flagged });
  }

  const unanswered = items.filter(
    (it) => !it.selected_choice_ids || it.selected_choice_ids.length === 0,
  ).length;

  // Keyboard: digits toggle choices, F flags, arrows navigate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finishing) return;
      if (confirming) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setConfirming(false);
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (inField || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        toggleChoice(Number(e.key) - 1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFlag();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIdx((i) => Math.min(items.length - 1, i + 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sortedChoices = current
    ? [...current.choices].sort((a, b) => a.position - b.position)
    : [];
  const selectedIds = new Set(current?.selected_choice_ids ?? []);

  return (
    <div>
      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <div className="exam-topbar">
        <div>
          <strong>Mock exam</strong>{' '}
          <span className="muted small-text">
            {items.length} questions · {unanswered} unanswered
          </span>
        </div>
        <div
          className={`exam-timer ${remainingMs < LOW_TIME_MS ? 'low' : ''}`}
          title="Time remaining — the exam auto-finishes at 0:00"
        >
          {formatMs(remainingMs)}
        </div>
        <button
          className="btn primary"
          disabled={finishing}
          onClick={() => setConfirming(true)}
        >
          {finishing ? 'Finishing…' : 'Finish exam'}
        </button>
      </div>

      <div className="exam-nav-grid">
        {items.map((it, i) => {
          const answered =
            !!it.selected_choice_ids && it.selected_choice_ids.length > 0;
          return (
            <button
              key={it.position}
              type="button"
              className={`nav-cell ${answered ? 'answered' : ''} ${
                it.flagged ? 'flagged' : ''
              } ${i === idx ? 'current' : ''}`}
              onClick={() => setIdx(i)}
              title={`Question ${it.position}${answered ? ' · answered' : ''}${
                it.flagged ? ' · flagged' : ''
              }`}
            >
              {it.position}
            </button>
          );
        })}
      </div>

      {current && (
        <div className="card review-card exam-item">
          <div className="review-meta">
            <span className="muted small-text">
              Question {current.position} of {items.length}
            </span>
            {current.multi_select && (
              <span className="badge multi" title="More than one choice is correct">
                Select all that apply
              </span>
            )}
            <button
              type="button"
              className={`btn small exam-flag ${current.flagged ? 'on' : ''}`}
              onClick={toggleFlag}
              title="Flag for review (F)"
            >
              ⚑ {current.flagged ? 'Flagged' : 'Flag'}
            </button>
          </div>

          <p className="review-question">{current.question_text}</p>

          <div className="choice-list">
            {sortedChoices.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`btn choice-btn ${selectedIds.has(c.id) ? 'selected' : ''}`}
                onClick={() => toggleChoice(i)}
              >
                <kbd>{i + 1}</kbd>
                <span>{c.choice_text}</span>
              </button>
            ))}
          </div>

          <div className="rating-row">
            <div className="row gap">
              <button
                className="btn"
                disabled={idx === 0}
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
              >
                ← Prev
              </button>
              <button
                className="btn"
                disabled={idx === items.length - 1}
                onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))}
              >
                Next →
              </button>
            </div>
            <div className="kbd-hints muted">
              <kbd>1</kbd>–<kbd>9</kbd> — select · <kbd>F</kbd> — flag ·{' '}
              <kbd>←</kbd>/<kbd>→</kbd> — prev/next
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(false)}>
          <div
            className="card modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">Finish the exam?</h2>
            <p className="muted">
              {unanswered === 0
                ? 'Every question is answered.'
                : `${unanswered} question${unanswered === 1 ? ' is' : 's are'} still unanswered — they'll be graded as wrong.`}
            </p>
            <div className="row gap">
              <button className="btn primary" onClick={() => void doFinish()} autoFocus>
                Finish and grade
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results (completed session)
// ---------------------------------------------------------------------------

function ExamResults({ result }: { result: ExamResult }) {
  // Source-MCQ ids already turned into recall cards (double-add guard).
  const [addedCards, setAddedCards] = useState<Set<number>>(new Set());
  const [errorLog, setErrorLog] = useState<ErrorLogTarget | null>(null);

  const score = result.score_percent ?? 0;
  const predicted = result.predicted_score;
  const delta = predicted !== null ? Math.round(score - predicted) : null;

  return (
    <div>
      <div className="page-head">
        <h1>Mock exam results</h1>
        <p className="muted">
          Completed {result.completed_at?.slice(0, 10)} · {result.question_count}{' '}
          questions · <Link to="/exams">back to exams</Link>
        </p>
      </div>

      <div className="card exam-readiness">
        <div className="exam-estimate">
          <span className="exam-score-big">{Math.round(score)}%</span>
          {predicted !== null && (
            <span className="exam-estimate-band">
              you predicted {Math.round(predicted)}% —{' '}
              {delta === 0
                ? 'spot on'
                : `${Math.abs(delta!)} point${Math.abs(delta!) === 1 ? '' : 's'} ${
                    delta! > 0 ? 'better' : 'worse'
                  }`}
            </span>
          )}
        </div>
        {predicted === null && (
          <p className="muted small-text exam-estimate-note">
            No prediction was recorded for this mock.
          </p>
        )}
      </div>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>By domain</h2>
          <span className="muted small-text">% = official exam weight</span>
        </div>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th className="num">Correct</th>
                <th className="num">Score</th>
                <th className="num">Weight</th>
              </tr>
            </thead>
            <tbody>
              {result.domainScores.map((d) => (
                <tr key={d.domain}>
                  <td>{d.domain}</td>
                  <td className="num">
                    {d.correct}/{d.total}
                  </td>
                  <td className="num">
                    {d.total > 0 ? `${Math.round((d.correct / d.total) * 100)}%` : '—'}
                  </td>
                  <td className="num">{d.weight !== null ? `${d.weight}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Review</h2>
          <span className="muted small-text">
            {result.review.filter((r) => !r.is_correct).length} missed — log each
            one as a recall card
          </span>
        </div>
        <div className="obj-list">
          {result.review.map((item) => (
            <ExamReviewCard
              key={item.position}
              item={item}
              alreadyAdded={addedCards.has(item.question_id)}
              onErrorLog={() =>
                setErrorLog({
                  questionId: item.question_id,
                  questionText: item.question_text,
                  objectiveId: item.objective_id,
                  objectiveTitle: item.objective_title,
                  correctChoices: item.choices.filter((c) => c.is_correct),
                })
              }
            />
          ))}
        </div>
      </section>

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

function ExamReviewCard({
  item,
  alreadyAdded,
  onErrorLog,
}: {
  item: ExamReviewItem;
  alreadyAdded: boolean;
  onErrorLog: () => void;
}) {
  const unanswered =
    !item.selected_choice_ids || item.selected_choice_ids.length === 0;

  return (
    <div className="card exam-review-item">
      <div className="review-meta">
        <span className="muted small-text">#{item.position}</span>
        <span className={`verdict small ${item.is_correct ? 'good' : 'bad'}`}>
          {item.is_correct ? 'Correct' : unanswered ? 'Unanswered' : 'Missed'}
        </span>
        {item.flagged && (
          <span className="exam-flag-marker" title="You flagged this during the exam">
            ⚑ flagged
          </span>
        )}
        {item.objective_title && (
          <span className="review-objective muted">{item.objective_title}</span>
        )}
      </div>

      <p className="q-text">{item.question_text}</p>

      <ChoiceFeedback
        choices={item.choices}
        selectedIds={item.selected_choice_ids ?? []}
      />

      {!item.is_correct &&
        (alreadyAdded ? (
          <div className="spinoff-done">✓ Recall card added</div>
        ) : (
          <button className="btn small spinoff-btn" onClick={onErrorLog}>
            Turn this into a recall card
          </button>
        ))}
    </div>
  );
}
