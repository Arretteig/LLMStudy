import { useEffect, useMemo, useState } from 'react';
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_LABELS,
  type Objective,
  type ObjectiveStatus,
} from '@llmstudy/shared';
import {
  createObjective,
  listObjectives,
  updateObjective,
} from '../api/client';

export function ObjectivesPage() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listObjectives()
      .then(setObjectives)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  // Optimistic-ish local update: replace the row returned by the API.
  function replace(updated: Objective) {
    setObjectives((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  async function patch(id: number, changes: Partial<Objective>) {
    try {
      replace(await updateObjective(id, changes));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  async function add(input: { title: string; domain: string; description: string }) {
    const created = await createObjective({
      title: input.title.trim(),
      domain: input.domain.trim() || null,
      description: input.description.trim() || null,
    });
    setObjectives((prev) => [...prev, created]);
  }

  const domains = useMemo(
    () =>
      Array.from(
        new Set(objectives.map((o) => o.domain).filter((d): d is string => !!d)),
      ).sort(),
    [objectives],
  );

  const grouped = useMemo(() => groupByDomain(objectives), [objectives]);

  if (loading) return <p className="muted">Loading objectives…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Certification Objectives</h1>
        <p className="muted">
          Track what the NCA-GENL blueprint expects you to know. Set your confidence
          and status as you study; weak areas surface at the top of the summary.
        </p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      <Summary objectives={objectives} />

      <AddObjectiveForm domains={domains} onAdd={add} onError={setError} />

      {grouped.map(([domain, items]) => (
        <section key={domain} className="domain-group">
          <h2 className="domain-title">
            {domain} <span className="count">{items.length}</span>
          </h2>
          <div className="obj-list">
            {items.map((o) => (
              <ObjectiveRow key={o.id} objective={o} onPatch={patch} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Summary({ objectives }: { objectives: Objective[] }) {
  const total = objectives.length;
  const byStatus = (s: ObjectiveStatus) =>
    objectives.filter((o) => o.status === s).length;
  const weak = objectives.filter(
    (o) => o.confidence != null && o.confidence <= 2,
  ).length;
  const rated = objectives.filter((o) => o.confidence != null);
  const avg =
    rated.length > 0
      ? (
          rated.reduce((sum, o) => sum + (o.confidence ?? 0), 0) / rated.length
        ).toFixed(1)
      : '—';

  return (
    <div className="summary">
      <Stat label="Total" value={total} />
      <Stat label="Not started" value={byStatus('not_started')} />
      <Stat label="Learning" value={byStatus('learning')} />
      <Stat label="Reviewing" value={byStatus('reviewing')} />
      <Stat label="Confident" value={byStatus('confident')} />
      <Stat label="Weak (conf ≤ 2)" value={weak} tone="warn" />
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

function AddObjectiveForm({
  domains,
  onAdd,
  onError,
}: {
  domains: string[];
  onAdd: (i: { title: string; domain: string; description: string }) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAdd({ title, domain, description });
      setTitle('');
      setDomain('');
      setDescription('');
      setOpen(false);
    } catch (err) {
      onError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn primary add-btn" onClick={() => setOpen(true)}>
        + Add objective
      </button>
    );
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <label>
        Title
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Retrieval-augmented generation basics"
        />
      </label>
      <label>
        Domain
        <input
          value={domain}
          list="domain-options"
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. Software Development"
        />
        <datalist id="domain-options">
          {domains.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>
      <label>
        Description
        <textarea
          value={description}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does mastering this objective look like?"
        />
      </label>
      <div className="row gap">
        <button className="btn primary" disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Save objective'}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ObjectiveRow({
  objective,
  onPatch,
}: {
  objective: Objective;
  onPatch: (id: number, changes: Partial<Objective>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className={`card obj ${objective.status}`}>
      <div className="obj-main">
        <div className="obj-headline">
          <span className={`badge status-${objective.status}`}>
            {OBJECTIVE_STATUS_LABELS[objective.status]}
          </span>
          <strong className="obj-title">{objective.title}</strong>
        </div>
        {objective.description && !editing && (
          <p className="obj-desc muted">{objective.description}</p>
        )}
      </div>

      <div className="obj-controls">
        <label className="inline">
          Status
          <select
            value={objective.status}
            onChange={(e) =>
              onPatch(objective.id, { status: e.target.value as ObjectiveStatus })
            }
          >
            {OBJECTIVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OBJECTIVE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          Confidence
          <select
            value={objective.confidence ?? ''}
            onChange={(e) =>
              onPatch(objective.id, {
                confidence: e.target.value === '' ? null : Number(e.target.value),
              })
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
        <button className="btn small" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {editing && (
        <ObjectiveEditor
          objective={objective}
          onSave={async (changes) => {
            await onPatch(objective.id, changes);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function ObjectiveEditor({
  objective,
  onSave,
}: {
  objective: Objective;
  onSave: (changes: Partial<Objective>) => Promise<void>;
}) {
  const [title, setTitle] = useState(objective.title);
  const [description, setDescription] = useState(objective.description ?? '');
  const [notes, setNotes] = useState(objective.notes ?? '');
  const [evidence, setEvidence] = useState(objective.evidence_of_understanding ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        title: title.trim() || objective.title,
        description: description.trim() || null,
        notes: notes.trim() || null,
        evidence_of_understanding: evidence.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="obj-editor">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Description
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Notes
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label>
        Evidence of understanding
        <textarea
          rows={2}
          value={evidence}
          placeholder="A lab you ran, an explanation you wrote, a question you can now answer…"
          onChange={(e) => setEvidence(e.target.value)}
        />
      </label>
      <button className="btn primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

function groupByDomain(objectives: Objective[]): [string, Objective[]][] {
  const map = new Map<string, Objective[]>();
  for (const o of objectives) {
    const key = o.domain ?? 'Uncategorized';
    const list = map.get(key) ?? [];
    list.push(o);
    map.set(key, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}
