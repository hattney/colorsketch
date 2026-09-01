import React from 'react';
import {
  OTHER_MAX_LENGTH,
  SUBJECT_CHIPS,
  sanitizeSubjectWord,
  type SubjectModule,
} from '../utils/prompt';

interface SubjectPickerProps {
  /**
   * `null` means nothing has been picked yet. That is the gate: previews stay hidden until
   * this is a real value, so nobody judges the AI on a result they never asked for.
   * "Auto" is a choice like any other and has to be clicked.
   */
  module: SubjectModule | null;
  onModule: (m: SubjectModule) => void;
  otherWord: string;
  onOtherWord: (w: string) => void;
  /** Small ordinal shown before the heading, e.g. "1". */
  step?: string;
  heading?: string;
  disabled?: boolean;
}

export function isSubjectReady(module: SubjectModule | null, otherWord: string): boolean {
  if (module === null) return false;
  if (module === 'other') return sanitizeSubjectWord(otherWord) !== null;
  return true;
}

/** Step "what's in your photo?" — shared by the free demo pane and the paid HD pane. */
export default function SubjectPicker({
  module,
  onModule,
  otherWord,
  onOtherWord,
  step,
  heading = "What's in your photo?",
  disabled = false,
}: SubjectPickerProps) {
  const otherValid = module !== 'other' || sanitizeSubjectWord(otherWord) !== null;

  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-xs font-bold text-ink-soft" id="subject-label">
        {step && <span className="mr-1 text-ink">{step}.</span>}
        {heading}
      </span>
      <div className="flex flex-wrap gap-[5px]" role="group" aria-labelledby="subject-label">
        {SUBJECT_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="chip"
            aria-pressed={module === chip.id}
            disabled={disabled}
            style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={() => onModule(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {module === 'other' && (
        <input
          className="ink-input mt-1.5"
          type="text"
          maxLength={OTHER_MAX_LENGTH}
          value={otherWord}
          onChange={(e) => onOtherWord(e.target.value)}
          placeholder="e.g. car, cake, tattoo"
          aria-label="Describe your subject in one word"
          aria-invalid={!otherValid}
          disabled={disabled}
        />
      )}

      {module === null && (
        <p className="m-0 mt-2 text-[11.5px] leading-[1.4] text-ink-soft">
          Pick one first — it decides how AI reads your photo, and the previews are built from it.
        </p>
      )}
    </div>
  );
}
