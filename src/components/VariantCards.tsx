import React from 'react';
import { VARIANT_LABELS, VARIANTS } from '../utils/aiFlow';
import { DEFAULT_PAPER, paperRatio, type PaperId } from '../utils/paper';
import type { StyleVariant } from '../utils/prompt';

interface VariantCardsProps {
  previews: Record<StyleVariant, string>;
  /** Corner tag burnt onto every card, e.g. "Demo" or "HD". Null hides it. */
  tag: string | null;
  onChoose?: (variant: StyleVariant, dataUrl: string) => void;
  selected?: StyleVariant | null;
  /**
   * The sheet these pages are for. The card is shaped like it, because the image inside is
   * the page: a box of some other proportion would letterbox or crop the very margins the
   * buyer is trying to judge.
   */
  paper?: PaperId;
  landscape?: boolean;
}

/** The Simple / Detailed pair — §15's two style variants, rendered identically wherever they appear. */
export default function VariantCards({
  previews,
  tag,
  onChoose,
  selected,
  paper = DEFAULT_PAPER,
  landscape = false,
}: VariantCardsProps) {
  const ratio = paperRatio(paper);
  const sheetAspect = landscape ? `${ratio} / 1` : `1 / ${ratio}`;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {VARIANTS.map((v) => {
        const isSelected = selected === v;
        return (
          <button
            key={v}
            type="button"
            onClick={onChoose ? () => onChoose(v, previews[v]) : undefined}
            aria-pressed={onChoose ? isSelected : undefined}
            disabled={!onChoose}
            className="overflow-hidden rounded-lg border-2 border-ink bg-white pb-[7px] text-center"
            style={{
              boxShadow: isSelected ? '4px 4px 0 var(--crayon-green)' : undefined,
              cursor: onChoose ? 'pointer' : 'default',
            }}
          >
            <span
              className="relative block overflow-hidden border-b-2 border-ink bg-white"
              style={{ aspectRatio: sheetAspect }}
            >
              <img
                src={previews[v]}
                alt={`${VARIANT_LABELS[v].title} style preview`}
                className="absolute inset-0 h-full w-full object-contain"
              />
              {tag && (
                <span className="absolute bottom-1 left-1 rounded-[20px] bg-ink px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                  {tag}
                </span>
              )}
            </span>
            <span className="mt-[5px] block font-display text-[12.5px] font-bold">
              {VARIANT_LABELS[v].title}
            </span>
            <small className="block text-[10px] leading-[1.3] text-ink-soft">
              {VARIANT_LABELS[v].note}
            </small>
          </button>
        );
      })}
    </div>
  );
}
