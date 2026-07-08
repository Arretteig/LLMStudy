import { useEffect, useState } from 'react';
import { REVIEW_RATINGS, type DueItem } from '@llmstudy/shared';
import { listDue, submitReview } from '../api/client';

export function ReviewPage() {
  const [queue, setQueue] = useState<DueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listDue()
      .then((items) => {
        setQueue(items);
        setIndex(0);
        setReviewed(0);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <p className="muted">Loading review queue…</p>;

  const current = queue[index];
  const total = queue.length;

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
          </div>
          <ReviewCard
            key={current.id}
            item={current}
            onGrade={async (rating, userAnswer) => {
              try {
                await submitReview({
                  question_id: current.id,
                  rating,
                  user_answer: userAnswer || null,
                });
                setReviewed((n) => n + 1);
                setIndex((i) => i + 1);
              } catch (e) {
                setError(String((e as Error).message ?? e));
              }
            }}
            onSkip={() => setIndex((i) => i + 1)}
          />
        </>
      ) : (
        <DoneState reviewed={reviewed} total={total} onRefresh={load} />
      )}
    </div>
  );
}

function ReviewCard({
  item,
  onGrade,
  onSkip,
}: {
  item: DueItem;
  onGrade: (rating: number, userAnswer: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function grade(rating: number) {
    setSubmitting(true);
    await onGrade(rating, answer.trim());
    // component unmounts on advance (keyed by id); no state reset needed
  }

  return (
    <div className="card review-card">
      <div className="review-meta">
        {item.is_new ? (
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
          <button className="btn" onClick={() => setRevealed(true)}>
            Show expected answer
          </button>
        ))}
      {!item.expected_answer && (
        <span className="muted small-text">No expected answer recorded.</span>
      )}

      <div className="rating-row">
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
        <button className="btn small skip" disabled={submitting} onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
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
      <button className="btn" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  );
}

function DoneState({
  reviewed,
  total,
  onRefresh,
}: {
  reviewed: number;
  total: number;
  onRefresh: () => void;
}) {
  return (
    <div className="card review-done">
      <div className="done-emoji">✅</div>
      <h2>Review complete</h2>
      <p className="muted">
        You got through {total} due {total === 1 ? 'question' : 'questions'} (
        {reviewed} rated, {total - reviewed} skipped).
      </p>
      <button className="btn" onClick={onRefresh}>
        Reload queue
      </button>
    </div>
  );
}
