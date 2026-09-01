import { RotateCcw, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { isMockCheckout } from '../utils/checkout';
import { SUBJECT_CHIPS, type StyleVariant, type SubjectModule } from '../utils/prompt';
import SubjectPicker, { isSubjectReady } from './SubjectPicker';
import VariantCards from './VariantCards';

interface AiHdPanelProps {
  module: SubjectModule | null;
  onModule: (m: SubjectModule) => void;
  otherWord: string;
  onOtherWord: (w: string) => void;
  previews: Record<StyleVariant, string> | null;
  isGenerating: boolean;
  onRegenerate: () => void;
  selected: StyleVariant | null;
  onChoose: (variant: StyleVariant, dataUrl: string) => void;
}

/**
 * Stage 3: the purchased page. Same two styles, now clean and full resolution.
 *
 * The subject module is shown locked rather than hidden, because it is what the person paid
 * for and they should be able to see it. Changing it is deliberately a separate, named action:
 * PHASE2_GUIDE.md forbids calling the AI after payment (an outage there would mean money taken
 * and nothing delivered), so a post-purchase re-run is a bounded retry against the already
 * stored order — not the ordinary path. Keeping it behind its own disclosure is what stops it
 * from becoming one.
 */
export default function AiHdPanel({
  module,
  onModule,
  otherWord,
  onOtherWord,
  previews,
  isGenerating,
  onRegenerate,
  selected,
  onChoose,
}: AiHdPanelProps) {
  const [isChanging, setIsChanging] = useState(false);
  const ready = isSubjectReady(module, otherWord);
  // Echo the chip they actually clicked, not the module id behind it.
  const subjectLabel =
    module === 'other' && otherWord.trim()
      ? `✍️ ${otherWord.trim()}`
      : (SUBJECT_CHIPS.find((c) => c.id === module)?.label ?? 'Auto');

  return (
    <div>
      <p className="m-0 mb-4 text-[13.5px] leading-[1.5] text-ink-soft">
        Unlocked. Both styles below are yours — pick one to finish, and adjust it with the same
        handles as the free page. You can switch to the other style at any time.
      </p>

      {isChanging ? (
        <>
          <SubjectPicker
            step="1"
            heading="Read the photo as something else?"
            module={module}
            onModule={onModule}
            otherWord={otherWord}
            onOtherWord={onOtherWord}
          />
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-inline btn-sm"
              onClick={() => {
                onRegenerate();
                setIsChanging(false);
              }}
              disabled={!ready || isGenerating}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {isGenerating ? 'Redrawing…' : 'Redraw both styles'}
            </button>
            <button
              type="button"
              className="btn btn-inline btn-ghost btn-sm"
              onClick={() => setIsChanging(false)}
              disabled={isGenerating}
            >
              Cancel
            </button>
          </div>
          <p className="m-0 mb-5 text-[11px] leading-[1.4] text-ink-soft">
            Redrawing replaces both pages above. Your purchase covers it — you are not charged
            again.
          </p>
        </>
      ) : (
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-ink-soft">
            Read as <strong className="text-ink">{subjectLabel}</strong>
          </span>
          <button
            type="button"
            className="chip"
            onClick={() => setIsChanging(true)}
            disabled={isGenerating}
          >
            <RotateCcw className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Change
          </button>
        </div>
      )}

      {isGenerating && (
        <p className="m-0 mb-4 text-[12.5px] font-bold text-ink-soft">Redrawing both styles…</p>
      )}

      {previews && !isGenerating && (
        <div className="mb-5 flex flex-col gap-2.5">
          <span className="text-xs font-bold text-ink-soft">
            {selected ? 'Style — tap the other to switch' : 'Pick a style to keep editing'}
          </span>
          <VariantCards
            previews={previews}
            tag={isMockCheckout ? 'Stand-in' : null}
            selected={selected}
            onChoose={onChoose}
          />
          {isMockCheckout && (
            <p className="m-0 text-[11px] leading-[1.4] text-ink-soft">
              Demo build — no real payment was taken and AI retouch is not connected. These are
              your free conversion at two line weights, standing in for the purchased files.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
