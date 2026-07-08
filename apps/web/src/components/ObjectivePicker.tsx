import type { Objective } from '@llmstudy/shared';

/**
 * A <select> of objectives grouped by domain. Reused wherever something links
 * to an objective (questions now, labs in M4). Value is the objective id or
 * null for "no objective".
 */
export function ObjectivePicker({
  objectives,
  value,
  onChange,
  allowNone = true,
  id,
}: {
  objectives: Objective[];
  value: number | null;
  onChange: (objectiveId: number | null) => void;
  allowNone?: boolean;
  id?: string;
}) {
  const groups = groupByDomain(objectives);

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      {allowNone && <option value="">— No objective —</option>}
      {groups.map(([domain, items]) => (
        <optgroup key={domain} label={domain}>
          {items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
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
