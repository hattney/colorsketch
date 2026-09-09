/**
 * The sheet the page is printed on.
 *
 * The site is aimed at English-speaking households, and those do not agree on paper. US
 * Letter is what sits in the tray in the US and Canada; A4 is the sheet everywhere else
 * (UK, Ireland, Australia, New Zealand). Letter is therefore the default and A4 is one
 * click away — an A4-only page silently mis-margins for the largest part of the audience.
 *
 * Everything downstream that depends on sheet size is derived from this one table: the
 * trace aspect, the millimetre line thickness, the exported PNG, the print stylesheet, the
 * server-side HD upscale and the labels. They cannot drift apart if none of them carries
 * its own copy of the numbers.
 */

export type PaperId = 'letter' | 'a4';
export type Orientation = 'portrait' | 'landscape';

export interface PaperSpec {
  id: PaperId;
  /** Shown in the picker and in every "what you get" label. */
  label: string;
  /** Portrait short edge, in millimetres. */
  shortMm: number;
  /** Portrait long edge, in millimetres. */
  longMm: number;
  /** Portrait short edge at 300 DPI. */
  shortPx: number;
  /** Portrait long edge at 300 DPI. */
  longPx: number;
  /** Keyword for the `@page size` descriptor. */
  cssSize: string;
}

export const PAPERS: Record<PaperId, PaperSpec> = {
  letter: {
    id: 'letter',
    label: 'US Letter',
    shortMm: 215.9,
    longMm: 279.4,
    shortPx: 2550,
    longPx: 3300,
    cssSize: 'letter',
  },
  a4: {
    id: 'a4',
    label: 'A4',
    shortMm: 210,
    longMm: 297,
    shortPx: 2480,
    longPx: 3508,
    cssSize: 'A4',
  },
};

export const PAPER_IDS: PaperId[] = ['letter', 'a4'];

/** US Letter: the majority sheet among English-speaking visitors. */
export const DEFAULT_PAPER: PaperId = 'letter';

export function isPaperId(value: unknown): value is PaperId {
  return value === 'letter' || value === 'a4';
}

/** Never throws — an unknown id falls back to the default rather than breaking an export. */
export function paperSpec(id: PaperId | undefined | null): PaperSpec {
  return PAPERS[isPaperId(id) ? id : DEFAULT_PAPER];
}

/** Pixel size of the 300 DPI export. */
export function exportSize(
  id: PaperId | undefined | null,
  landscape: boolean,
): { width: number; height: number } {
  const p = paperSpec(id);
  return landscape
    ? { width: p.longPx, height: p.shortPx }
    : { width: p.shortPx, height: p.longPx };
}

/** Millimetre size of the printed sheet — what turns a mm line width into pixels. */
export function pageMm(
  id: PaperId | undefined | null,
  landscape: boolean,
): { width: number; height: number } {
  const p = paperSpec(id);
  return landscape
    ? { width: p.longMm, height: p.shortMm }
    : { width: p.shortMm, height: p.longMm };
}

/** Aspect ratio of the sheet, long edge over short edge. */
export function paperRatio(id: PaperId | undefined | null): number {
  const p = paperSpec(id);
  return p.longMm / p.shortMm;
}

/** e.g. `US Letter · portrait` — used wherever the old copy said "A4". */
export function paperLabel(id: PaperId | undefined | null, landscape: boolean): string {
  return `${paperSpec(id).label} · ${landscape ? 'landscape' : 'portrait'}`;
}
