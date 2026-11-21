// The intro: kinetic type and motion in the site's own colours and Geist.
//   mark  - one bar grows, the >_ unfolds out of it like a fan, flashes to an outline, then shrinks beside the
//           wordmark as it types itself, with selection blocks sweeping the letters and a blinking caret.
//   wheel - a ring of bars spins around a card that flips through the three topics.
//   chaos - app windows and confetti squares fly apart in 3D behind "no more three tabs", then collapse into one.
//   slab  - each statement rides up on a full-bleed slab; its lines trail the slab, bottom line first.
// Tap, Space, or the arrow keys move it along; it also advances by itself. "Get started" sends the wave through.
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { C, INTRO_SCENES, sceneText, type IntroScene } from '../intro/slides';
import { distortionWave, recentTap } from './wave';

const EASE = [0.16, 1, 0.3, 1] as const;
export type IntroExit = 'start' | 'signin' | 'skip';
const tr = (reduce: boolean, duration: number, delay = 0) => (reduce ? { duration: 0 } : { duration, delay, ease: EASE });

/* ---------- mark: >_ from a single bar, then the typed wordmark ---------- */

const WORD = 'py-tutor';
// [from, to, colour] ranges the selection block covers, one step every 80 ms after typing finishes
const SELECTIONS: [number, number, string][] = [
  [0, 2, C.violet],
  [0, 4, C.pink],
  [1, 6, C.sky],
  [0, 8, C.violet],
  [3, 8, C.lilac],
  [5, 8, C.pink],
  [7, 8, C.sky],
];

function MarkSvg({ ink, outline, phase, reduce }: { ink: string; outline: boolean; phase: number; reduce: boolean }) {
  const fill = outline ? 'none' : ink;
  const stroke = outline ? ink : 'none';
  const open = phase >= 1 || reduce;
  const common = { fill, stroke, strokeWidth: 1.4, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full overflow-visible" aria-hidden="true">
      {/* the bar grows first; the two arms of > lie flat inside it */}
      <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={reduce ? false : { scaleX: 0, scaleY: 0.35 }} animate={{ scaleX: 1, scaleY: 1 }} transition={tr(reduce, 0.5, 0.05)}>
        {/* ghost rays fan out between the arms and fold away: the unfold */}
        {!reduce &&
          [-26, -13, 0, 13, 26].map((d, i) => (
            <motion.rect
              key={d}
              x={16}
              y={58}
              width={84}
              height={4}
              rx={1}
              {...common}
              style={{ originX: 1, originY: 0.5 }}
              initial={{ rotate: 0, opacity: 0 }}
              animate={phase >= 1 ? { rotate: [0, d * 1.1, d * 0.2], opacity: [0, 1, 0] } : { rotate: 0, opacity: 0 }}
              transition={{ duration: 0.7, delay: i * 0.02, ease: EASE }}
            />
          ))}
        <motion.rect x={16} y={52} width={84} height={16} rx={2} {...common} style={{ originX: 1, originY: 0.5 }} initial={false} animate={{ rotate: open ? -32 : 0 }} transition={tr(reduce, 0.6)} />
        <motion.rect x={16} y={52} width={84} height={16} rx={2} {...common} style={{ originX: 1, originY: 0.5 }} initial={false} animate={{ rotate: open ? 32 : 0 }} transition={tr(reduce, 0.6, 0.03)} />
      </motion.g>
      <motion.rect x={116} y={92} height={16} rx={2} {...common} initial={reduce ? false : { width: 0 }} animate={{ width: open ? 72 : 0 }} transition={tr(reduce, 0.5, 0.25)} />
    </svg>
  );
}

function MarkScene({ scene, reduce }: { scene: IntroScene; reduce: boolean }) {
  // 0 bar, 1 unfold, 2 outline flash, 3 solid, 4 wordmark
  const [phase, setPhase] = useState(reduce ? 4 : 0);
  const [typed, setTyped] = useState(reduce ? WORD.length : 0);
  const [sel, setSel] = useState(-1);
  useEffect(() => {
    if (reduce) return;
    const at: [number, number][] = [
      [450, 1],
      [1150, 2],
      [1450, 3],
      [1650, 4],
    ];
    const ids = at.map(([ms, p]) => setTimeout(() => setPhase(p), ms));
    return () => ids.forEach(clearTimeout);
  }, [reduce]);
  useEffect(() => {
    if (phase < 4 || reduce) return;
    const ids: ReturnType<typeof setTimeout>[] = [];
    const typeEnd = 180 + WORD.length * 45;
    for (let i = 1; i <= WORD.length; i++) ids.push(setTimeout(() => setTyped(i), 180 + i * 45));
    SELECTIONS.forEach((_, k) => ids.push(setTimeout(() => setSel(k), typeEnd + 60 + k * 80)));
    ids.push(setTimeout(() => setSel(-1), typeEnd + 60 + SELECTIONS.length * 80));
    return () => ids.forEach(clearTimeout);
  }, [phase, reduce]);

  const outline = phase === 2;
  const bg = outline ? C.lilac : scene.bg;
  const ink = outline ? C.black : scene.ink;
  const word = phase >= 4;
  const s = sel >= 0 ? SELECTIONS[sel] : null;

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: bg, color: ink }}>
      <div className="flex items-center gap-[0.3em] text-[clamp(3rem,11vw,7.5rem)] leading-none">
        <motion.div layout transition={tr(reduce, 0.6)} style={{ width: word ? '1.1em' : 'min(62vmin, 420px)', aspectRatio: '200 / 120' }}>
          <MarkSvg ink={ink} outline={outline} phase={phase} reduce={reduce} />
        </motion.div>
        {word && (
          <p className="intro-word relative flex">
            {WORD.split('').map((ch, i) => {
              const on = !!s && i >= s[0] && i < s[1];
              return (
                <span key={i} style={{ visibility: i < typed ? 'visible' : 'hidden', background: on ? s![2] : 'transparent', color: on ? C.black : undefined }}>
                  {ch}
                </span>
              );
            })}
            {typed > 0 && <span className="intro-caret" style={{ left: `${(typed / WORD.length) * 100}%`, background: s ? s[2] : C.violet }} aria-hidden="true" />}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- wheel: bars spin around a card that flips through the topics ---------- */

function WheelScene({ scene, reduce }: { scene: Extract<IntroScene, { kind: 'wheel' }>; reduce: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const step = Math.floor((scene.ms - 300) / scene.cards.length);
    const ids = scene.cards.slice(1).map((_, i) => setTimeout(() => setK(i + 1), step * (i + 1)));
    return () => ids.forEach(clearTimeout);
  }, [reduce, scene]);
  const card = scene.cards[k];
  const N = 18;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: scene.bg, color: scene.ink }}>
      <motion.div
        className="absolute top-1/2 left-1/2"
        style={{ width: 0, height: 0 }}
        initial={reduce ? false : { rotate: 40, scale: 1.5 }}
        animate={{ rotate: -50, scale: 0.92 }}
        transition={reduce ? { duration: 0 } : { duration: scene.ms / 1000, ease: [0.3, 0, 0.2, 1] }}
      >
        {Array.from({ length: N }, (_, i) => (
          <span
            key={i}
            className="absolute rounded-[0.6vmin]"
            style={{
              width: '7vmin',
              height: '15vmin',
              left: '-3.5vmin',
              top: '-7.5vmin',
              background: scene.ink,
              transform: `rotate(${(i * 360) / N}deg) translateY(-40vmin) rotate(${i % 2 ? 8 : -8}deg)`,
            }}
          />
        ))}
      </motion.div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2.5vmin]">
        <motion.div
          key={card.code}
          className="grid place-items-center rounded-[1.6vmin] font-code font-semibold"
          style={{ background: card.bg, color: C.black, width: '20vmin', height: '20vmin', fontSize: card.code.length > 3 ? '4.6vmin' : '7vmin' }}
          initial={reduce ? false : { scale: 0.6, rotate: k % 2 ? 10 : -10, opacity: 0 }}
          animate={{ scale: 1, rotate: k % 2 ? -4 : 4, opacity: 1 }}
          transition={tr(reduce, 0.45)}
        >
          {card.code}
        </motion.div>
        <div className="overflow-hidden pb-[0.1em]">
          <motion.p key={card.label} className="intro-label" initial={reduce ? false : { y: '110%' }} animate={{ y: 0 }} transition={tr(reduce, 0.5, 0.05)}>
            {card.label}
          </motion.p>
        </div>
      </div>
    </div>
  );
}

/* ---------- chaos: the old way flies apart, then collapses into one ---------- */

// Fixed layout so it looks designed, not random: [x vw, y vh, z px, rotateY, rotateX, width vmin]
const WIN_POS: [number, number, number, number, number, number][] = [
  [-34, -28, -120, 24, -8, 30],
  [30, -30, 40, -20, 10, 26],
  [-40, 18, 60, 18, 6, 28],
  [36, 24, -80, -26, -6, 32],
  [-8, -40, -260, 6, 18, 22],
  [6, 40, -200, -8, -16, 24],
  [-20, -4, -420, 30, 4, 20],
  [22, 2, -360, -30, -4, 20],
];
const SQUARES = Array.from({ length: 18 }, (_, i) => {
  const a = i * 2.39996; // golden angle
  const r = 22 + ((i * 37) % 26);
  return { x: Math.cos(a) * r * 1.3, y: Math.sin(a) * r, z: -300 + ((i * 97) % 500), s: 8 + ((i * 13) % 12), c: [C.violet, C.pink, C.sky, C.lilac, C.black][i % 5], r: (i * 47) % 90 };
});

function Window({ label, i }: { label: string; i: number }) {
  const dark = i % 3 !== 1;
  const accent = [C.violet, C.pink, C.sky, C.lilac][i % 4];
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-[1.2vmin] border shadow-[0_20px_50px_-20px_rgb(0_0_0/0.45)]"
      style={{ background: dark ? C.black : '#FFFFFF', borderColor: dark ? '#363636' : '#E5E5E5' }}
    >
      <div className="flex items-center gap-[0.8vmin] px-[1.4vmin] py-[1.1vmin]" style={{ borderBottom: `1px solid ${dark ? '#262626' : '#EEEEEE'}` }}>
        {[C.pink, C.lilac, C.sky].map((c) => (
          <span key={c} className="size-[1.1vmin] rounded-full" style={{ background: c }} />
        ))}
        <span className="ml-[0.8vmin] truncate font-code text-[1.6vmin]" style={{ color: dark ? '#A8A8A8' : '#555555' }}>
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-[1vmin] p-[1.6vmin]">
        <span className="h-[1.2vmin] w-3/4 rounded-full" style={{ background: dark ? '#363636' : '#E5E5E5' }} />
        <span className="h-[1.2vmin] w-1/2 rounded-full" style={{ background: dark ? '#262626' : '#EEEEEE' }} />
        <span className="mt-auto h-[5vmin] w-full rounded-[0.8vmin]" style={{ background: accent, opacity: 0.85 }} />
      </div>
    </div>
  );
}

function ChaosScene({ scene, reduce }: { scene: Extract<IntroScene, { kind: 'chaos' }>; reduce: boolean }) {
  const [collapse, setCollapse] = useState(false);
  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(() => setCollapse(true), scene.ms - 650);
    return () => clearTimeout(id);
  }, [reduce, scene.ms]);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: scene.bg, color: scene.ink, perspective: '900px' }}>
      <div className="absolute top-1/2 left-1/2" style={{ transformStyle: 'preserve-3d' }}>
        {scene.windows.map((label, i) => {
          const [x, y, z, ry, rx, w] = WIN_POS[i % WIN_POS.length];
          return (
            <motion.div
              key={label}
              className="absolute"
              style={{ width: `${w * 1.3}vmin`, height: `${w * 0.94}vmin`, left: `${-w * 0.65}vmin`, top: `${-w * 0.47}vmin` }}
              initial={reduce ? false : { x: 0, y: 0, z: -600, rotateY: 0, rotateX: 0, opacity: 0 }}
              animate={
                collapse
                  ? { x: 0, y: 0, z: -200, rotateY: 0, rotateX: 0, opacity: 0, scale: 0.4 }
                  : { x: `${x}vw`, y: `${y}vh`, z, rotateY: ry, rotateX: rx, opacity: 1, scale: 1 }
              }
              transition={collapse ? tr(reduce, 0.55, i * 0.02) : tr(reduce, 1.3, 0.04 * i)}
            >
              <Window label={label} i={i} />
            </motion.div>
          );
        })}
        {SQUARES.map((q, i) => (
          <motion.span
            key={i}
            className="absolute"
            style={{ width: q.s, height: q.s, left: -q.s / 2, top: -q.s / 2, background: q.c }}
            initial={reduce ? false : { x: 0, y: 0, z: -500, rotate: 0, opacity: 0 }}
            animate={collapse ? { x: 0, y: 0, z: -200, opacity: 0 } : { x: `${q.x}vw`, y: `${q.y}vh`, z: q.z, rotate: q.r, opacity: 1 }}
            transition={collapse ? tr(reduce, 0.5) : tr(reduce, 1.5, 0.1 + i * 0.015)}
          />
        ))}
      </div>
      {/* the statement sits on top, on a soft scrim so it reads over the windows */}
      <div className="absolute inset-0 flex items-center justify-center px-5 text-center">
        <motion.p
          className="intro-display rounded-[2vmin] px-[3vmin] py-[1.5vmin]"
          style={{ background: 'rgb(245 245 245 / 0.82)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
          animate={collapse ? { scale: 0.92, opacity: 0 } : { scale: 1, opacity: 1 }}
          transition={tr(reduce, 0.45)}
        >
          {scene.lines.map((line, i) => (
            <span key={i} className="block overflow-hidden pb-[0.06em]">
              <motion.span className="block" initial={reduce ? false : { y: '105%' }} animate={{ y: 0 }} transition={tr(reduce, 0.8, 0.35 + i * 0.1)}>
                {line}
              </motion.span>
            </span>
          ))}
        </motion.p>
      </div>
    </div>
  );
}

/* ---------- slab: a statement on full-bleed colour ---------- */

function SlabScene({ scene, entering, reduce }: { scene: Extract<IntroScene, { kind: 'slab' }>; entering: boolean; reduce: boolean }) {
  const n = scene.lines.length;
  const lineDelay = (i: number) => 0.08 + (n - 1 - i) * 0.06;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center" style={{ background: scene.bg, color: scene.ink }}>
      <p className="intro-display max-w-[14ch]">
        {scene.lines.map((line, i) => (
          <motion.span
            key={i}
            className="block"
            initial={entering && !reduce ? { y: '34vh', opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ y: tr(reduce, 0.75, lineDelay(i)), opacity: tr(reduce, 0.25, lineDelay(i)) }}
          >
            {line}
          </motion.span>
        ))}
      </p>
      <motion.p
        className="intro-sub mt-[min(4vh,2rem)] max-w-[36ch]"
        initial={entering && !reduce ? { opacity: 0, y: 12, letterSpacing: '0.03em' } : false}
        animate={{ opacity: 1, y: 0, letterSpacing: '0em' }}
        transition={tr(reduce, 0.6, 0.08 + n * 0.06 + 0.12)}
      >
        {scene.sub}
      </motion.p>
    </div>
  );
}

function Scene({ scene, entering, reduce }: { scene: IntroScene; entering: boolean; reduce: boolean }) {
  switch (scene.kind) {
    case 'mark':
      return <MarkScene scene={scene} reduce={reduce} />;
    case 'wheel':
      return <WheelScene scene={scene} reduce={reduce} />;
    case 'chaos':
      return <ChaosScene scene={scene} reduce={reduce} />;
    case 'slab':
      return <SlabScene scene={scene} entering={entering} reduce={reduce} />;
  }
}

/* ---------- the player ---------- */

export function Intro({ onDone }: { onDone: (how: IntroExit) => void }) {
  const reduce = useReducedMotion() ?? false;
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [fading, setFading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const scene = INTRO_SCENES[cur];
  const last = cur === INTRO_SCENES.length - 1;

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= INTRO_SCENES.length || leaving) return;
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
      // The wave rolls through the last scene first; the intro lifts away as it reaches the edges.
      if (how === 'start') await distortionWave(rootRef.current, { origin: recentTap(1000), tone: 'iridescent', tilt: false, duration: 1100, blend: 'normal' });
      setFading(true);
      setTimeout(() => onDone(how), reduce ? 0 : 420);
    },
    [leaving, onDone, reduce],
  );

  useEffect(() => {
    if (last || leaving) return;
    const id = setTimeout(next, scene.ms);
    return () => clearTimeout(id);
  }, [cur, last, leaving, next, scene.ms]);

  // Drop the scene underneath once the new slab has covered it.
  useEffect(() => {
    if (prev === null) return;
    const id = setTimeout(() => setPrev(null), reduce ? 0 : 650);
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
      style={{ background: scene.bg }}
      animate={fading ? { opacity: 0, scale: 1.04, filter: 'blur(6px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (!last) next();
      }}
    >
      {layers.map((i) => {
        const entering = i === cur && prev !== null;
        return (
          <motion.div
            key={`${i}-${i === cur ? 'on' : 'off'}`}
            className="absolute inset-0"
            initial={entering && !reduce ? { y: '100%' } : false}
            animate={{ y: 0 }}
            transition={tr(reduce, 0.6)}
            aria-hidden="true"
          >
            <Scene scene={INTRO_SCENES[i]} entering={entering} reduce={reduce} />
          </motion.div>
        );
      })}

      <p className="sr-only" aria-live="polite">
        {sceneText(scene)}
      </p>

      {/* Progress and skip, in the scene's own ink. */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center gap-4 px-[max(1.25rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))] transition-colors duration-500"
        style={{ color: scene.ink }}
      >
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {INTRO_SCENES.map((s, i) => (
            <span key={s.id} className="h-[2px] flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, currentColor 28%, transparent)' }}>
              <span
                key={i === cur ? `run-${cur}` : 'still'}
                className="block h-full rounded-full"
                style={{
                  background: 'currentColor',
                  width: i < cur || (i === cur && last) ? '100%' : i === cur ? undefined : '0%',
                  animation: i === cur && !last && !reduce ? `intro-fill ${s.ms}ms linear forwards` : undefined,
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
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-5 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1.25rem))] sm:flex-row sm:justify-center sm:gap-3"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={tr(reduce, 0.5, 0.6)}
          style={{ color: scene.ink }}
        >
          <button
            ref={ctaRef}
            type="button"
            onClick={() => void finish('start')}
            className="press inline-flex h-12 min-w-[12rem] items-center justify-center gap-2 rounded-full px-6 text-base font-semibold focus-visible:outline-current"
            style={{ background: scene.ink, color: scene.bg }}
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
    </motion.div>
  );
}
