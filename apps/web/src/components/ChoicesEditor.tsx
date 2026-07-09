import type { NewQuestionChoice } from '@llmstudy/shared';

/** MCQs need at least 3 choices; keys 1-9 drive Drill/Exam so cap at 9. */
export const MIN_CHOICES = 3;
export const MAX_CHOICES = 9;

export function emptyChoice(): NewQuestionChoice {
  return { choice_text: '', is_correct: false, rationale: '' };
}

export function emptyChoices(): NewQuestionChoice[] {
  return Array.from({ length: MIN_CHOICES }, emptyChoice);
}

/** Client-side mirror of the server's MCQ rules. Empty array = valid. */
export function validateChoices(choices: NewQuestionChoice[]): string[] {
  const errors: string[] = [];
  if (choices.length < MIN_CHOICES) {
    errors.push(`MCQs need at least ${MIN_CHOICES} choices.`);
  }
  if (!choices.some((c) => c.is_correct)) {
    errors.push('Mark at least one choice as correct.');
  }
  if (choices.some((c) => !c.choice_text.trim())) {
    errors.push('Every choice needs text.');
  }
  if (choices.some((c) => !c.rationale.trim())) {
    errors.push("Every choice needs a rationale — why it's right or wrong.");
  }
  return errors;
}

/**
 * Editable MCQ choice rows (text, correct?, rationale) with add/remove.
 * Validation display is gated by `showErrors` so forms only shout after a
 * submit attempt.
 */
export function ChoicesEditor({
  choices,
  onChange,
  showErrors = false,
}: {
  choices: NewQuestionChoice[];
  onChange: (next: NewQuestionChoice[]) => void;
  showErrors?: boolean;
}) {
  const errors = showErrors ? validateChoices(choices) : [];

  function patch(index: number, changes: Partial<NewQuestionChoice>) {
    onChange(choices.map((c, i) => (i === index ? { ...c, ...changes } : c)));
  }

  function remove(index: number) {
    onChange(choices.filter((_, i) => i !== index));
  }

  return (
    <div className="choices-editor">
      <div className="choices-editor-head">
        Choices{' '}
        <span className="muted">
          (min {MIN_CHOICES}, at least one correct, rationale for every choice)
        </span>
      </div>
      {choices.map((c, i) => (
        <div key={i} className="choice-edit-row">
          <span className="choice-edit-num muted">{i + 1}</span>
          <div className="choice-edit-fields">
            <input
              type="text"
              value={c.choice_text}
              onChange={(e) => patch(i, { choice_text: e.target.value })}
              placeholder="Choice text"
              className={showErrors && !c.choice_text.trim() ? 'invalid' : ''}
            />
            <input
              type="text"
              value={c.rationale}
              onChange={(e) => patch(i, { rationale: e.target.value })}
              placeholder="Rationale — why this is right / wrong"
              className={showErrors && !c.rationale.trim() ? 'invalid' : ''}
            />
          </div>
          <label className="inline choice-correct">
            <input
              type="checkbox"
              checked={c.is_correct}
              onChange={(e) => patch(i, { is_correct: e.target.checked })}
            />
            correct
          </label>
          <button
            type="button"
            className="btn small"
            onClick={() => remove(i)}
            disabled={choices.length <= MIN_CHOICES}
            title={
              choices.length <= MIN_CHOICES
                ? `MCQs need at least ${MIN_CHOICES} choices`
                : 'Remove this choice'
            }
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn small"
        onClick={() => onChange([...choices, emptyChoice()])}
        disabled={choices.length >= MAX_CHOICES}
      >
        + Add choice
      </button>
      {errors.length > 0 && (
        <ul className="choices-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
