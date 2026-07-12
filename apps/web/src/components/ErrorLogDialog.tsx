import { useEffect, useState } from 'react';
import { createQuestion } from '../api/client';

/** Why the miss happened — the first step of the error-log protocol. */
const MISS_CLASSIFICATIONS = [
  'Knowledge gap',
  'Misread the stem',
  'Fell for a distractor',
] as const;

/** The missed MCQ an error log is being written for. */
export interface ErrorLogTarget {
  /** Source MCQ id — used by callers to prevent double-adds per session. */
  questionId: number;
  questionText: string;
  objectiveId: number | null;
  objectiveTitle: string | null;
  /** The correct choice(s) with their rationales. */
  correctChoices: { choice_text: string; rationale: string | null }[];
}

/**
 * Error-log protocol dialog (Drill + Exam review): classify the miss, explain
 * the right answer in your own words, then save an editable prefilled recall
 * card into the spaced queue.
 */
export function ErrorLogDialog({
  target,
  onSaved,
  onClose,
}: {
  target: ErrorLogTarget;
  /** Called once the recall card is created (before the dialog closes). */
  onSaved: (sourceQuestionId: number) => void;
  onClose: () => void;
}) {
  const [classification, setClassification] = useState<string | null>(null);
  const [sentence, setSentence] = useState('');
  // Suffix the stem so the recall card states its actual task AND never
  // collides with the source MCQ — recall_questions has
  // UNIQUE(objective_id, question_text) across both formats, so saving the
  // verbatim stem under the same objective is rejected as a duplicate.
  const [cardText, setCardText] = useState(
    `${target.questionText} Explain why the correct answer is right.`,
  );
  // Expected answer stays derived from the sentence until manually edited.
  const [expectedDraft, setExpectedDraft] = useState('');
  const [expectedTouched, setExpectedTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correctText = target.correctChoices.map((c) => c.choice_text).join('; ');
  const expectedValue = expectedTouched
    ? expectedDraft
    : `Correct answer: ${correctText}.${sentence.trim() ? ` ${sentence.trim()}` : ''}`;

  const canSave =
    !saving &&
    !saved &&
    classification !== null &&
    sentence.trim().length > 0 &&
    cardText.trim().length > 0 &&
    expectedValue.trim().length > 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await createQuestion({
        question_text: cardText.trim(),
        question_format: 'recall',
        expected_answer: expectedValue.trim(),
        objective_id: target.objectiveId,
        difficulty: 3,
      });
      setSaved(true);
      onSaved(target.questionId);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div
        className="card modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Turn this miss into a recall card</h2>

        {error && (
          <div className="banner error" onClick={() => setError(null)}>
            {error} <span className="muted">(click to dismiss)</span>
          </div>
        )}

        {saved ? (
          <>
            <div className="banner success">
              Recall card added — it enters your review queue as a new card.
            </div>
            <div className="row gap">
              <button className="btn primary" onClick={onClose} autoFocus>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small-text modal-stem">“{target.questionText}”</p>

            <div>
              <div className="modal-step">1 · Why did you miss it?</div>
              <div className="conf-chips">
                {MISS_CLASSIFICATIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className={`conf-chip ${classification === label ? 'selected' : ''}`}
                    onClick={() =>
                      setClassification((c) => (c === label ? null : label))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="errorlog-ref">
              <div className="errorlog-ref-head">Correct answer</div>
              {target.correctChoices.map((c, i) => (
                <div key={i} className="errorlog-ref-item">
                  <strong>{c.choice_text}</strong>
                  {c.rationale && (
                    <span className="muted"> — {c.rationale}</span>
                  )}
                </div>
              ))}
            </div>

            <label>
              2 · In your own words, why is the right answer right?{' '}
              <span className="muted">(one sentence)</span>
              <textarea
                autoFocus
                rows={2}
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                placeholder="Because…"
              />
            </label>

            <div className="modal-step">3 · The recall card (edit before saving)</div>
            <label>
              Question
              <textarea
                rows={2}
                value={cardText}
                onChange={(e) => setCardText(e.target.value)}
              />
            </label>
            <label>
              Expected answer
              <textarea
                rows={3}
                value={expectedValue}
                onChange={(e) => {
                  setExpectedDraft(e.target.value);
                  setExpectedTouched(true);
                }}
              />
            </label>
            <p className="muted small-text modal-meta">
              Objective: {target.objectiveTitle ?? 'none'} · difficulty 3 · enters
              the spaced queue as new
            </p>

            <div className="row gap">
              <button
                className="btn primary"
                disabled={!canSave}
                onClick={save}
                title={
                  canSave
                    ? undefined
                    : 'Pick a classification and write the one-sentence explanation first'
                }
              >
                {saving ? 'Saving…' : 'Save recall card'}
              </button>
              <button className="btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
