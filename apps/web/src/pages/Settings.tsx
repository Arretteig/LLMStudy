import { useEffect, useState } from 'react';
import type { AppSettings, AppSettingsUpdate } from '@llmstudy/shared';
import { getSettings, updateSettings } from '../api/client';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // Draft string for the number input so partial typing isn't saved.
  const [cardsDraft, setCardsDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setCardsDraft(String(s.new_cards_per_day));
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  async function save(patch: AppSettingsUpdate) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Server response is authoritative — state updates on response.
      const next = await updateSettings(patch);
      setSettings(next);
      setCardsDraft(String(next.new_cards_per_day));
      setSaved(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function commitCards() {
    if (!settings) return;
    const n = Number(cardsDraft);
    if (cardsDraft.trim() === '' || !Number.isInteger(n) || n < 0 || n > 100) {
      setError('New cards per day must be a whole number from 0 to 100.');
      setCardsDraft(String(settings.new_cards_per_day));
      return;
    }
    if (n === settings.new_cards_per_day) return;
    void save({ new_cards_per_day: n });
  }

  if (!settings && !error) return <p className="muted">Loading settings…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted">Study-plan knobs. Changes save automatically.</p>
      </div>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}
      {saved && !error && (
        <div className="banner success" onClick={() => setSaved(false)}>
          Settings saved. <span className="muted">(click to dismiss)</span>
        </div>
      )}

      {settings && (
        <div className="card settings-card">
          <label>
            Exam date
            <div className="row gap">
              <input
                type="date"
                value={settings.exam_date ?? ''}
                onChange={(e) => void save({ exam_date: e.target.value || null })}
              />
              <button
                className="btn small"
                disabled={saving || settings.exam_date === null}
                onClick={() => void save({ exam_date: null })}
              >
                Clear
              </button>
            </div>
            <span className="muted small-text">
              Optional — used to cap review intervals so every card gets a touch
              before exam day.
            </span>
          </label>

          <label>
            New cards per day
            <input
              type="number"
              min={0}
              max={100}
              value={cardsDraft}
              onChange={(e) => setCardsDraft(e.target.value)}
              onBlur={commitCards}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <span className="muted small-text">
              How many never-attempted questions join the review queue each day
              (0–100, default 15).
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
