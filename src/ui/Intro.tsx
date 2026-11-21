// The intro: kinetic type on full-bleed colour. Each statement arrives on its own slab of colour that slides up
// over the last one; its lines ride up a beat behind the slab, bottom line first, so the statement builds upward
// and lands together. The very first statement rises out of masks line by line instead.
// Tap, Space, or the arrow keys move it along; it also advances by itself. "Get started" sends the wave through.
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { INTRO_SLIDES, holdMs, type IntroSlide } from '../intro/slides';
import { distortionWave, recentTap } from './wave';

const EASE = [0.16, 1, 0.3, 1] as const;
export type IntroExit = 'start' | 'signin' | 'skip';

function Slab({ slide, index, entering, reduce }: { slide: IntroSlide; index: number; entering: boolean; reduce: boolean }) {
  const masked = index === 0; // the opener rises out of masks; every later slide rides in on its slab
  const n = slide.lines.length;
  const t = (d: number, delay: number) => (reduce ? { duration: 0 } : { duration: d, ease: EASE, delay });
  const lineDelay = (i: number) => (masked ? 0.15 + i * 0.14 : 0.12 + (n - 1 - i) * 0.075);
  const subDelay = masked ? 0.15 + n * 0.14 + 0.1 : 0.12 + n * 0.075 + 0.2;

  return (
    <motion.section
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-5 text-center"
      style={{ background: slide.bg, color: slide.ink }}
      initial={entering && !masked && !reduce ? { y: '100%' } : false}
      animate={{ y: 0 }}
      transition={t(0.75, 0)}
      aria-hidden="true"
    >
      <p className="intro-display max-w-[16ch]">
        {slide.lines.map((line, i) =>
          masked ? (
            <span key={i} className="block overflow-hidden pb-[0.06em]">
              <motion.span className="block" initial={reduce ? false : { y: '105%' }} animate={{ y: 0 }} transition={t(0.95, lineDelay(i))}>
                {line}
              </motion.span>
            </span>
          ) : (
            <motion.span
              key={i}
              className="block"
              initial={entering && !reduce ? { y: '38vh', opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ y: t(1.0, lineDelay(i)), opacity: t(0.35, lineDelay(i)) }}
            >
              {line}
            </motion.span>
          ),
        )}
      </p>
      <motion.p
        className="intro-sub mt-[min(5vh,2.5rem)] max-w-[34ch]"
        initial={entering && !reduce ? { opacity: 0, y: 14, letterSpacing: '0.03em' } : false}
        animate={{ opacity: 1, y: 0, letterSpacing: '0em' }}
        transition={t(0.9, subDelay)}
      >
        {slide.sub}
      </motion.p>
    </motion.section>
  );
}

export function Intro({ onDone }: { onDone: (how: IntroExit) => void }) {
  const reduce = useReducedMotion() ?? false;
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [fading, setFading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const slide = INTRO_SLIDES[cur];
  const last = cur === INTRO_SLIDES.length - 1;

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= INTRO_SLIDES.length || leaving) return;
      setPrev(cur);
      setCur(to);
    },
    [cur, leaving],
  );
  const next = useCallback(() => go(cur + 1), [go, cur]);
  const back = useCallback(() => go(cur - 1), [go, cur]);

  const finish = useCallback(
    async (how: IntroExit) => {
      if (leaving) return;
      setLeaving(true);
      // The wave rolls through the last slide first; the intro lifts away as it reaches the edges.
      if (how === 'start') await distortionWave(rootRef.current, { origin: recentTap(1000), tone: 'iridescent', tilt: false, duration: 1100, blend: 'normal' });
      setFading(true);
      setTimeout(() => onDone(how), reduce ? 0 : 420);
    },
    [leaving, onDone, reduce],
  );

  // Advance on its own; the last slide waits for a choice.
  useEffect(() => {
    if (last || leaving) return;
    const id = setTimeout(next, holdMs(slide));
    return () => clearTimeout(id);
  }, [cur, last, leaving, next, slide]);

  // Drop the slide underneath once the new slab has covered it.
  useEffect(() => {
    if (prev === null) return;
    const id = setTimeout(() => setPrev(null), reduce ? 0 : 800);
    return () => clearTimeout(id);
  }, [prev, cur, reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const onButton = (e.target as HTMLElement | null)?.closest('button');
      if (e.key === 'Escape') {
        e.preventDefault();
        void finish('skip');
      } else if (e.key === 'ArrowRight' || ((e.key === ' ' || e.key === 'Enter') && !onButton)) {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, finish]);

  useEffect(() => {
    if (last) ctaRef.current?.focus({ preventScroll: true });
  }, [last]);

  const layers = prev !== null && prev !== cur ? [prev, cur] : [cur];

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="What py-tutor is"
      data-intro=""
      className="fixed inset-0 z-[110] cursor-pointer select-none overflow-hidden"
      style={{ background: slide.bg }}
      animate={fading ? { opacity: 0, scale: 1.04, filter: 'blur(6px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (!last) next();
      }}
    >
      {layers.map((i) => (
        <Slab key={`${i}-${i === cur ? 'on' : 'off'}`} slide={INTRO_SLIDES[i]} index={i} entering={i === cur && prev !== null} reduce={reduce} />
      ))}

      {/* What a screen reader hears for the current slide. */}
      <p className="sr-only" aria-live="polite">
        {slide.lines.join(' ')} {slide.sub}
      </p>

      {/* Progress and skip, in the slide's own ink. */}
      <div
        className="absolute inset-x-0 top-0 flex items-center gap-4 px-[max(1.25rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))] transition-colors duration-500"
        style={{ color: slide.ink }}
      >
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {INTRO_SLIDES.map((s, i) => (
            <span key={s.id} className="h-[2px] flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, currentColor 28%, transparent)' }}>
              <span
                key={i === cur ? `run-${cur}` : 'still'}
                className="block h-full rounded-full"
                style={{
                  background: 'currentColor',
                  width: i < cur || (i === cur && last) ? '100%' : i === cur ? undefined : '0%',
                  animation: i === cur && !last && !reduce ? `intro-fill ${holdMs(s)}ms linear forwards` : undefined,
                }}
              />
            </span>
          ))}
        </div>
        {!last && (
          <button
            type="button"
            onClick={() => void finish('skip')}
            className="press -mr-2 h-11 rounded-md px-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-current"
          >
            Skip intro
          </button>
        )}
      </div>

      {last && (
        <motion.div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-5 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1.25rem))] sm:flex-row sm:justify-center sm:gap-3"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : 1.1 }}
          style={{ color: slide.ink }}
        >
          <button
            ref={ctaRef}
            type="button"
            onClick={() => void finish('start')}
            className="press inline-flex h-12 min-w-[12rem] items-center justify-center gap-2 rounded-full px-6 text-base font-semibold focus-visible:outline-current"
            style={{ background: slide.ink, color: slide.bg }}
          >
            Get started
            <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void finish('signin')}
            className="press h-12 rounded-full px-5 text-[0.9375rem] font-medium underline-offset-4 hover:underline focus-visible:outline-current"
          >
            I already have an account
          </button>
        </motion.div>
      )}

      {cur > 0 && !last && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs opacity-60" style={{ color: slide.ink }}>
          Tap to keep going
        </p>
      )}
    </motion.div>
  );
}
