import { useEffect, useRef, useState } from 'react';
import { REVIEW_RATINGS, type DueItem } from '@llmstudy/shared';
import {
  deleteAttempt,
  getReviewForecast,
  listDue,
  submitReview,
} from '../api/client';

/** A due item queued for this session (may be a same-session relearn copy). */
type QueueItem = DueItem & { relearn?: boolean };

interface LastSubmission {
  attemptId: number;
  item: QueueItem;
  rating: number;
  /** True when this grade appended a relearn copy to the queue. */
  requeuedRelearn: boolean;
}

export function ReviewPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Session stats + bookkeeping.
  const [skipCounts, setSkipCounts] = useState<Record<number, number>>({});
  const [skippedDropped, setSkippedDropped] = useState(0);
  const [ratingCounts, setRatingCounts] = useState<Record<number, number>>({});
  const [forgotByObjective, setForgotByObjective] = useState<
    Record<string, number>
  >({});
  const [lastSubmission, setLastSubmission] = useState<LastSubmission | null>(
    null,
  );
  const [undoing, setUndoing] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listDue()
      .then((items) => {
        setQueue(items);
        setIndex(0);
        setReviewed(0);
        setSkipCounts({});
        setSkippedDropped(0);
        setRatingCounts({});
        setForgotByObjective({});
        setLastSubmission(null);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const current = queue[index];
  const total = queue.length;

  async function gradeCurrent(rating: number, userAnswer: string) {
    if (!current) return;
    try {
      const attempt = await submitReview({
        question_id: current.id,
        rating,
        user_answer: userAnswer || null,
      });
      const requeue = rating <= 2;
      if (requeue) {
        // Forgot/Poor: bring the card back later this session for a re-attempt.
        setQueue((q) => [...q, { ...current, relearn: true }]);
      }
      setLastSubmission({
        attemptId: attempt.id,
        item: current,
        rating,
        requeuedRelearn: requeue,
      });
      setReviewed((n) => n + 1);
      setRatingCounts((c) => ({ ...c, [rating]: (c[rating] ?? 0) + 1 }));
      if (rating <= 2) {
        const key = current.objective_title ?? 'Unlinked';
        setForgotByObjective((m) => ({ ...m, [key]: (m[key] ?? 0) + 1 }));
      }
      setIndex((i) => i + 1);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  function skipCurrent() {
    if (!current) return;
    const priorSkips = skipCounts[current.id] ?? 0;
    setSkipCounts((s) => ({ ...s, [current.id]: priorSkips + 1 }));
    if (priorSkips === 0) {
      // First skip: send it to the back of the queue for another look.
      setQueue((q) => [...q, current]);
    } else {
      // Second skip: drop it from this session.
      setSkippedDropped((n) => n + 1);
    }
    setIndex((i) => i + 1);
  }

  async function undoLast() {
    if (!lastSubmission || undoing) return;
    setUndoing(true);
    try {
      await deleteAttempt(lastSubmission.attemptId);
      const { item, rating, requeuedRelearn } = lastSubmission;
      setQueue((q) => {
        const next = [...q];
        if (requeuedRelearn) {
          // Remove the relearn copy that this submission appended
          // (search from the end — that's the one this grade added).
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].id === item.id && next[i].relearn) {
              next.splice(i, 1);
              break;
            }
          }
        }
        // Re-insert the original item so it is the next card shown.
        next.splice(Math.min(index, next.length), 0, item);
        return next;
      });
      setReviewed((n) => Math.max(0, n - 1));
      setRatingCounts((c) => ({
        ...c,
        [rating]: Math.max(0, (c[rating] ?? 0) - 1),
      }));
      if (rating <= 2) {
        const key = item.objective_title ?? 'Unlinked';
        setForgotByObjective((m) => {
          const next = { ...m };
          const left = (next[key] ?? 0) - 1;
          if (left > 0) next[key] = left;
          else delete next[key];
          return next;
        });
      }
      setLastSubmission(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setUndoing(false);
    }
  }

  if (loading) return <p className="muted">Loading review queue…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Spaced Review</h1>
        <p className="muted">
          Answer from memory first, then reveal the expected answer and rate how it
          went. Your rating sets when the question comes back.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      {total === 0 ? (
        <EmptyState onRefresh={load} />
      ) : current ? (
        <>
          <div className="review-progress">
            <span>
              Reviewed <strong>{reviewed}</strong> · {total - index} left
            </span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(index / total) * 100}%` }}
              />
            </div>
            {lastSubmission && (
              <button
                className="btn small"
                disabled={undoing}
                onClick={undoLast}
                title="Undo the last rating (U)"
              >
                {undoing ? 'Undoing…' : 'Undo last'}
              </button>
            )}
          </div>
          <ReviewCard
            // Index (and reviewed, for undo) in the key so every advance,
            // requeue arrival, or undo remounts the card with fresh state.
            key={`${current.id}-${index}-${reviewed}`}
            item={current}
            onGrade={gradeCurrent}
            onSkip={skipCurrent}
            onUndo={undoLast}
            canUndo={lastSubmission !== null && !undoing}
          />
        </>
      ) : (
        <DoneState
          reviewed={reviewed}
          skipped={skippedDropped}
          ratingCounts={ratingCounts}
          forgotByObjective={forgotByObjective}
          onRefresh={load}
        />
      )}
    </div>
  );
}

function ReviewCard({
  item,
  onGrade,
  onSkip,
  onUndo,
  canUndo,
}: {
  item: QueueItem;
  onGrade: (rating: number, userAnswer: string) => Promise<void>;
  onSkip: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  const ratingActive = revealed || !item.expected_answer;

  useEffect(() => {
    answerRef.current?.focus();
  }, []);

  function reveal() {
    setRevealed(true);
    // Unfocus the textarea so 1-5 / S / U shortcuts work immediately.
    answerRef.current?.blur();
  }

  async function grade(rating: number) {
    setSubmitting(true);
    try {
      await onGrade(rating, answer.trim());
    } finally {
      // On success the component unmounts (keyed by id + position) and this
      // is a no-op; on failure it re-enables the buttons for a retry.
      setSubmitting(false);
    }
  }

  // Keyboard-first flow. No dependency array: re-attached each render so the
  // handler always sees fresh state and props.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (inField) {
        // Inside a field only Ctrl/Cmd+Enter acts: reveal + leave the field.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (item.expected_answer && !revealed) reveal();
          else target.blur();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      if ((e.key === ' ' || e.key === 'Enter') && item.expected_answer && !revealed) {
        e.preventDefault(); // keep Space from scrolling
        reveal();
      } else if (e.key >= '1' && e.key <= '5' && ratingActive && !submitting) {
        e.preventDefault();
        void grade(Number(e.key));
      } else if ((e.key === 's' || e.key === 'S') && !submitting) {
        e.preventDefault();
        onSkip();
      } else if ((e.key === 'u' || e.key === 'U') && canUndo && !submitting) {
        e.preventDefault();
        onUndo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="card review-card">
      <div className="review-meta">
        {item.relearn ? (
          <span className="badge relearn" title="Rated 2 or lower earlier this session">
            Relearn
          </span>
        ) : item.is_new ? (
          <span className="badge status-learning">New</span>
        ) : (
          <span className="badge diff" title="Was due for review">
            Due{item.next_review_date ? ` · ${item.next_review_date}` : ''}
          </span>
        )}
        {item.objective_title && (
          <span className="review-objective muted">{item.objective_title}</span>
        )}
      </div>

      <p className="review-question">{item.question_text}</p>

      <label>
        Your answer <span className="muted">(optional — recall from memory)</span>
        <textarea
          ref={answerRef}
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer before revealing…"
        />
      </label>

      {item.expected_answer &&
        (revealed ? (
          <div className="q-answer">
            <div className="q-answer-label">Expected answer</div>
            {item.expected_answer}
          </div>
        ) : (
          <button className="btn" onClick={reveal}>
            Show expected answer
          </button>
        ))}
      {!item.expected_answer && (
        <span className="muted small-text">No expected answer recorded.</span>
      )}

      <div className="rating-row">
        {ratingActive ? (
          <>
            <div className="rating-label">How did it go?</div>
            <div className="rating-buttons">
              {REVIEW_RATINGS.map((r) => (
                <button
                  key={r.value}
                  className="btn rating-btn"
                  disabled={submitting}
                  onClick={() => grade(r.value)}
                  title={`Next review ${r.hint}`}
                >
                  <span className="rating-num">{r.value}</span>
                  <span className="rating-name">{r.label}</span>
                  <span className="rating-hint">{r.hint}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="rating-label muted">
            Answer from memory, then reveal the expected answer to rate your recall.
          </div>
        )}
        <button className="btn small skip" disabled={submitting} onClick={onSkip}>
          Skip for now
        </button>
        <div className="kbd-hints muted">
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> / <kbd>Space</kbd> — reveal ·{' '}
          <kbd>1</kbd>–<kbd>5</kbd> — rate · <kbd>S</kbd> — skip ·{' '}
          <kbd>U</kbd> — undo
        </div>
      </div>
    </div>
  );
}

/** "Due tomorrow: N" via the forecast endpoint; renders nothing on error. */
function DueTomorrow() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReviewForecast(1)
      .then((days) => {
        if (!cancelled) setCount(days[0]?.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  return (
    <p className="muted small-text">Due tomorrow: {count ?? '…'}</p>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="card review-done">
      <div className="done-emoji">🎉</div>
      <h2>Nothing due right now</h2>
      <p className="muted">
        No questions are due for review. Add more in the Questions tab, or check
        back later.
      </p>
      <DueTomorrow />
      <button className="btn" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  );
}

function DoneState({
  reviewed,
  skipped,
  ratingCounts,
  forgotByObjective,
  onRefresh,
}: {
  reviewed: number;
  skipped: number;
  ratingCounts: Record<number, number>;
  forgotByObjective: Record<string, number>;
  onRefresh: () => void;
}) {
  const toughest = Object.entries(forgotByObjective)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const max = Math.max(1, ...Object.values(ratingCounts));

  return (
    <div className="card review-done">
      <div className="done-emoji">✅</div>
      <h2>Review complete</h2>
      <p className="muted">
        You got through the queue — {reviewed} rated, {skipped} skipped.
      </p>

      {reviewed > 0 && (
        <div className="rating-histogram">
          {REVIEW_RATINGS.map((r) => {
            const count = ratingCounts[r.value] ?? 0;
            return (
              <div key={r.value} className="hist-row">
                <span className="hist-label">
                  {r.value} · {r.label}
                </span>
                <div className="hist-track">
                  <div
                    className="hist-fill"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
                <span className="hist-count">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {toughest.length > 0 && (
        <div className="toughest">
          <div className="done-subhead">Toughest this session</div>
          <ul className="toughest-list">
            {toughest.map(([title, n]) => (
              <li key={title}>
                {title} <span className="muted">· forgot ×{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DueTomorrow />

      <button className="btn" onClick={onRefresh}>
        Reload queue
      </button>
    </div>
  );
}
