import type { Cleanup } from './lineart';
import type { StyleVariant, SubjectModule } from './prompt';
import { sampleUrl } from './samples';

/**
 * The three panes the editor can be in.
 *
 * They are separated because they are three different promises, and a user who cannot tell
 * them apart cannot tell what they are being charged for:
 *
 *   free     — the in-browser tracer. Free forever, downloadable, no AI involved.
 *   ai-demo  — AI retouch previews. Free to look at, watermarked, nothing charged yet.
 *   ai-hd    — the purchased page. Full resolution, no watermark, same handles as free.
 *
 * Each stage owns its own header colour (`STAGE_BAR`) so the switch is visible from across
 * the room, not inferred from a heading.
 */
export type Stage = 'free' | 'ai-demo' | 'ai-hd';

export interface StageBar {
  /** Header background. Stays inside the four-crayon palette of design B. */
  background: string;
  color: string;
  title: string;
  meta: string;
}

export const STAGE_BAR: Record<Stage, StageBar> = {
  free: {
    background: 'var(--crayon-yellow)',
    color: 'var(--ink)',
    title: 'Your coloring page',
    meta: 'Free · A4 300 DPI',
  },
  /* Red is already the site's AI colour (.btn-magic, .btn-red), so crossing into the AI
     flow reads as "the loud thing I just clicked", not as a new brand. */
  'ai-demo': {
    background: 'var(--crayon-red)',
    color: '#ffffff',
    title: '✦ AI preview',
    meta: 'Free to look · nothing charged yet',
  },
  /* Ink is the one step up from a crayon: it is the only filled-black surface on the page,
     which is exactly the "this one is paid for" signal the demo bar must not have. */
  'ai-hd': {
    background: 'var(--ink)',
    color: '#ffffff',
    title: '✦ AI HD page',
    meta: 'Purchased · A4 300 DPI',
  },
};

/**
 * Stand-ins for the two AI style variants while Phase 2 is unbuilt — §15's Simple / Detailed.
 *
 * Tuned by experiment (§27), not by taste. Two findings drove it:
 *
 *   `cleanup: 'off'` — the cleanup presets pre-blur the greyscale before Canny, and that blur
 *   is what was shredding the page. Blurring erases the weak gradients hysteresis needs to
 *   link a contour together, so every stroke arrived broken. Removing the blur alone dropped
 *   measured fragmentation 3-10x (robot 0.34 -> 0.06, flower 0.49 -> 0.05).
 *
 *   HIGH detail, not low — counter to the name. In Canny, a lower threshold lets weak edges
 *   survive and *connect* to strong ones, so raising `detail` yields longer continuous
 *   contours and less speckle. The old `simple: 30` sat at the worst point on that curve.
 *
 * Thickness then trades off against merging: dilate too far and adjacent contours fuse into a
 * black mass. 2.0mm / 1.4mm is the widest that stayed open on the sample set.
 */
export const VARIANT_SETTINGS: Record<
  StyleVariant,
  { detail: number; thicknessMm: number; cleanup: Cleanup }
> = {
  simple: { detail: 70, thicknessMm: 2.0, cleanup: 'off' },
  detailed: { detail: 85, thicknessMm: 1.4, cleanup: 'off' },
};

/**
 * Real AI-retouched pages shipped in `public/samples`, shown beside the stand-in.
 *
 * §27: the free tracer provably cannot fake this. On a fur close-up its edge map contains no
 * long contours at all — filtering for them leaves a blank sheet — so no setting produces a
 * page worth paying for. Showing only a weak stand-in therefore argues *against* buying. A
 * genuine before/after does the job the stand-in cannot, and stays honest because it is
 * labelled as a sample photo rather than the visitor's own.
 */
export interface AiExample {
  before: string;
  after: string;
  subject: string;
}

const EX = (slug: string, subject: string): AiExample => ({
  before: sampleUrl(`${slug}-before.jpg`),
  after: sampleUrl(`${slug}-ai.png`),
  subject,
});

export const AI_EXAMPLES: Record<SubjectModule, AiExample> = {
  auto: EX('dog', 'a pet photo'),
  'people-pets': EX('dog', 'a pet photo'),
  nature: EX('flower', 'a bouquet'),
  'objects-places': EX('leaf', 'a houseplant'),
  artwork: EX('leaf', 'a houseplant'),
  other: EX('dog', 'a pet photo'),
};

export const VARIANT_LABELS: Record<StyleVariant, { title: string; note: string }> = {
  simple: { title: 'Simple', note: 'fewer lines, for kids' },
  detailed: { title: 'Detailed', note: 'more to color in' },
};

export const VARIANTS: StyleVariant[] = ['simple', 'detailed'];
