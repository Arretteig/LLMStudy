import type {
  CalibrationSummary,
  DashboardDomainStat,
  DashboardSummary,
  ObjectiveStatus,
  ReadinessInfo,
  StreakInfo,
  WeakObjective,
} from '@llmstudy/shared';
import type { Db } from './db';
import { weightByDomain } from './domains.repo';
import { listDue } from './reviews.repo';
import { getSettings } from './settings.repo';
import { addDaysIso, daysBetween, todayIso } from './sr';

// TIMEZONE: every analytics query in this file reads answer_attempts
// .attempted_date / next_review_date, which sr.ts writes in LOCAL wall-clock
// time — so date(attempted_date) is the user's calendar day. The created_at /
// updated_at columns are UTC bookkeeping (SQLite datetime('now')) and must
// never feed analytics, or day boundaries shift by the UTC offset.

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

// question_count/due_count count RECALL questions only — MCQs never enter the
// spaced Review queue (they surface via Drill/Exams), so counting them here
// would inflate "due" numbers nothing in Review can pay down.
const OBJECTIVE_AGG = `
  SELECT o.id, o.title, o.domain, o.status, o.confidence, o.evidence_of_understanding,
    (SELECT COUNT(*) FROM recall_questions q
       WHERE q.objective_id = o.id AND q.question_format = 'recall') AS question_count,
    (SELECT COUNT(*) FROM recall_questions q
       WHERE q.objective_id = o.id AND q.question_format = 'recall'
         AND (q.next_review_date IS NULL OR q.next_review_date <= @today)) AS due_count,
    (SELECT COUNT(*) FROM lab_runs r WHERE r.objective_id = o.id) AS run_count
  FROM objectives o
`;

// Per-objective recall stats (F17), via attempts -> questions. The window
// function ranks each objective's attempts newest-first so AVG over rn <= 10
// is the mean of the LAST 10 attempts; attempt_count/last day cover them all.
const OBJECTIVE_RECALL_STATS = `
  SELECT objective_id,
         COUNT(*) AS attempt_count,
         MAX(day) AS last_attempt_day,
         AVG(CASE WHEN rn <= 10 THEN rating END) AS mean_recent_rating
  FROM (
    SELECT q.objective_id AS objective_id,
           a.rating AS rating,
           date(a.attempted_date) AS day,
           ROW_NUMBER() OVER (PARTITION BY q.objective_id ORDER BY a.id DESC) AS rn
    FROM answer_attempts a
    JOIN recall_questions q ON q.id = a.question_id
    WHERE q.objective_id IS NOT NULL
  )
  GROUP BY objective_id
`;

interface ObjectiveRecallRow {
  objective_id: number;
  attempt_count: number;
  last_attempt_day: string;
  mean_recent_rating: number;
}

// ---------------------------------------------------------------------------
// Streak (F13) — always derived from answer_attempts, never stored.
// ---------------------------------------------------------------------------

/** Attempts per day for a day to count as active (see computeStreak). */
const DAILY_GOAL = 5;

/** Repair tokens are earned 1 per 7 cumulative active days, banked up to 2. */
const TOKEN_EARN_EVERY = 7;
const TOKEN_BANK_CAP = 2;

/**
 * Walk attempt history oldest -> today and derive the daily-habit streak.
 *
 * A day is ACTIVE when it has >= DAILY_GOAL attempts — or, for today only,
 * >= 1 attempt with the due queue cleared (an empty queue shouldn't force
 * busywork to keep a streak). An inactive PAST day consumes a repair token if
 * one is banked (the streak continues through it, and the repaired day counts
 * toward its length); with no token the streak breaks. Today being inactive
 * so far never breaks the streak — it is still in progress, so `current` is
 * reported through yesterday with activeToday false. `longest` is tracked
 * over the same walk with the same token rules.
 */
export function computeStreak(db: Db, today: string = todayIso()): StreakInfo {
  // Deliberately SOURCE-INCLUSIVE: review, drill, and exam attempts all count
  // toward the streak and reviewsToday — a mock-exam day is a study day.
  const rows = db
    .prepare(
      `SELECT date(attempted_date) AS day, COUNT(*) AS n
       FROM answer_attempts GROUP BY day ORDER BY day`,
    )
    .all() as { day: string; n: number }[];

  const countByDay = new Map(rows.map((r) => [r.day, r.n]));
  const reviewsToday = countByDay.get(today) ?? 0;
  const queueCleared = reviewsToday > 0 && listDue(db, today).length === 0;

  let current = 0;
  let longest = 0;
  let tokens = 0;
  let cumulativeActive = 0;
  let activeToday = false;

  const firstDay = rows.length > 0 ? rows[0].day : null;
  if (firstDay !== null) {
    for (let day = firstDay; day <= today; day = addDaysIso(day, 1)) {
      const isToday = day === today;
      const n = countByDay.get(day) ?? 0;
      const active = n >= DAILY_GOAL || (isToday && n >= 1 && queueCleared);

      if (active) {
        current += 1;
        cumulativeActive += 1;
        if (cumulativeActive % TOKEN_EARN_EVERY === 0) {
          tokens = Math.min(TOKEN_BANK_CAP, tokens + 1);
        }
        if (isToday) activeToday = true;
      } else if (isToday) {
        // Grace: today isn't over — keep the streak as of yesterday.
      } else if (current > 0) {
        if (tokens > 0) {
          tokens -= 1;
          current += 1; // repaired — the run stays calendar-contiguous
        } else {
          current = 0;
        }
      }
      if (current > longest) longest = current;
    }
  }

  return {
    current,
    longest,
    activeToday,
    reviewsToday,
    repairTokens: tokens,
    dailyGoal: DAILY_GOAL,
  };
}

// ---------------------------------------------------------------------------
// Retention (F15) + readiness (mastery signal)
// ---------------------------------------------------------------------------

// Per-domain retention, via attempts -> questions -> objectives. Questions
// with no objective (or an objective without a domain) roll up under the
// existing 'Uncategorized' convention.
const DOMAIN_RETENTION = `
  SELECT COALESCE(o.domain, 'Uncategorized') AS domain,
         COUNT(*) AS attemptCount,
         AVG(a.rating >= 3) AS successRate,
         AVG(a.rating <= 2) AS againRate,
         MAX(date(a.attempted_date)) AS lastAttemptDate
  FROM answer_attempts a
  JOIN recall_questions q ON q.id = a.question_id
  LEFT JOIN objectives o ON o.id = q.objective_id
  GROUP BY COALESCE(o.domain, 'Uncategorized')
`;

interface DomainRetentionRow {
  domain: string;
  attemptCount: number;
  successRate: number;
  againRate: number;
  lastAttemptDate: string;
}

const READINESS_MIN_ATTEMPTS = 20;
const READINESS_MIN_SUCCESS = 0.85;

/** Ready to book the exam when EVERY domain has 20+ attempts at >= 85% success. */
function computeReadiness(domains: DashboardDomainStat[]): ReadinessInfo {
  const notEnough = {
    ready: false,
    detail: 'Not enough review history yet (need 20+ rated attempts per domain)',
  };
  if (domains.length === 0) return notEnough;
  if (domains.some((d) => d.attemptCount < READINESS_MIN_ATTEMPTS)) return notEnough;

  const below = domains.filter(
    (d) => (d.successRate ?? 0) < READINESS_MIN_SUCCESS,
  ).length;
  if (below > 0) {
    return {
      ready: false,
      detail: `${below} of ${domains.length} domains below 85% retention`,
    };
  }
  return { ready: true, detail: 'Ready: all domains >= 85% retention' };
}

// ---------------------------------------------------------------------------
// Calibration (F19) — confidence vs. correctness over a recent window
// ---------------------------------------------------------------------------
// NOTE: deliberately NO scheduling changes for confident-wrong ("hypercorrection")
// cards. The growing ladder already implements the hypercorrection re-test
// pattern: a lapse (rating 1-2) snaps the card back to a 1-2 day interval, and
// its first success after that reschedules it ~7 days out — exactly the short
// then medium re-test spacing the effect calls for.

/** Attempts window (days over date(attempted_date)) for the calibration summary. */
const CALIBRATION_WINDOW_DAYS = 30;

/** "Sure" pre-reveal confidence (the 3 on the 1-3 scale). */
const CONFIDENT = 3;

const CALIBRATION_QUADRANT = `
  SELECT
    COALESCE(SUM(confidence = ${CONFIDENT} AND rating >= 3), 0) AS confidentCorrect,
    COALESCE(SUM(confidence = ${CONFIDENT} AND rating <= 2), 0) AS confidentWrong,
    COALESCE(SUM(confidence < ${CONFIDENT} AND rating >= 3), 0) AS unsureCorrect,
    COALESCE(SUM(confidence < ${CONFIDENT} AND rating <= 2), 0) AS unsureWrong
  FROM answer_attempts
  WHERE confidence IS NOT NULL AND date(attempted_date) >= @since
`;

// Danger zone: distinct questions with a confident-wrong attempt in-window,
// newest first (MAX(a.id) is attempt recency), capped at 10.
const DANGER_ZONE = `
  SELECT a.question_id, q.question_text, o.title AS objective_title,
         MAX(date(a.attempted_date)) AS last_wrong_date
  FROM answer_attempts a
  JOIN recall_questions q ON q.id = a.question_id
  LEFT JOIN objectives o ON o.id = q.objective_id
  WHERE a.confidence = ${CONFIDENT} AND a.rating <= 2
    AND date(a.attempted_date) >= @since
  GROUP BY a.question_id
  ORDER BY MAX(a.id) DESC
  LIMIT 10
`;

function computeCalibration(
  db: Db,
  today: string,
  objectives: ObjectiveAggRow[],
  recallStats: Map<number, ObjectiveRecallRow>,
): CalibrationSummary {
  const since = addDaysIso(today, -CALIBRATION_WINDOW_DAYS);

  const quadrant = db
    .prepare(CALIBRATION_QUADRANT)
    .get({ since }) as CalibrationSummary['quadrant'];

  const dangerZone = db
    .prepare(DANGER_ZONE)
    .all({ since }) as CalibrationSummary['dangerZone'];

  // Overconfident objectives: self-set confidence says "I know this" (>= 4)
  // but the last 10 attempts say otherwise (mean <= 2.5, over >= 3 attempts).
  const overconfidentObjectives = objectives
    .flatMap((o) => {
      const recall = recallStats.get(o.id);
      if (
        o.confidence == null ||
        o.confidence < 4 ||
        !recall ||
        recall.attempt_count < MIN_ATTEMPTS_FOR_ACCURACY ||
        recall.mean_recent_rating > 2.5
      ) {
        return [];
      }
      return [
        {
          id: o.id,
          title: o.title,
          confidence: o.confidence,
          meanRecentRating: recall.mean_recent_rating,
        },
      ];
    })
    .sort((a, b) => a.meanRecentRating - b.meanRecentRating); // worst first

  return {
    windowDays: CALIBRATION_WINDOW_DAYS,
    quadrant,
    dangerZone,
    overconfidentObjectives,
  };
}

export function getDashboard(db: Db, today: string = todayIso()): DashboardSummary {
  const rows = db.prepare(OBJECTIVE_AGG).all({ today }) as ObjectiveAggRow[];

  // Official exam weights (F16) + per-objective recall stats (F17), shared by
  // the domain rollup, weak-area ranking, and calibration below.
  const weights = weightByDomain(db);
  const recallStats = new Map(
    (db.prepare(OBJECTIVE_RECALL_STATS).all() as ObjectiveRecallRow[]).map((r) => [
      r.objective_id,
      r,
    ]),
  );

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

  // --- question stats (RECALL only) ---
  // MCQs are drilled/mock-examed, never spaced-reviewed, so they would always
  // read as "due, never attempted" here and permanently skew these counters.
  const q = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN next_review_date IS NULL OR next_review_date <= @today THEN 1 ELSE 0 END) AS due,
         SUM(CASE WHEN last_attempted_date IS NOT NULL THEN 1 ELSE 0 END) AS attempted
       FROM recall_questions
       WHERE question_format = 'recall'`,
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

  // --- per-domain retention (F15) ---
  const retentionByDomain = new Map(
    (db.prepare(DOMAIN_RETENTION).all() as DomainRetentionRow[]).map((r) => [
      r.domain,
      r,
    ]),
  );

  // --- per-domain rollup ---
  const domainMap = new Map<string, ObjectiveAggRow[]>();
  for (const r of rows) {
    const key = r.domain ?? 'Uncategorized';
    const list = domainMap.get(key) ?? [];
    list.push(r);
    domainMap.set(key, list);
  }
  // Attempts on unlinked questions can create a domain (Uncategorized) that no
  // objective produces — give it an empty objective bucket so its retention
  // stats still surface.
  for (const domain of retentionByDomain.keys()) {
    if (!domainMap.has(domain)) domainMap.set(domain, []);
  }
  const domains: DashboardDomainStat[] = Array.from(domainMap.entries())
    .map(([domain, items]) => {
      const rated = items.filter((i) => i.confidence != null);
      const avgConfidence =
        rated.length > 0
          ? rated.reduce((s, i) => s + (i.confidence ?? 0), 0) / rated.length
          : null;
      const retention = retentionByDomain.get(domain);
      return {
        domain,
        objectiveCount: items.length,
        avgConfidence,
        weakCount: items.filter((i) => i.confidence != null && i.confidence <= 2).length,
        questionCount: items.reduce((s, i) => s + i.question_count, 0),
        dueCount: items.reduce((s, i) => s + i.due_count, 0),
        runsCompleted: completedByDomain.get(domain) ?? 0,
        attemptCount: retention?.attemptCount ?? 0,
        successRate: retention?.successRate ?? null,
        againRate: retention?.againRate ?? null,
        lastAttemptDate: retention?.lastAttemptDate ?? null,
        weight: weights.get(domain) ?? null, // Uncategorized/unknown -> null
      };
    })
    .sort((a, b) => a.domain.localeCompare(b.domain));

  // --- weak objectives (ranked "work on this next") ---
  const weakObjectives = rows
    .map((r) => scoreWeakness(r, recallStats.get(r.id), weights, today))
    .filter((w) => w.weaknessScore > 0)
    .sort((a, b) => b.weaknessScore - a.weaknessScore)
    .slice(0, 8);

  // --- exam countdown + streak + readiness ---
  const examDate = getSettings(db).exam_date;

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
    streak: computeStreak(db, today),
    examDate,
    daysToExam: examDate ? daysBetween(today, examDate) : null,
    readiness: computeReadiness(domains),
    calibration: computeCalibration(db, today, rows, recallStats),
  };
}

/** Only trust an objective's recent-recall mean once it has this many attempts. */
const MIN_ATTEMPTS_FOR_ACCURACY = 3;

function scoreWeakness(
  r: ObjectiveAggRow,
  recall: ObjectiveRecallRow | undefined,
  weights: Map<string, number>,
  today: string,
): WeakObjective {
  let score = 0;
  const reasons: string[] = [];

  const meanRecentRating = recall ? recall.mean_recent_rating : null;
  const daysSinceLastAttempt = recall
    ? daysBetween(recall.last_attempt_day, today)
    : null;
  const examWeight = r.domain != null ? weights.get(r.domain) ?? null : null;

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
    // Due bump scales with the backlog (0.25/question, capped at 2) so ten
    // overdue cards outrank one, without swamping the accuracy signal.
    score += Math.min(2, 0.25 * r.due_count);
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

  // Accuracy (F17): demonstrated recall trumps self-assessment. Mean recent
  // rating below the 3.5 midpoint adds up to 3.75 (at mean 1.0) — enough to
  // outrank a low-confidence-but-accurate objective.
  if (recall && recall.attempt_count >= MIN_ATTEMPTS_FOR_ACCURACY) {
    score += Math.max(0, (3.5 - recall.mean_recent_rating) * 1.5);
    if (recall.mean_recent_rating <= 2.5) {
      reasons.push(`recent recall ${recall.mean_recent_rating.toFixed(1)}/5`);
    }
  }

  // Recency (F17): attempted but going stale — grows 0.1/day from a week out,
  // capped at 1.5 (15+ days).
  if (daysSinceLastAttempt != null && daysSinceLastAttempt >= 7) {
    score += Math.min(1.5, 0.1 * daysSinceLastAttempt);
    if (daysSinceLastAttempt >= 14) {
      reasons.push(`not reviewed in ${daysSinceLastAttempt} days`);
    }
  }

  // Exam-weight multiplier LAST (F16/F17): a 30% domain scores 1.5x, a 10%
  // domain ~0.83x; unknown domains keep the raw score.
  if (examWeight != null) {
    score *= 0.5 + examWeight / 30;
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
    meanRecentRating,
    daysSinceLastAttempt,
    examWeight,
  };
}
