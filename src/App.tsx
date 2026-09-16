import React, { useEffect, useRef, useState } from 'react';
import Editor from './components/Editor';
import Faq from './components/Faq';
import Footer from './components/Footer';
import Header from './components/Header';
import Hero from './components/Hero';
import Samples from './components/Samples';
import Steps from './components/Steps';
import Uploader from './components/Uploader';
import OrderRecoveryBanner from './components/OrderRecoveryBanner';
import RefundPolicy from './pages/RefundPolicy';
import Terms from './pages/Terms';
import EditPurchased from './pages/EditPurchased';
import Thanks from './pages/Thanks';
import { STAGE_BAR, type Stage } from './utils/aiFlow';
import { usePath } from './utils/router';

/**
 * The editor is the point of the page, so the hero stays short (CONTENT_UPDATE.md §2)
 * and the upload panel sits directly under the three steps, in view on a laptop.
 */
function Landing() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  /**
   * Lives here rather than inside the editor because the header strip has to move with it.
   * Free, free-preview and paid are three different promises, and that strip is the part of
   * the panel you can read from a scroll away — so it is what carries the distinction
   * (`STAGE_BAR`), not a heading buried in the sidebar.
   */
  const [stage, setStage] = useState<Stage>('free');
  const bar = STAGE_BAR[stage];
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Brings the panel back under the reader's eyes after it swaps contents.
   *
   * Every transition below replaces what is inside the panel in place, and by the time
   * someone presses one of them they are usually at the foot of a panel a screen and a half
   * tall -- the button that opens the AI screen now spans its bottom edge. The new contents
   * start far above the viewport, so the only visible effect is that the scroll position is
   * now wrong, which reads as the page having reloaded and done nothing.
   *
   * The scroll has to happen after React has committed the new contents, and it is requested
   * here but performed in the effect below. rAF would also run after the commit, but only in
   * a page the browser considers visible -- it is suspended in a background or occluded tab,
   * which would silently drop the scroll and leave exactly the symptom this fixes.
   */
  const wantsReveal = useRef(false);
  const revealPanel = () => {
    wantsReveal.current = true;
  };

  useEffect(() => {
    if (!wantsReveal.current) return;
    wantsReveal.current = false;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const openImage = (img: HTMLImageElement) => {
    setStage('free');
    setImage(img);
  };

  const goStage = (s: Stage) => {
    setStage(s);
    revealPanel();
  };

  return (
    <>
      <OrderRecoveryBanner />
      <Hero />
      <Steps />

      {/*
        scroll-mt clears the sticky header, so the panel's own title bar is the first thing
        under it rather than the first thing hidden by it.
      */}
      <div
        ref={panelRef}
        className="my-14 scroll-mt-24 overflow-hidden rounded-[14px] border-[2.5px] border-ink bg-white"
        style={{ boxShadow: '7px 7px 0 var(--ink)' }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b-[2.5px] border-ink px-5 py-3.5 text-[13.5px] font-medium transition-colors"
          style={{
            background: image ? bar.background : 'var(--crayon-yellow)',
            color: image ? bar.color : 'var(--ink)',
          }}
        >
          <strong>{image ? bar.title : 'Start here — drop in an image'}</strong>
          <span className="text-right font-bold">{image ? bar.meta : 'Free · Letter or A4'}</span>
        </div>
        {image ? (
          <Editor
            image={image}
            stage={stage}
            onStage={goStage}
            onReset={() => {
              setImage(null);
              setStage('free');
              revealPanel();
            }}
          />
        ) : (
          <Uploader onImageSelected={openImage} />
        )}
      </div>

      <Samples />
      <Faq />
    </>
  );
}

export default function App() {
  const path = usePath();

  let page: React.ReactNode;
  if (path === '/terms') page = <Terms />;
  else if (path === '/refund-policy') page = <RefundPolicy />;
  else if (path === '/thanks') page = <Thanks />;
  else if (path === '/edit') page = <EditPurchased />;
  else page = <Landing />;

  return (
    <div className="flex min-h-screen flex-col bg-paper font-body text-ink">
      <Header />
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6">{page}</main>
      <Footer />
    </div>
  );
}
