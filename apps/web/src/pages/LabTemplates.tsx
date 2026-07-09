import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LAB_TEMPLATE_SECTIONS,
  type LabTemplate,
  type LabTemplateWithDetails,
  type Objective,
} from '@llmstudy/shared';
import { ObjectivePicker } from '../components/ObjectivePicker';
import {
  createRun,
  createTemplate,
  deleteTemplate,
  listObjectives,
  listTemplates,
  updateTemplate,
} from '../api/client';
import { todayIso } from '../util';

interface TemplateDraft {
  title: string;
  objective_id: number | null;
  domain: string;
  tags: string[];
  difficulty: number | null;
  estimated_minutes: number | null;
  goal: string;
  background: string;
  instructions: string;
  success_criteria: string;
  reflection_questions: string;
  suggested_commands: string;
}

export function LabTemplatesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [templates, setTemplates] = useState<LabTemplateWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The objective filter lives in the URL (?objective=<id>) so dashboard
  // deep links land pre-filtered and the filter survives reloads.
  const objectiveFilter: number | 'all' = useMemo(() => {
    const raw = params.get('objective');
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? n : 'all';
  }, [params]);

  function setObjectiveFilter(next: number | 'all') {
    if (next === 'all') params.delete('objective');
    else params.set('objective', String(next));
    setParams(params, { replace: true });
  }

  useEffect(() => {
    Promise.all([listObjectives(), listTemplates()])
      .then(([objs, tpls]) => {
        setObjectives(objs);
        setTemplates(tpls);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const domains = useMemo(
    () =>
      Array.from(
        new Set(objectives.map((o) => o.domain).filter((d): d is string => !!d)),
      ).sort(),
    [objectives],
  );

  const visible = useMemo(
    () =>
      objectiveFilter === 'all'
        ? templates
        : templates.filter((t) => t.objective_id === objectiveFilter),
    [templates, objectiveFilter],
  );
  const grouped = useMemo(() => groupByDomain(visible), [visible]);

  async function add(draft: TemplateDraft) {
    const created = await createTemplate(draftToPayload(draft));
    setTemplates((prev) => [...prev, created]);
    setAdding(false);
  }
  async function saveEdit(id: number, draft: TemplateDraft) {
    const updated = await updateTemplate(id, draftToPayload(draft));
    setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingId(null);
  }
  async function remove(id: number) {
    await deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }
  async function startRun(t: LabTemplateWithDetails) {
    try {
      const run = await createRun({
        template_id: t.id,
        objective_id: t.objective_id,
        status: 'in_progress',
        started_at: todayIso(),
      });
      navigate(`/runs?open=${run.id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  if (loading) return <p className="muted">Loading lab templates…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Lab Templates</h1>
        <p className="muted">
          Guided, reusable exercises tied to objectives. Pick one — ideally for a
          weak objective — and start a run to work through it and record what you
          learn.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <div className="toolbar">
        <label className="inline">
          Objective
          <select
            value={objectiveFilter === 'all' ? '' : objectiveFilter}
            onChange={(e) =>
              setObjectiveFilter(e.target.value === '' ? 'all' : Number(e.target.value))
            }
          >
            <option value="">All objectives</option>
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
                {o.confidence != null && o.confidence <= 2 ? ' — weak' : ''}
              </option>
            ))}
          </select>
        </label>
        {!adding && editingId === null && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            + Add template
          </button>
        )}
      </div>

      {adding && (
        <TemplateForm
          objectives={objectives}
          domains={domains}
          submitLabel="Save template"
          onSubmit={add}
          onCancel={() => setAdding(false)}
          onError={setError}
        />
      )}

      {visible.length === 0 && !adding && (
        <p className="muted">
          No templates{objectiveFilter !== 'all' ? ' for this objective' : ''}. Add one
          above, or run <code>npm run seed</code> for starter exercises.
        </p>
      )}

      {grouped.map(([domain, items]) => (
        <section key={domain} className="domain-group">
          <h2 className="domain-title">
            {domain} <span className="count">{items.length}</span>
          </h2>
          <div className="obj-list">
            {items.map((t) =>
              editingId === t.id ? (
                <TemplateForm
                  key={t.id}
                  objectives={objectives}
                  domains={domains}
                  initial={t}
                  submitLabel="Save changes"
                  onSubmit={(draft) => saveEdit(t.id, draft)}
                  onCancel={() => setEditingId(null)}
                  onError={setError}
                />
              ) : (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onStart={() => startRun(t)}
                  onEdit={() => setEditingId(t.id)}
                  onDelete={() =>
                    remove(t.id).catch((e) => setError(String((e as Error).message ?? e)))
                  }
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function TemplateCard({
  template,
  onStart,
  onEdit,
  onDelete,
}: {
  template: LabTemplateWithDetails;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card lab-card">
      <div className="lab-head">
        <strong className="lab-title">{template.title}</strong>
        {template.difficulty != null && (
          <span className="badge diff">D{template.difficulty}</span>
        )}
        {template.estimated_minutes != null && (
          <span className="muted small-text">~{template.estimated_minutes} min</span>
        )}
        {template.run_count > 0 && (
          <span className="muted small-text">· run {template.run_count}×</span>
        )}
      </div>

      {template.objective_title && (
        <span className="badge status-reviewing">{template.objective_title}</span>
      )}
      {template.tags.length > 0 && (
        <div className="tag-chips">
          {template.tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
            </span>
          ))}
        </div>
      )}

      {template.goal && (
        <div className="lab-field">
          <dt>Goal</dt>
          <dd>{template.goal}</dd>
        </div>
      )}

      {open && (
        <dl className="lab-fields">
          {LAB_TEMPLATE_SECTIONS.filter((s) => s.key !== 'goal').map(({ key, label }) => {
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
      )}

      <div className="lab-footer">
        <button className="btn small" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide details' : 'Show details'}
        </button>
        <div className="q-actions">
          <button className="btn primary small" onClick={onStart}>
            Start lab run
          </button>
          <button className="btn small" onClick={onEdit}>
            Edit
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm(`Delete template "${template.title}"?`)) onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateForm({
  objectives,
  domains,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onError,
}: {
  objectives: Objective[];
  domains: string[];
  initial?: LabTemplateWithDetails;
  submitLabel: string;
  onSubmit: (draft: TemplateDraft) => Promise<void>;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(() => toDraft(initial));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      onError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <label>
        Title
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Compare zero-shot and few-shot prompting"
        />
      </label>
      <div className="row gap wrap">
        <label>
          Objective
          <ObjectivePicker
            objectives={objectives}
            value={draft.objective_id}
            onChange={(id) => set('objective_id', id)}
          />
        </label>
        <label>
          Domain
          <input
            value={draft.domain}
            list="template-domains"
            onChange={(e) => set('domain', e.target.value)}
          />
          <datalist id="template-domains">
            {domains.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label>
          Difficulty
          <NumSelect value={draft.difficulty} onChange={(v) => set('difficulty', v)} />
        </label>
        <label>
          Est. minutes
          <input
            type="number"
            min={0}
            value={draft.estimated_minutes ?? ''}
            onChange={(e) =>
              set('estimated_minutes', e.target.value === '' ? null : Number(e.target.value))
            }
          />
        </label>
      </div>
      <label>
        Tags <span className="muted">(comma-separated)</span>
        <input
          value={draft.tags.join(', ')}
          onChange={(e) => set('tags', splitTags(e.target.value))}
          placeholder="prompting, few-shot"
        />
      </label>

      {LAB_TEMPLATE_SECTIONS.map(({ key, label, hint }) => {
        const field = key as keyof TemplateDraft;
        const isCommands = key === 'suggested_commands';
        const isInstructions = key === 'instructions';
        return (
          <label key={key}>
            {label} <span className="muted">— {hint}</span>
            <textarea
              rows={isInstructions ? 5 : isCommands ? 3 : 2}
              className={isCommands ? 'mono' : undefined}
              value={draft[field] as string}
              onChange={(e) => set(field, e.target.value as never)}
            />
          </label>
        );
      })}

      <div className="row gap">
        <button className="btn primary" disabled={saving || !draft.title.trim()}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function NumSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">—</option>
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

function toDraft(t?: LabTemplateWithDetails): TemplateDraft {
  return {
    title: t?.title ?? '',
    objective_id: t?.objective_id ?? null,
    domain: t?.domain ?? '',
    tags: t?.tags ?? [],
    difficulty: t?.difficulty ?? null,
    estimated_minutes: t?.estimated_minutes ?? null,
    goal: t?.goal ?? '',
    background: t?.background ?? '',
    instructions: t?.instructions ?? '',
    success_criteria: t?.success_criteria ?? '',
    reflection_questions: t?.reflection_questions ?? '',
    suggested_commands: t?.suggested_commands ?? '',
  };
}

function splitTags(raw: string): string[] {
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

function draftToPayload(draft: TemplateDraft) {
  const textKeys: (keyof LabTemplate)[] = [
    'goal',
    'background',
    'instructions',
    'success_criteria',
    'reflection_questions',
    'suggested_commands',
  ];
  const body: Record<string, string | null> = {};
  for (const key of textKeys) {
    const v = (draft[key as keyof TemplateDraft] as string).trim();
    body[key] = v || null;
  }
  return {
    title: draft.title.trim(),
    objective_id: draft.objective_id,
    domain: draft.domain.trim() || null,
    difficulty: draft.difficulty,
    estimated_minutes: draft.estimated_minutes,
    tags: draft.tags,
    ...body,
  };
}

function groupByDomain(
  templates: LabTemplateWithDetails[],
): [string, LabTemplateWithDetails[]][] {
  const map = new Map<string, LabTemplateWithDetails[]>();
  for (const t of templates) {
    const key = t.domain ?? 'Uncategorized';
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}
