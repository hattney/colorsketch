/**
 * AI retouch prompt assembly — CONTENT_UPDATE.md §15 (v4, modular).
 *
 * A prompt is CORE + one subject module + one style variant. The strings are the
 * confirmed English originals and must not be paraphrased: image-editing models lose
 * per-instruction weight as the prompt grows, so brevity is a quality decision.
 *
 * The user-supplied word for the "Other" module is never concatenated onto the prompt.
 * It is sanitized and then substituted into a fixed sentence template, and the server
 * (`/api/ai-preview`) re-runs the same validation — never trust this file alone.
 */

export type SubjectModule = 'auto' | 'people-pets' | 'nature' | 'objects-places' | 'artwork' | 'other';
export type StyleVariant = 'simple' | 'detailed';

export const CORE = `Redraw as a children's coloring book page: thick uniform black outlines, about 2mm on A4, on pure white. Every shape fully closed so it can be colored in. Turn all texture into a few smooth continuous lines — never short repeated strokes. No shading, gradients, grey, hatching, stippling or reflections. Keep the proportions and pose. A4 portrait, pure black and white, no text, no border.`;

export const SUBJECT_MODULES: Record<Exclude<SubjectModule, 'other'>, string> = {
  'people-pets': `Face: clean minimal outlines only — no fur strands, wrinkles or lumps. Each eye is one smooth shape with a solid pupil and one small highlight. At most four whiskers per side. Friendly and cartoon-like.`,
  nature: `Each petal and leaf is one smooth closed outline. Never stipple or dot the flower centre — a few simple shapes only. Main leaf vein only, no vein network. Distant scenery becomes bold simple silhouettes.`,
  'objects-places': `Follow only real edges, seams and openings. Ignore every reflection, highlight and glare — glossy and metallic surfaces stay plain white. Keep straight lines straight. Leave the background white.`,
  artwork: `This is already a drawing: preserve and thicken its own outlines exactly, keeping the original design and composition. Remove colour fills, cel shading and screentones, leaving white. Close any open outline. Add nothing new.`,
  auto: `If it is already a drawing, preserve and thicken its own outlines and add nothing new. If there is a face, keep it clean with no fur strands, and each eye as one simple shape with a solid pupil. If there are flowers, one smooth outline per petal and never a stippled centre. If there are manufactured objects, ignore all reflections. Simplify the background.`,
};

/** Appended after the Auto module when the user names their own subject. */
export const otherSentence = (word: string) =>
  `The subject is a ${word}. Keep what makes it recognizable and simplify everything else.`;

export const STYLE_VARIANTS: Record<StyleVariant, string> = {
  simple: `Style: very simple and bold — fewest lines possible, extra thick lines about 3mm, large open areas, for a young child.`,
  detailed: `Style: keep more interior detail for a richer page, but never thinner than 2mm and no texture strokes on faces or flower centres.`,
};

export const SUBJECT_CHIPS: { id: SubjectModule; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'people-pets', label: '🐾 People & pets' },
  { id: 'nature', label: '🌿 Nature' },
  { id: 'objects-places', label: '📦 Objects & places' },
  { id: 'artwork', label: '🎨 2D artwork' },
  { id: 'other', label: '✍️ Other' },
];

export const OTHER_MAX_LENGTH = 20;

/**
 * Returns the cleaned word, or null when the input cannot be trusted.
 * Letters, digits, spaces and hyphens only; one or two words; 20 characters max.
 * A null result means "fall back to Auto silently" — never surface a validation error.
 */
export function sanitizeSubjectWord(raw: string): string | null {
  const cleaned = raw
    .replace(/[^A-Za-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;
  if (cleaned.length > OTHER_MAX_LENGTH) return null;
  if (cleaned.split(' ').length > 2) return null;
  return cleaned;
}

export interface PromptSelection {
  module: SubjectModule;
  /** Raw text from the "Other" field; ignored unless `module === 'other'`. */
  otherWord?: string;
}

/** CORE + subject module + style variant, joined into the string sent to the model. */
export function buildPrompt(selection: PromptSelection, variant: StyleVariant): string {
  const parts = [CORE];

  if (selection.module === 'other') {
    const word = sanitizeSubjectWord(selection.otherWord ?? '');
    parts.push(SUBJECT_MODULES.auto);
    if (word) parts.push(otherSentence(word));
  } else {
    parts.push(SUBJECT_MODULES[selection.module]);
  }

  parts.push(STYLE_VARIANTS[variant]);
  return parts.join(' ');
}
