import { useEffect, useMemo, useState } from 'react';
import {
  LAB_SECTIONS,
  type Lab,
  type LabWithDetails,
  type Objective,
} from '@llmstudy/shared';
import { ObjectivePicker } from '../components/ObjectivePicker';
import {
  createLab,
  deleteLab,
  listLabs,
  listObjectives,
  updateLab,
} from '../api/client';

interface LabDraft {
  title: string;
  objective_id: number | null;
  tags: string[];
  hypothesis: string;
  what_changed: string;
  commands_config: string;
  observed_result: string;
  why_it_happened: string;
  what_next: string;
}

export function LabsPage() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [labs, setLabs] = useState<LabWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([listObjectives(), listLabs()])
      .then(([objs, ls]) => {
        setObjectives(objs);
        setLabs(ls);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const allTags = useMemo(
    () => Array.from(new Set(labs.flatMap((l) => l.tags))).sort(),
    [labs],
  );

  async function add(draft: LabDraft) {
    const created = await createLab(draftToPayload(draft));
    setLabs((prev) => [created, ...prev]);
    setAdding(false);
  }

  async function saveEdit(id: number, draft: LabDraft) {
    const updated = await updateLab(id, draftToPayload(draft));
    setLabs((prev) => prev.map((l) => (l.id === id ? updated : l)));
    setEditingId(null);
  }

  async function remove(id: number) {
    await deleteLab(id);
    setLabs((prev) => prev.filter((l) => l.id !== id));
  }

  if (loading) return <p className="muted">Loading lab notebook…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Lab Notebook</h1>
        <p className="muted">
          Turn reading into understanding: form a hypothesis, change one thing, run
          it, record what you saw, and explain why. Each entry links back to an
          objective so hands-on work reinforces the blueprint.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <div className="summary">
        <Stat label="Labs" value={labs.length} />
        <Stat
          label="Linked to objective"
          value={labs.filter((l) => l.objective_id !== null).length}
        />
        <Stat label="Distinct tags" value={allTags.length} />
      </div>

      {adding ? (
        <LabForm
          objectives={objectives}
          allTags={allTags}
          submitLabel="Save lab"
          onSubmit={add}
          onCancel={() => setAdding(false)}
          onError={setError}
        />
      ) : (
        <button className="btn primary add-btn" onClick={() => setAdding(true)}>
          + Add lab
        </button>
      )}

      {labs.length === 0 && !adding && (
        <p className="muted">
          No labs yet. Add one above, or run <code>npm run seed</code> for a couple
          of worked examples.
        </p>
      )}

      <div className="lab-list">
        {labs.map((lab) =>
          editingId === lab.id ? (
            <LabForm
              key={lab.id}
              objectives={objectives}
              allTags={allTags}
              initial={lab}
              submitLabel="Save changes"
              onSubmit={(draft) => saveEdit(lab.id, draft)}
              onCancel={() => setEditingId(null)}
              onError={setError}
            />
          ) : (
            <LabCard
              key={lab.id}
              lab={lab}
              onEdit={() => setEditingId(lab.id)}
              onDelete={() =>
                remove(lab.id).catch((e) => setError(String((e as Error).message ?? e)))
              }
            />
          ),
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function LabCard({
  lab,
  onEdit,
  onDelete,
}: {
  lab: LabWithDetails;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card lab-card">
      <div className="lab-head">
        <strong className="lab-title">{lab.title}</strong>
        {lab.objective_title && (
          <span className="badge status-reviewing">{lab.objective_title}</span>
        )}
      </div>

      {lab.tags.length > 0 && (
        <div className="tag-chips">
          {lab.tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
            </span>
          ))}
        </div>
      )}

      <dl className="lab-fields">
        {LAB_SECTIONS.map(({ key, label }) => {
          const value = lab[key] as string | null;
          if (!value) return null;
          return (
            <div key={key} className="lab-field">
              <dt>{label}</dt>
              <dd>
                {key === 'commands_config' ? (
                  <pre className="lab-commands">{value}</pre>
                ) : (
                  value
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="lab-footer">
        <span className="muted small-text">
          Updated {lab.updated_at.slice(0, 10)}
        </span>
        <div className="q-actions">
          <button className="btn small" onClick={onEdit}>
            Edit
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm(`Delete lab "${lab.title}"?`)) onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function LabForm({
  objectives,
  allTags,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onError,
}: {
  objectives: Objective[];
  allTags: string[];
  initial?: LabWithDetails;
  submitLabel: string;
  onSubmit: (draft: LabDraft) => Promise<void>;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<LabDraft>(() => toDraft(initial));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof LabDraft>(key: K, value: LabDraft[K]) {
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
    <form className="card add-form lab-form" onSubmit={submit}>
      <label>
        Title
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Effect of temperature on answer determinism"
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
        <label className="grow">
          Tags <span className="muted">(comma-separated)</span>
          <input
            value={draft.tags.join(', ')}
            list="lab-tag-options"
            onChange={(e) => set('tags', splitTags(e.target.value))}
            placeholder="prompting, sampling, vram"
          />
          <datalist id="lab-tag-options">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>

      {LAB_SECTIONS.map(({ key, label, hint }) => {
        const field = key as keyof LabDraft;
        return (
          <label key={key}>
            {label} <span className="muted">— {hint}</span>
            <textarea
              rows={key === 'commands_config' ? 4 : 2}
              className={key === 'commands_config' ? 'mono' : undefined}
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

// --- helpers ---------------------------------------------------------------

function toDraft(lab?: LabWithDetails): LabDraft {
  return {
    title: lab?.title ?? '',
    objective_id: lab?.objective_id ?? null,
    tags: lab?.tags ?? [],
    hypothesis: lab?.hypothesis ?? '',
    what_changed: lab?.what_changed ?? '',
    commands_config: lab?.commands_config ?? '',
    observed_result: lab?.observed_result ?? '',
    why_it_happened: lab?.why_it_happened ?? '',
    what_next: lab?.what_next ?? '',
  };
}

function splitTags(raw: string): string[] {
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

function draftToPayload(draft: LabDraft) {
  const bodyKeys: (keyof Lab)[] = [
    'hypothesis',
    'what_changed',
    'commands_config',
    'observed_result',
    'why_it_happened',
    'what_next',
  ];
  const body: Record<string, string | null> = {};
  for (const key of bodyKeys) {
    const value = (draft[key as keyof LabDraft] as string).trim();
    body[key] = value || null;
  }
  return {
    title: draft.title.trim(),
    objective_id: draft.objective_id,
    tags: draft.tags,
    ...body,
  };
}
