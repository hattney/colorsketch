import React, { useCallback, useEffect, useRef, useState } from 'react';

interface BeforeAfterProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  /** Background of the "after" tag — the crayon colour that marks Free vs AI. */
  afterTagColor?: string;
  /** Described to screen readers; the two images are decorative on their own. */
  label: string;
  className?: string;
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Draggable before/after reveal on an A4-proportioned sheet.
 *
 * Pointer events cover mouse, pen and touch with one code path, so the drag works on
 * phones — CONTENT_UPDATE.md §4 rules out hover-only comparisons. The handle is also a
 * real slider for keyboard users, and on first scroll into view it nudges itself once so
 * people know it can be dragged (skipped under `prefers-reduced-motion`).
 */
export default function BeforeAfter({
  before,
  after,
  beforeLabel,
  afterLabel,
  afterTagColor,
  label,
  className = '',
}: BeforeAfterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const hinted = useRef(false);
  // The handlers read this instead of `dragging`: a pointerdown and the first pointermove
  // can land in the same task, before React has re-rendered with the new state.
  const draggingRef = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPos(clamp(((clientX - rect.left) / rect.width) * 100));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    setFromClientX(e.clientX);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    draggingRef.current = false;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 4;
    if (e.key === 'ArrowLeft') setPos((p) => clamp(p - step));
    else if (e.key === 'ArrowRight') setPos((p) => clamp(p + step));
    else if (e.key === 'Home') setPos(0);
    else if (e.key === 'End') setPos(100);
    else return;
    e.preventDefault();
  };

  // One-time "this is draggable" nudge when the card first scrolls into view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timers: number[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || hinted.current) return;
        hinted.current = true;
        observer.disconnect();
        timers.push(window.setTimeout(() => setPos(66), 260));
        timers.push(window.setTimeout(() => setPos(38), 900));
        timers.push(window.setTimeout(() => setPos(50), 1500));
      },
      { threshold: 0.45 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const glide = dragging ? 'none' : 'clip-path .45s ease, left .45s ease';

  return (
    <div
      ref={containerRef}
      className={`sheet select-none touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img src={before} alt={`${label} — before`} draggable={false} />

      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)`, transition: glide }}>
        <img src={after} alt={`${label} — after`} draggable={false} />
      </div>

      <span className="sheet-tag">{beforeLabel}</span>
      <span
        className="sheet-tag"
        style={{ left: 'auto', right: 10, background: afterTagColor ?? 'var(--ink)' }}
      >
        {afterLabel}
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 z-[2] w-0"
        style={{ left: `${pos}%`, transition: glide }}
      >
        <span className="absolute inset-y-0 left-0 w-[2.5px] -translate-x-1/2 bg-ink" />
        <span
          role="slider"
          tabIndex={0}
          aria-label={`${label}: drag to compare before and after`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={`${Math.round(pos)}% revealed`}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute left-0 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full border-[2.5px] border-ink bg-white text-[13px] font-bold leading-none"
          style={{ boxShadow: '3px 3px 0 var(--ink)' }}
        >
          <span aria-hidden="true">↔</span>
        </span>
      </div>
    </div>
  );
}
