import React from 'react';
import { sampleUrl, useImagesExist } from '../utils/samples';
import BeforeAfter from './BeforeAfter';

interface Sample {
  name: string;
  title: string;
  note: string;
}

/**
 * CONTENT_UPDATE.md §13 + §21 — two groups, not one grid.
 *
 * Which group a subject belongs in is not a matter of taste: it is whatever the converter
 * actually does with it. The free group holds inputs whose own drawn lines or hard edges
 * survive tracing; everything built from soft gradient sits in the AI group.
 */
const FREE_SAMPLES: Sample[] = [
  {
    name: 'baby',
    title: 'Sketched princess',
    note: 'A pencil illustration already has its lines drawn — the converter just picks them up and thickens them.',
  },
  {
    name: 'robot',
    title: 'Little robot',
    note: 'Crisp edges and flat panels on a plain background — ideal for the free converter.',
  },
];

const AI_SAMPLES: Sample[] = [
  {
    name: 'dog',
    title: 'Puppy portrait',
    note: 'AI redraws the fur and eyes as clean, closed shapes a child can color.',
  },
  {
    name: 'flower',
    title: 'Spring bouquet',
    note: 'AI keeps every petal a separate closed shape — ideal for adult coloring.',
  },
  // The houseplant moved up to the hero, where it carries the same Photo -> AI comparison.
];

function Caption({ title, note }: { title: string; note: string }) {
  return (
    <>
      <p className="m-0 mt-3 text-sm font-bold">{title}</p>
      <span className="mt-[3px] block text-[12.5px] font-normal leading-[1.45] text-ink-soft">
        {note}
      </span>
    </>
  );
}

function FreeCard({ sample }: { sample: Sample }) {
  const before = sampleUrl(`${sample.name}-before.jpg`);
  const after = sampleUrl(`${sample.name}-after.png`);
  const ready = useImagesExist([before, after]);
  if (!ready) return null;

  return (
    <div>
      <BeforeAfter
        before={before}
        after={after}
        beforeLabel="Photo"
        afterLabel="Free"
        afterTagColor="var(--crayon-green)"
        label={sample.title}
      />
      <Caption title={sample.title} note={sample.note} />
    </div>
  );
}

/**
 * Photos get the Photo↔AI drag, because that is the comparison that sells. The free
 * result still sits underneath at thumbnail size with an honest caption — §13 is explicit
 * that hiding the free converter's weakness on photographs would cost more than it saves.
 */
function AiCard({ sample }: { sample: Sample }) {
  const photo = sampleUrl(`${sample.name}-before.jpg`);
  const free = sampleUrl(`${sample.name}-after.png`);
  const ai = sampleUrl(`${sample.name}-ai.png`);
  const ready = useImagesExist([photo, free, ai]);
  if (!ready) return null;

  return (
    <div>
      <BeforeAfter
        before={photo}
        after={ai}
        beforeLabel="Photo"
        afterLabel="AI"
        afterTagColor="var(--crayon-red)"
        label={sample.title}
      />

      <div className="mt-3 flex items-start gap-3 rounded-lg border-2 border-ink bg-white p-2.5">
        <span className="relative block w-[54px] shrink-0 overflow-hidden rounded border-2 border-ink">
          <img
            src={free}
            alt={`Free conversion of the ${sample.title.toLowerCase()}`}
            className="block aspect-[1/1.414] w-full bg-white object-cover"
          />
        </span>
        <span className="text-[12px] leading-[1.45] text-ink-soft">
          <strong className="text-ink">Free result on this photo.</strong> It catches the main
          contours — usable, but softer than the AI version above.
        </span>
      </div>

      <Caption title={sample.title} note={sample.note} />
    </div>
  );
}

function GroupHead({ pill, pillColor, title }: { pill: string; pillColor: string; title: string }) {
  return (
    <h3 className="mb-1 mt-[34px] flex items-center gap-2.5 font-display text-xl font-bold tracking-[-0.02em] first-of-type:mt-0">
      <span
        className="rounded-[20px] border-2 border-ink px-2.5 py-[3px] text-[11.5px] font-bold tracking-[0.06em] text-white"
        style={{ background: pillColor }}
      >
        {pill}
      </span>
      {title}
    </h3>
  );
}

export default function Samples() {
  return (
    <section id="samples" className="scroll-mt-24 pb-[100px]">
      <h2 className="m-0 mb-3 font-display text-[clamp(28px,3.4vw,40px)] font-extrabold tracking-[-0.03em]">
        See real{' '}
        <span className="fill text-white" style={{ ['--c' as string]: 'var(--crayon-blue)' }}>
          transformations
        </span>
      </h2>
      <p className="m-0 mb-[34px] max-w-[56ch] text-ink-soft">
        Every example below was created with ColorSketch — from a real photo to a print-ready
        coloring page. Drag the handle across any sheet to compare. Start with the free converter;
        it handles more than you would expect.
      </p>

      <GroupHead
        pill="Free"
        pillColor="var(--crayon-green)"
        title="Drawings, illustrations & renders"
      />
      <p className="m-0 mb-5 max-w-[70ch] text-[15px] text-ink-soft">
        Sketches, illustrations, 3D renders, product shots, bold graphics — anything whose shapes
        are already drawn converts beautifully right in your browser. Instant, unlimited, no
        account, and the A4 file comes out at the same 300 DPI as the paid one.{' '}
        <strong className="text-ink">For these, free is the finished product.</strong>
      </p>
      <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
        {FREE_SAMPLES.map((s) => (
          <FreeCard key={s.name} sample={s} />
        ))}
      </div>

      <GroupHead pill="AI" pillColor="var(--crayon-red)" title="Close-up photos — the hard case" />
      <p className="m-0 mb-5 max-w-[70ch] text-[15px] text-ink-soft">
        Fur, skin and soft backgrounds are made of gradients rather than lines, so there is simply
        less for a tracer to find. The free converter still gives you the main contours — try it
        first, it may be all you need. When it isn&apos;t, AI retouch redraws the photo from
        scratch as bold, closed outlines, and the difference is the kind you can see from across
        the room.
      </p>
      <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
        {AI_SAMPLES.map((s) => (
          <AiCard key={s.name} sample={s} />
        ))}
      </div>
    </section>
  );
}
