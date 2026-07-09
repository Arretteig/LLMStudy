import type { QuestionChoice } from '@llmstudy/shared';

/**
 * UWorld-style graded choice list: every choice colored (correct green,
 * selected-wrong red) with its rationale. Used by the Drill feedback panel
 * and the post-exam review screen.
 */
export function ChoiceFeedback({
  choices,
  selectedIds,
}: {
  choices: QuestionChoice[];
  selectedIds: number[];
}) {
  const selected = new Set(selectedIds);
  const sorted = [...choices].sort((a, b) => a.position - b.position);

  return (
    <div className="choice-feedback">
      {sorted.map((c) => {
        const picked = selected.has(c.id);
        const tone = c.is_correct ? 'correct' : picked ? 'wrong' : '';
        return (
          <div key={c.id} className={`choice-row ${tone}`}>
            <div className="choice-row-head">
              <span className="choice-row-text">{c.choice_text}</span>
              <span className="choice-row-tags">
                {c.is_correct && <span className="choice-tag tag-correct">correct</span>}
                {picked && <span className="choice-tag tag-pick">your pick</span>}
              </span>
            </div>
            {c.rationale && <div className="choice-rationale">{c.rationale}</div>}
          </div>
        );
      })}
    </div>
  );
}
