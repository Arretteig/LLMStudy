import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  OBJECTIVE_STATUS_LABELS,
  type DashboardDomainStat,
  type DashboardSummary,
  type WeakObjective,
} from '@llmstudy/shared';
import { getDashboard } from '../api/client';

// Official NCA-GENL exam weights, shown to help prioritise. Source: NVIDIA
// certification page. Not stored in the DB — display-only reference.
const DOMAIN_WEIGHTS: Record<string, number> = {
  'Core Machine Learning and AI Knowledge': 30,
  'Software Development': 24,
  Experimentation: 22,
  'Data Analysis and Visualization': 14,
  'Trustworthy AI': 10,
};

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
      </div>

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
    </div>
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
          <Link className="btn small primary" to="/review">
            Review
          </Link>
        )}
        {w.runCount === 0 && (
          <Link className="btn small" to="/labs">
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
  const weight = DOMAIN_WEIGHTS[d.domain];
  const conf = d.avgConfidence;
  return (
    <tr>
      <td>{d.domain}</td>
      <td className="num">{weight != null ? `${weight}%` : '—'}</td>
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
      <td className="num">{d.dueCount > 0 ? d.dueCount : '·'}</td>
      <td className="num">{d.runsCompleted}</td>
    </tr>
  );
}
