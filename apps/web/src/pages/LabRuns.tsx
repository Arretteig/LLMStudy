import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LAB_RUN_SECTIONS,
  LAB_RUN_STATUS_LABELS,
  LAB_RUN_STATUSES,
  LAB_TEMPLATE_SECTIONS,
  type LabRunStatus,
  type LabRunWithDetails,
  type LabTemplateWithDetails,
} from '@llmstudy/shared';
import {
  createQuestion,
  deleteRun,
  listRuns,
  listTemplates,
  updateRun,
} from '../api/client';
import { todayIso } from '../util';

interface RunDraft {
  status: LabRunStatus;
  started_at: string;
  completed_at: string;
  confidence_after: number | null;
  hypothesis: string;
  what_changed: string;
  commands_config: string;
  observed_result: string;
  why_it_happened: string;
  mistakes: string;
  what_next: string;
  notes: string;
}

export function LabRunsPage() {
  const [params, setParams] = useSearchParams();
  const [runs, setRuns] = useState<LabRunWithDetails[]>([]);
  const [templates, setTemplates] = useState<Map<number, LabTemplateWithDetails>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LabRunStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(
    params.get('open') ? Number(params.get('open')) : null,
  );

  useEffect(() => {
    Promise.all([listRuns(), listTemplates()])
      .then(([rs, tpls]) => {
        setRuns(rs);
        setTemplates(new Map(tpls.map((t) => [t.id, t])));
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: number) {
    setExpandedId((cur) => (cur === id ? null : id));
    if (params.get('open')) {
      params.delete('open');
      setParams(params, { replace: true });
    }
  }

  async function save(id: number, draft: RunDraft) {
    const updated = await updateRun(id, draftToPayload(draft));
    setRuns((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }
  async function remove(id: number) {
    await deleteRun(id);
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  const visible = useMemo(
    () => (statusFilter === 'all' ? runs : runs.filter((r) => r.status === statusFilter)),
    [runs, statusFilter],
  );

  if (loading) return <p className="muted">Loading lab runs…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Lab Runs</h1>
        <p className="muted">
          Your actual attempts. Write a hypothesis before you start, record what you
          did and saw, explain why, and rate your confidence afterwards. Turn
          mistakes into recall questions.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <RunsSummary runs={runs} />

      <div className="toolbar">
        <label className="inline">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LabRunStatus | 'all')}
          >
            <option value="all">All</option>
            {LAB_RUN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LAB_RUN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {runs.length === 0 && (
        <p className="muted">
          No lab runs yet. Head to <strong>Lab Templates</strong> and click “Start lab
          run” to begin one.
        </p>
      )}

      <div className="lab-list">
        {visible.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            template={run.template_id ? templates.get(run.template_id) : undefined}
            expanded={expandedId === run.id}
            onToggle={() => toggle(run.id)}
            onSave={(draft) => save(run.id, draft)}
            onDelete={() =>
              remove(run.id).catch((e) => setError(String((e as Error).message ?? e)))
            }
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}

function RunsSummary({ runs }: { runs: LabRunWithDetails[] }) {
  const by = (s: LabRunStatus) => runs.filter((r) => r.status === s).length;
  const rated = runs.filter((r) => r.confidence_after != null);
  const avg =
    rated.length > 0
      ? (rated.reduce((s, r) => s + (r.confidence_after ?? 0), 0) / rated.length).toFixed(1)
      : '—';
  return (
    <div className="summary">
      <Stat label="Runs" value={runs.length} />
      <Stat label="In progress" value={by('in_progress')} />
      <Stat label="Completed" value={by('completed')} />
      <Stat label="Needs repeat" value={by('needs_repeat')} tone={by('needs_repeat') > 0 ? 'warn' : undefined} />
      <Stat label="Avg confidence" value={avg} />
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

function RunRow({
  run,
  template,
  expanded,
  onToggle,
  onSave,
  onDelete,
  onError,
}: {
  run: LabRunWithDetails;
  template?: LabTemplateWithDetails;
  expanded: boolean;
  onToggle: () => void;
  onSave: (draft: RunDraft) => Promise<void>;
  onDelete: () => void;
  onError: (msg: string) => void;
}) {
  return (
    <div className="card lab-card">
      <div className="run-head" onClick={onToggle}>
        <div className="run-head-main">
          <span className={`badge run-${run.status}`}>
            {LAB_RUN_STATUS_LABELS[run.status]}
          </span>
          <strong className="lab-title">
            {run.template_title ?? 'Ad-hoc run'}
          </strong>
          {run.objective_title && (
            <span className="muted small-text">· {run.objective_title}</span>
          )}
        </div>
        <div className="run-head-meta muted small-text">
          {run.confidence_after != null && <span>confidence {run.confidence_after}/5</span>}
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <RunEditor
          run={run}
          template={template}
          onSave={onSave}
          onDelete={onDelete}
          onError={onError}
        />
      )}
    </div>
  );
}

function RunEditor({
  run,
  template,
  onSave,
  onDelete,
  onError,
}: {
  run: LabRunWithDetails;
  template?: LabTemplateWithDetails;
  onSave: (draft: RunDraft) => Promise<void>;
  onDelete: () => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<RunDraft>(() => toDraft(run));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof RunDraft>(key: K, value: RunDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function changeStatus(status: LabRunStatus) {
    setDraft((d) => ({
      ...d,
      status,
      // convenience: stamp completion date when marking complete
      completed_at: status === 'completed' && !d.completed_at ? todayIso() : d.completed_at,
      started_at: status !== 'not_started' && !d.started_at ? todayIso() : d.started_at,
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
    } catch (e) {
      onError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="run-editor">
      {template && <TemplateGuidance template={template} />}

      <div className="run-form">
        <div className="row gap wrap">
          <label className="inline">
            Status
            <select
              value={draft.status}
              onChange={(e) => changeStatus(e.target.value as LabRunStatus)}
            >
              {LAB_RUN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LAB_RUN_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Started
            <input
              type="date"
              value={draft.started_at}
              onChange={(e) => set('started_at', e.target.value)}
            />
          </label>
          <label className="inline">
            Completed
            <input
              type="date"
              value={draft.completed_at}
              onChange={(e) => set('completed_at', e.target.value)}
            />
          </label>
          <label className="inline">
            Confidence after
            <select
              value={draft.confidence_after ?? ''}
              onChange={(e) =>
                set('confidence_after', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {LAB_RUN_SECTIONS.map(({ key, label, hint, mono }) => {
          const field = key as keyof RunDraft;
          return (
            <label key={key}>
              {label} <span className="muted">— {hint}</span>
              <textarea
                rows={mono ? 4 : 2}
                className={mono ? 'mono' : undefined}
                value={draft[field] as string}
                onChange={(e) => set(field, e.target.value as never)}
              />
            </label>
          );
        })}

        <div className="row gap">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save run'}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Delete this lab run?')) onDelete();
            }}
          >
            Delete run
          </button>
        </div>

        <SpinOffQuestion
          objectiveId={run.objective_id}
          seedText={draft.mistakes}
          onError={onError}
        />
      </div>
    </div>
  );
}

function TemplateGuidance({ template }: { template: LabTemplateWithDetails }) {
  return (
    <aside className="run-guidance">
      <div className="run-guidance-head">Template guidance</div>
      <dl className="lab-fields">
        {LAB_TEMPLATE_SECTIONS.map(({ key, label }) => {
          const value = template[key] as string | null;
          if (!value) return null;
          return (
            <div key={key} className="lab-field">
              <dt>{label}</dt>
              <dd>
                {key === 'suggested_commands' ? (
                  <pre className="lab-commands">{value}</pre>
                ) : (
                  value
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}

function SpinOffQuestion({
  objectiveId,
  seedText,
  onError,
}: {
  objectiveId: number | null;
  seedText: string;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);

  function begin() {
    setText(seedText.trim() ? `Explain: ${seedText.trim()}` : '');
    setAnswer('');
    setCreated(false);
    setOpen(true);
  }

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createQuestion({
        question_text: text.trim(),
        objective_id: objectiveId,
        expected_answer: answer.trim() || null,
      });
      setCreated(true);
      setOpen(false);
    } catch (e) {
      onError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (created && !open) {
    return (
      <div className="spinoff-done">
        ✓ Recall question created. <button className="btn small" onClick={begin}>Add another</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn small add-btn spinoff-btn" onClick={begin}>
        + Create recall question from a mistake
      </button>
    );
  }

  return (
    <div className="card spinoff">
      <div className="q-answer-label">New recall question{objectiveId ? ' (linked to this run’s objective)' : ''}</div>
      <label>
        Question
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label>
        Expected answer <span className="muted">(optional)</span>
        <textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </label>
      <div className="row gap">
        <button className="btn primary small" onClick={submit} disabled={saving || !text.trim()}>
          {saving ? 'Saving…' : 'Create question'}
        </button>
        <button className="btn small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function toDraft(run: LabRunWithDetails): RunDraft {
  return {
    status: run.status,
    started_at: run.started_at ?? '',
    completed_at: run.completed_at ?? '',
    confidence_after: run.confidence_after,
    hypothesis: run.hypothesis ?? '',
    what_changed: run.what_changed ?? '',
    commands_config: run.commands_config ?? '',
    observed_result: run.observed_result ?? '',
    why_it_happened: run.why_it_happened ?? '',
    mistakes: run.mistakes ?? '',
    what_next: run.what_next ?? '',
    notes: run.notes ?? '',
  };
}

function draftToPayload(draft: RunDraft) {
  const textKeys = [
    'hypothesis',
    'what_changed',
    'commands_config',
    'observed_result',
    'why_it_happened',
    'mistakes',
    'what_next',
    'notes',
  ] as const;
  const body: Record<string, string | null> = {};
  for (const key of textKeys) {
    body[key] = draft[key].trim() || null;
  }
  return {
    status: draft.status,
    started_at: draft.started_at || null,
    completed_at: draft.completed_at || null,
    confidence_after: draft.confidence_after,
    ...body,
  };
}
