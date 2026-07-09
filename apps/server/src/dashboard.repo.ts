import type {
  DashboardDomainStat,
  DashboardSummary,
  ObjectiveStatus,
  WeakObjective,
} from '@llmstudy/shared';
import type { Db } from './db';
import { addDaysIso, todayIso } from './sr';

// A row of objective + its per-objective aggregates.
interface ObjectiveAggRow {
  id: number;
  title: string;
  domain: string | null;
  status: ObjectiveStatus;
  confidence: number | null;
  evidence_of_understanding: string | null;
  question_count: number;
  due_count: number;
  run_count: number;
}

const OBJECTIVE_AGG = `
  SELECT o.id, o.title, o.domain, o.status, o.confidence, o.evidence_of_understanding,
    (SELECT COUNT(*) FROM recall_questions q WHERE q.objective_id = o.id) AS question_count,
    (SELECT COUNT(*) FROM recall_questions q
       WHERE q.objective_id = o.id
         AND (q.next_review_date IS NULL OR q.next_review_date <= @today)) AS due_count,
    (SELECT COUNT(*) FROM lab_runs r WHERE r.objective_id = o.id) AS run_count
  FROM objectives o
`;

export function getDashboard(db: Db, today: string = todayIso()): DashboardSummary {
  const rows = db.prepare(OBJECTIVE_AGG).all({ today }) as ObjectiveAggRow[];

  // --- objective stats ---
  const byStatus: Record<ObjectiveStatus, number> = {
    not_started: 0,
    learning: 0,
    reviewing: 0,
    confident: 0,
  };
  let weak = 0;
  let unrated = 0;
  let confSum = 0;
  let confN = 0;
  for (const r of rows) {
    byStatus[r.status]++;
    if (r.confidence == null) unrated++;
    else {
      if (r.confidence <= 2) weak++;
      confSum += r.confidence;
      confN++;
    }
  }

  // --- question stats ---
  const q = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN next_review_date IS NULL OR next_review_date <= @today THEN 1 ELSE 0 END) AS due,
         SUM(CASE WHEN last_attempted_date IS NOT NULL THEN 1 ELSE 0 END) AS attempted
       FROM recall_questions`,
    )
    .get({ today }) as { total: number; due: number | null; attempted: number | null };

  // --- review stats ---
  const weekAgo = addDaysIso(today, -7);
  const totalAttempts = (
    db.prepare('SELECT COUNT(*) AS n FROM answer_attempts').get() as { n: number }
  ).n;
  const last7Days = (
    db
      .prepare('SELECT COUNT(*) AS n FROM answer_attempts WHERE date(attempted_date) >= ?')
      .get(weekAgo) as { n: number }
  ).n;
  const avgRecent = db
    .prepare(
      'SELECT AVG(rating) AS avg FROM (SELECT rating FROM answer_attempts ORDER BY id DESC LIMIT 20)',
    )
    .get() as { avg: number | null };

  // --- lab stats ---
  const labs = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM lab_templates) AS templates,
         (SELECT COUNT(*) FROM lab_runs) AS runsTotal,
         (SELECT COUNT(*) FROM lab_runs WHERE status = 'completed') AS runsCompleted,
         (SELECT COUNT(*) FROM lab_runs WHERE status = 'in_progress') AS runsInProgress`,
    )
    .get() as {
    templates: number;
    runsTotal: number;
    runsCompleted: number;
    runsInProgress: number;
  };

  // completed runs per domain (via the run's objective)
  const completedByDomain = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT o.domain AS domain, COUNT(*) AS n
       FROM lab_runs r JOIN objectives o ON o.id = r.objective_id
       WHERE r.status = 'completed' GROUP BY o.domain`,
    )
    .all() as { domain: string | null; n: number }[]) {
    completedByDomain.set(row.domain ?? 'Uncategorized', row.n);
  }

  // --- per-domain rollup ---
  const domainMap = new Map<string, ObjectiveAggRow[]>();
  for (const r of rows) {
    const key = r.domain ?? 'Uncategorized';
    const list = domainMap.get(key) ?? [];
    list.push(r);
    domainMap.set(key, list);
  }
  const domains: DashboardDomainStat[] = Array.from(domainMap.entries())
    .map(([domain, items]) => {
      const rated = items.filter((i) => i.confidence != null);
      const avgConfidence =
        rated.length > 0
          ? rated.reduce((s, i) => s + (i.confidence ?? 0), 0) / rated.length
          : null;
      return {
        domain,
        objectiveCount: items.length,
        avgConfidence,
        weakCount: items.filter((i) => i.confidence != null && i.confidence <= 2).length,
        questionCount: items.reduce((s, i) => s + i.question_count, 0),
        dueCount: items.reduce((s, i) => s + i.due_count, 0),
        runsCompleted: completedByDomain.get(domain) ?? 0,
      };
    })
    .sort((a, b) => a.domain.localeCompare(b.domain));

  // --- weak objectives (ranked "work on this next") ---
  const weakObjectives = rows
    .map((r) => scoreWeakness(r))
    .filter((w) => w.weaknessScore > 0)
    .sort((a, b) => b.weaknessScore - a.weaknessScore)
    .slice(0, 8);

  return {
    today,
    objectives: {
      total: rows.length,
      byStatus,
      weak,
      unrated,
      avgConfidence: confN > 0 ? confSum / confN : null,
    },
    questions: {
      total: q.total,
      due: q.due ?? 0,
      attempted: q.attempted ?? 0,
    },
    reviews: {
      totalAttempts,
      last7Days,
      avgRecentRating: avgRecent.avg,
    },
    labs,
    domains,
    weakObjectives,
  };
}

function scoreWeakness(r: ObjectiveAggRow): WeakObjective {
  let score = 0;
  const reasons: string[] = [];

  if (r.confidence == null) {
    score += 2.5;
    reasons.push('confidence not set');
  } else if (r.confidence <= 2) {
    score += 5 - r.confidence; // 1 -> 4, 2 -> 3
    reasons.push(`confidence ${r.confidence}/5`);
  } else {
    score += 5 - r.confidence; // 3 -> 2, 4 -> 1, 5 -> 0
  }

  if (r.status === 'not_started') {
    score += 2;
    reasons.push('not started');
  } else if (r.status === 'learning') {
    score += 1;
  }

  if (r.question_count === 0) {
    score += 1;
    reasons.push('no recall questions');
  } else if (r.due_count > 0) {
    score += 1;
    reasons.push(`${r.due_count} question${r.due_count === 1 ? '' : 's'} due`);
  }

  if (r.run_count === 0) {
    score += 1;
    reasons.push('no lab runs');
  }

  const hasEvidence = !!(r.evidence_of_understanding && r.evidence_of_understanding.trim());
  if (!hasEvidence) {
    score += 0.5;
    reasons.push('no evidence recorded');
  }

  return {
    id: r.id,
    title: r.title,
    domain: r.domain,
    status: r.status,
    confidence: r.confidence,
    questionCount: r.question_count,
    dueCount: r.due_count,
    runCount: r.run_count,
    hasEvidence,
    weaknessScore: Math.round(score * 10) / 10,
    reasons,
  };
}
