import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ExamReadinessEstimate, ExamSession } from '@llmstudy/shared';
import { createExam, getExamReadiness, listExams } from '../api/client';

export function ExamsPage() {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<ExamReadinessEstimate | null>(null);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Start-mock form.
  const [questionCount, setQuestionCount] = useState(50);
  const [predicted, setPredicted] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    Promise.all([getExamReadiness(), listExams()])
      .then(([r, s]) => {
        setReadiness(r);
        setSessions(s);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const inProgress = sessions.filter((s) => s.completed_at === null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(predicted);
    if (predicted.trim() === '' || !Number.isFinite(p) || p < 0 || p > 100) {
      setError('Predict your score first — a whole number from 0 to 100.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const session = await createExam({
        question_count: questionCount,
        predicted_score: p,
      });
      navigate(`/exams/${session.id}`);
    } catch (err) {
      // Includes the backend's 400 when the MCQ pool is under 10.
      setError(String((err as Error).message ?? err));
      setStarting(false);
    }
  }

  if (loading) return <p className="muted">Loading exams…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Mock Exams</h1>
        <p className="muted">
          Timed, exam-weighted practice runs. Your readiness estimate is the
          median of your last two mock scores — the most honest predictor you
          have.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <div className="card exam-readiness">
        {readiness && readiness.estimate !== null ? (
          <>
            <div className="exam-estimate">
              <span className="exam-score-big">
                {Math.round(readiness.estimate)}%
              </span>
              <span className="exam-estimate-band">
                ± {readiness.band} estimated score
              </span>
            </div>
            <p className="muted small-text exam-estimate-note">
              Median of your last two completed mocks ·{' '}
              {readiness.mockCount} mock{readiness.mockCount === 1 ? '' : 's'}{' '}
              taken
            </p>
            {readiness.history.length > 0 && (
              <ul className="exam-history">
                {readiness.history.map((h) => (
                  <li key={h.id}>
                    <Link to={`/exams/${h.id}`}>
                      {h.completed_at.slice(0, 10)}
                    </Link>{' '}
                    · scored <strong>{Math.round(h.score_percent)}%</strong> ·
                    predicted{' '}
                    {h.predicted_score !== null
                      ? `${Math.round(h.predicted_score)}%`
                      : '—'}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted">
            No completed mocks yet. Finish your first mock and your estimated
            exam score (median of the last two, ± {readiness?.band ?? 6})
            appears here.
          </p>
        )}
      </div>

      {inProgress.map((s) => (
        <div key={s.id} className="card exam-resume">
          <div>
            <strong>Mock in progress</strong>
            <div className="muted small-text">
              Started {s.started_at.slice(0, 10)} · {s.question_count} questions
              · {s.duration_minutes} min
            </div>
          </div>
          <Link className="btn primary" to={`/exams/${s.id}`}>
            Resume
          </Link>
        </div>
      ))}

      <form className="card exam-start" onSubmit={start}>
        <h2 className="exam-start-title">Start a mock exam</h2>
        <div className="row gap wrap">
          <label>
            Question count
            <input
              type="number"
              min={1}
              max={200}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value) || 50)}
              className="exam-count"
            />
          </label>
          <label>
            Predict your score (%) <span className="muted">— required</span>
            <input
              type="number"
              min={0}
              max={100}
              value={predicted}
              onChange={(e) => setPredicted(e.target.value)}
              placeholder="e.g. 70"
              required
              className="exam-count"
            />
          </label>
          <button className="btn primary exam-start-btn" disabled={starting}>
            {starting ? 'Building exam…' : 'Start mock exam'}
          </button>
        </div>
        <p className="muted small-text exam-predict-why">
          Predicting before you see a single question trains calibration — after
          the mock you'll see exactly how far off you were.
        </p>
      </form>
    </div>
  );
}
