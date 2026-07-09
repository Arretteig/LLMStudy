import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  OBJECTIVE_STATUS_LABELS,
  type CalibrationSummary,
  type DashboardDomainStat,
  type DashboardSummary,
  type ReadinessInfo,
  type ReviewForecastDay,
  type StreakInfo,
  type WeakObjective,
} from '@llmstudy/shared';
import { getDashboard, getReviewForecast } from '../api/client';
import { truncate } from '../util';

export function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <p className="muted">Loading dashboard…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">
          Where you stand on NCA-GENL, and what to work on next. As of {data.today}.
        </p>
      </div>

      <div className="summary">
        <Tile label="Objectives" value={data.objectives.total} sub={`${data.objectives.weak} weak · ${data.objectives.unrated} unrated`} />
        <Tile
          label="Avg confidence"
          value={data.objectives.avgConfidence != null ? data.objectives.avgConfidence.toFixed(1) : '—'}
          sub="across rated objectives"
        />
        <Tile
          label="Questions due"
          value={data.questions.due}
          sub={`of ${data.questions.total} total`}
          tone={data.questions.due > 0 ? 'accent' : undefined}
          to="/review"
        />
        <Tile label="Reviews (7d)" value={data.reviews.last7Days} sub={`${data.reviews.totalAttempts} all-time`} />
        <Tile
          label="Labs completed"
          value={data.labs.runsCompleted}
          sub={`${data.labs.runsInProgress} in progress`}
          to="/runs"
        />
        <StreakTile streak={data.streak} />
      </div>

      <ExamReadinessCard
        examDate={data.examDate}
        daysToExam={data.daysToExam}
        readiness={data.readiness}
      />

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Work on next</h2>
          <Link className="muted small-text" to="/objectives">
            all objectives →
          </Link>
        </div>
        {data.weakObjectives.length === 0 ? (
          <p className="muted">Nothing flagged as weak — nice. Keep reviewing to stay sharp.</p>
        ) : (
          <div className="weak-list">
            {data.weakObjectives.map((w) => (
              <WeakRow key={w.id} w={w} />
            ))}
          </div>
        )}
      </section>

      <ForecastSection />

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Domain readiness</h2>
          <span className="muted small-text">% = official exam weight</span>
        </div>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Weight</th>
                <th>Objectives</th>
                <th>Avg conf.</th>
                <th>Weak</th>
                <th>Questions</th>
                <th>Due</th>
                <th>Retention</th>
                <th>Labs done</th>
              </tr>
            </thead>
            <tbody>
              {data.domains.map((d) => (
                <DomainRow key={d.domain} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CalibrationSection calibration={data.calibration} />
    </div>
  );
}

/** Confidence-vs-recall quadrant plus the "sure but forgot" hit lists. */
function CalibrationSection({ calibration }: { calibration: CalibrationSummary }) {
  const q = calibration.quadrant;
  const quadrantTotal =
    q.confidentCorrect + q.confidentWrong + q.unsureCorrect + q.unsureWrong;
  const hasData = quadrantTotal > 0 || calibration.overconfidentObjectives.length > 0;

  return (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>Calibration</h2>
        <span className="muted small-text">
          confidence vs. recall · last {calibration.windowDays} days
        </span>
      </div>
      <div className="card calib-card">
        {!hasData ? (
          <p className="muted calib-empty">
            Calibration data appears once you rate confidence before revealing
            answers.
          </p>
        ) : (
          <>
            <div className="calib-grid">
              <div />
              <div className="calib-head">Recalled</div>
              <div className="calib-head">Forgot</div>
              <div className="calib-head calib-row-head">Sure</div>
              <div className="calib-cell">{q.confidentCorrect}</div>
              <div className="calib-cell calib-danger">
                {q.confidentWrong}
                <span className="calib-tag">Danger zone</span>
              </div>
              <div className="calib-head calib-row-head">Not sure</div>
              <div className="calib-cell">{q.unsureCorrect}</div>
              <div className="calib-cell">{q.unsureWrong}</div>
            </div>

            {calibration.dangerZone.length > 0 && (
              <div>
                <div className="done-subhead">Sure but forgot</div>
                <ul className="calib-list">
                  {calibration.dangerZone.map((d) => (
                    <li key={`${d.question_id}-${d.last_wrong_date}`}>
                      {truncate(d.question_text, 90)}{' '}
                      {d.objective_title && (
                        <span className="muted">· {d.objective_title}</span>
                      )}{' '}
                      <span className="muted">· {d.last_wrong_date}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {calibration.overconfidentObjectives.length > 0 && (
              <div>
                <div className="done-subhead">Overconfident objectives</div>
                <ul className="calib-list">
                  {calibration.overconfidentObjectives.map((o) => (
                    <li key={o.id}>
                      <Link to={`/review?objective=${o.id}`}>{o.title}</Link>{' '}
                      <span className="muted">
                        (self-rated {o.confidence}/5, recalling{' '}
                        {o.meanRecentRating.toFixed(1)}/5)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
  to,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'accent';
  to?: string;
}) {
  const inner = (
    <div className={`stat ${tone === 'accent' ? 'stat-accent' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="tile-link">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function StreakTile({ streak }: { streak: StreakInfo }) {
  // The day counts once dailyGoal reviews are done — or earlier, by clearing
  // the whole queue ("via clear" is activeToday without the goal met).
  const todayLine =
    streak.activeToday && streak.reviewsToday < streak.dailyGoal
      ? 'queue cleared ✓'
      : `${streak.reviewsToday}/${streak.dailyGoal} today`;
  return (
    <div className="stat">
      <div className="stat-value">🔥 {streak.current}</div>
      <div className="stat-label">Day streak</div>
      <div className="stat-sub streak-sub">
        <span>{todayLine}</span>
        {Array.from({ length: streak.repairTokens }, (_, i) => (
          <span
            key={i}
            className="token-badge"
            title="Repair token — automatically covers one missed day"
          >
            🛡
          </span>
        ))}
        <span>· longest {streak.longest}</span>
      </div>
    </div>
  );
}

function ExamReadinessCard({
  examDate,
  daysToExam,
  readiness,
}: {
  examDate: string | null;
  daysToExam: number | null;
  readiness: ReadinessInfo;
}) {
  return (
    <div className="card exam-card">
      <div className="exam-when">
        {examDate && daysToExam != null ? (
          <strong>
            {daysToExam > 0
              ? `Exam in ${daysToExam} day${daysToExam === 1 ? '' : 's'}`
              : daysToExam === 0
                ? 'Exam is today'
                : 'Exam date has passed'}{' '}
            · {examDate}
          </strong>
        ) : (
          <Link to="/settings">No exam scheduled — set a date →</Link>
        )}
      </div>
      <div className={readiness.ready ? 'exam-ready' : 'muted'}>
        {readiness.ready ? '✓ ' : ''}
        {readiness.detail}
      </div>
    </div>
  );
}

/** 14-day due-load mini histogram. Renders nothing if the forecast fails. */
function ForecastSection() {
  const [days, setDays] = useState<ReviewForecastDay[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReviewForecast(14)
      .then((d) => {
        if (!cancelled) setDays(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  const max = days ? Math.max(1, ...days.map((d) => d.count)) : 1;
  return (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>Due-load forecast</h2>
        <span className="muted small-text">next 14 days</span>
      </div>
      {!days ? (
        <p className="muted">Loading forecast…</p>
      ) : (
        <div className="rating-histogram forecast">
          {days.map((d, i) => (
            <div key={d.date} className="hist-row" title={`${d.date} — ${d.count} due`}>
              <span className="hist-label">
                {i % 7 === 0 || i === days.length - 1 ? d.date.slice(5) : ''}
              </span>
              <div className="hist-track">
                <div
                  className="hist-fill"
                  style={{ width: `${(d.count / max) * 100}%` }}
                />
              </div>
              <span className="hist-count">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WeakRow({ w }: { w: WeakObjective }) {
  return (
    <div className="card weak-row">
      <div className="weak-main">
        <div className="weak-title-line">
          <span className={`badge status-${w.status}`}>
            {OBJECTIVE_STATUS_LABELS[w.status]}
          </span>
          <strong>{w.title}</strong>
          {w.domain && <span className="muted small-text">· {w.domain}</span>}
        </div>
        <div className="weak-reasons">
          {w.reasons.map((r) => (
            <span key={r} className="reason-chip">
              {r}
            </span>
          ))}
        </div>
      </div>
      <div className="weak-actions">
        {w.dueCount > 0 && (
          <Link className="btn small primary" to={`/review?objective=${w.id}`}>
            Review
          </Link>
        )}
        {w.runCount === 0 && (
          <Link className="btn small" to={`/labs?objective=${w.id}`}>
            Find a lab
          </Link>
        )}
        {w.questionCount === 0 && (
          <Link className="btn small" to="/questions">
            Add questions
          </Link>
        )}
      </div>
    </div>
  );
}

function DomainRow({ d }: { d: DashboardDomainStat }) {
  const conf = d.avgConfidence;
  return (
    <tr>
      <td>{d.domain}</td>
      <td className="num">{d.weight != null ? `${d.weight}%` : '—'}</td>
      <td className="num">{d.objectiveCount}</td>
      <td className="num">
        {conf != null ? (
          <span className={conf <= 2.5 ? 'conf-low' : conf >= 4 ? 'conf-high' : ''}>
            {conf.toFixed(1)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="num">{d.weakCount > 0 ? d.weakCount : '·'}</td>
      <td className="num">{d.questionCount}</td>
      <td className="num">
        {d.dueCount > 0 ? (
          <Link to={`/review?domain=${encodeURIComponent(d.domain)}`}>
            {d.dueCount}
          </Link>
        ) : (
          '·'
        )}
      </td>
      <td
        className="num"
        title={
          d.successRate != null
            ? `${d.attemptCount} rated attempt${d.attemptCount === 1 ? '' : 's'}` +
              (d.againRate != null
                ? ` · again rate ${Math.round(d.againRate * 100)}%`
                : '') +
              (d.lastAttemptDate ? ` · last ${d.lastAttemptDate}` : '')
            : 'No rated attempts yet'
        }
      >
        {d.successRate != null ? (
          <>
            {Math.round(d.successRate * 100)}%{' '}
            <span className="muted">· {d.attemptCount}</span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="num">{d.runsCompleted}</td>
    </tr>
  );
}
