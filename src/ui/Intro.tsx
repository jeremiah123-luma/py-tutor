// The intro: kinetic type and motion in Geist, on the site's own aurora gradients.
//   mark      - one bar grows, the >_ unfolds out of it like a fan, flashes to an outline, then shrinks beside the
//               wordmark as it types itself, with selection blocks sweeping the letters and a blinking caret.
//   wheel     - a ring of gradient bars spins around a card that flips through the three topics.
//   drift     - the old way: app windows drift apart behind "no more three tabs", then gather and vanish.
//   statement - Raison's grammar: hard cuts alternate with slabs wiping up; lines rise out of masks; nothing
//               holds still (a slow grow, a slow settle, leading that breathes); exits are designed (lines split
//               sideways, or a paragraph drops its lines from the top).
// Smoothness rules (from the animation-performance skill): only transform and opacity move. Continuous motion
// (grounds, holds, drift) is CSS keyframes on the compositor; entrances and exits are Motion, which hands
// transform/opacity to WAAPI. No animated blur, letter-spacing, width, or backdrop-filter anywhere.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Play, Volume2, VolumeX } from 'lucide-react';
import { IntroSound, rememberSound, soundWanted } from '../intro/sound';
import { C, INTRO_SCENES, exitMs, sceneText, type Ground, type IntroScene } from '../intro/slides';
import { distortionWave, recentTap } from './wave';

const EASE = [0.16, 1, 0.3, 1] as const; // ease-out, entrances
const EASE_IO = [0.77, 0, 0.175, 1] as const; // ease-in-out, things travelling on screen
export type IntroExit = 'start' | 'signin' | 'skip';
type Bezier = readonly [number, number, number, number];
const tr = (reduce: boolean, duration: number, delay = 0, ease: Bezier = EASE) => (reduce ? { duration: 0 } : { duration, delay, ease: [...ease] as [number, number, number, number] });

/* ---------- grounds: the aurora, in every colour of ours ---------- */

const GROUNDS: Record<Ground, { base: string; blobs: string[] }> = {
  aurora: { base: 'linear-gradient(180deg, #F4E8F7 0%, #F7DCEE 100%)', blobs: [C.periwinkle, C.pink, C.lilac, C.sky] },
  night: { base: '#111111', blobs: ['rgb(167 139 250 / 0.42)', 'rgb(249 168 212 / 0.26)', 'rgb(147 197 253 / 0.26)', 'rgb(196 181 253 / 0.2)'] },
  violet: { base: C.violet, blobs: [C.lilac, C.pink, C.periwinkle, C.sky] },
  pink: { base: C.pink, blobs: [C.blush, C.lilac, C.periwinkle, C.blush] },
  sky: { base: C.sky, blobs: [C.periwinkle, C.lilac, C.blush, C.sky] },
  lilac: { base: C.lilac, blobs: [C.pink, C.sky, C.periwinkle, C.blush] },
};

function GroundLayer({ ground }: { ground: Ground }) {
  const g = GROUNDS[ground];
  return (
    <div className="ig" style={{ background: g.base }} aria-hidden="true">
      {g.blobs.map((c, i) => (
        <span key={i} className={`ig-blob ig-blob-${i}`} style={{ background: `radial-gradient(closest-side, ${c}, transparent)` }} />
      ))}
      <span className="ig-grain" />
    </div>
  );
}

/** The short line under every headline. Fades up after the headline lands; on an exit it drops away first. */
function Sub({ text, delay, leaving, reduce, className = '' }: { text: string; delay: number; leaving?: boolean; reduce: boolean; className?: string }) {
  return (
    <motion.p
      className={`intro-sub mx-auto max-w-[34ch] ${className}`}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={leaving ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
      transition={leaving ? tr(reduce, 0.22) : tr(reduce, 0.6, delay)}
    >
      {text}
    </motion.p>
  );
}

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
      <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={reduce ? false : { scaleX: 0, scaleY: 0.35 }} animate={{ scaleX: 1, scaleY: 1 }} transition={tr(reduce, 0.5, 0.05)}>
        {!reduce &&
          [-26, -13, 0, 13, 26].map((d, i) => (
            <motion.rect
              key={d}
              x={16}
              y={58}
              width={84}
              height={4}
              rx={2}
              {...common}
              style={{ originX: 1, originY: 0.5 }}
              initial={{ rotate: 0, opacity: 0 }}
              animate={phase >= 1 ? { rotate: [0, d * 1.1, d * 0.2], opacity: [0, 1, 0] } : { rotate: 0, opacity: 0 }}
              transition={{ duration: 0.7, delay: i * 0.02, ease: EASE }}
            />
          ))}
        <motion.rect x={16} y={52} width={84} height={16} rx={4} {...common} style={{ originX: 1, originY: 0.5 }} initial={false} animate={{ rotate: open ? -32 : 0 }} transition={tr(reduce, 0.6)} />
        <motion.rect x={16} y={52} width={84} height={16} rx={4} {...common} style={{ originX: 1, originY: 0.5 }} initial={false} animate={{ rotate: open ? 32 : 0 }} transition={tr(reduce, 0.6, 0.03)} />
      </motion.g>
      <motion.rect x={116} y={92} width={72} height={16} rx={4} {...common} style={{ originX: 0, originY: 0.5 }} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: open ? 1 : 0 }} transition={tr(reduce, 0.5, 0.25)} />
    </svg>
  );
}

/** Paused state of the whole intro (tap to pause). Scene timelines and CSS motion stop while it's true. */
const PausedCtx = createContext(false);
/** The intro's sound engine, so scenes can fire their own effects at their own moments. */
const SoundCtx = createContext<IntroSound | null>(null);

/** Run an effect when a value changes (not on first render). */
function useOnChange<T>(value: T, fn: (v: T) => void) {
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    fn(value);
  }, [value, fn]);
}

/** Milliseconds this scene has been playing, not counting time spent paused. Re-renders every frame while running. */
function useSceneTime(run: boolean) {
  const paused = useContext(PausedCtx);
  const [t, setT] = useState(0);
  const acc = useRef(0);
  useEffect(() => {
    if (!run || paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // a frame's timestamp can be a hair earlier than when the loop started; never let the clock run backwards
      acc.current += Math.max(0, now - last);
      last = Math.max(last, now);
      setT(acc.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, paused]);
  return t;
}

function MarkScene({ scene, reduce }: { scene: Extract<IntroScene, { kind: 'mark' }>; reduce: boolean }) {
  // 0 bar, 1 unfold, 2 outline flash, 3 solid, 4 wordmark; all read off one pausable clock
  const t = useSceneTime(!reduce);
  const phase = reduce ? 4 : t >= 1650 ? 4 : t >= 1450 ? 3 : t >= 1150 ? 2 : t >= 450 ? 1 : 0;
  const since = t - 1650; // time since the wordmark phase began
  const typeEnd = 380 + WORD.length * 45;
  const typed = reduce ? WORD.length : phase < 4 ? 0 : Math.max(0, Math.min(WORD.length, Math.floor((since - 380) / 45) + 1));
  const selK = Math.floor((since - typeEnd - 60) / 80);
  const sel = reduce || phase < 4 || selK < 0 || selK >= SELECTIONS.length ? -1 : selK;
  const sound = useContext(SoundCtx);
  const onPhase = useCallback((p: number) => (p === 1 ? sound?.shimmer() : p === 2 ? sound?.pop() : undefined), [sound]);
  const onTyped = useCallback((n: number) => n > 0 && sound?.key(), [sound]);
  const onSel = useCallback((k: number) => k >= 0 && sound?.blip(k), [sound]);
  useOnChange(phase, onPhase);
  useOnChange(typed, onTyped);
  useOnChange(sel, onSel);

  const outline = phase === 2;
  const ink = outline ? C.black : scene.ink;
  const word = phase >= 4;
  const s = sel >= 0 ? SELECTIONS[sel] : null;

  // One mark the whole time. It lives at its final (small) size inside the wordmark row; until the wordmark
  // phase it is scaled up and the row is shifted so the mark sits dead centre. Then both relax to 1 and 0
  // together while the word types, so the mark glides into place with no swap and no jump.
  const rowRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const [fitBig, setFitBig] = useState({ scale: 4, x: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      const mark = markRef.current;
      if (!row || !mark) return;
      const big = Math.min(window.innerWidth * 0.62, window.innerHeight * 0.62, 420);
      const m = mark.offsetWidth || 1;
      // centre of the mark relative to the row's centre (row is centred on screen)
      const markCentre = mark.offsetLeft + m / 2;
      setFitBig({ scale: big / m, x: row.offsetWidth / 2 - markCentre });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ color: ink }}>
      <GroundLayer ground={outline ? 'lilac' : scene.ground} />
      <div className="relative">
      <motion.div
        ref={rowRef}
        className="relative flex items-center gap-[0.3em] text-[clamp(3rem,11vw,7.5rem)] leading-none"
        initial={false}
        animate={{ x: word ? 0 : fitBig.x }}
        transition={word ? tr(reduce, 0.7, 0, EASE_IO) : { duration: 0 }}
      >
        <motion.div
          ref={markRef}
          style={{ width: '1.1em', aspectRatio: '200 / 120' }}
          initial={false}
          animate={{ scale: word ? 1 : fitBig.scale }}
          transition={word ? tr(reduce, 0.7, 0, EASE_IO) : { duration: 0 }}
        >
          <MarkSvg ink={ink} outline={outline} phase={phase} reduce={reduce} />
        </motion.div>
        <p className="intro-word relative flex" aria-hidden={!word}>
          {WORD.split('').map((ch, i) => {
            const on = !!s && i >= s[0] && i < s[1];
            return (
              <span key={i} style={{ visibility: word && i < typed ? 'visible' : 'hidden', background: on ? s![2] : 'transparent', color: on ? C.black : undefined }}>
                {ch}
              </span>
            );
          })}
          {word && typed > 0 && <span className="intro-caret" style={{ left: `${(typed / WORD.length) * 100}%`, background: s ? s[2] : C.violet }} aria-hidden="true" />}
        </p>
      </motion.div>
      <div className="absolute top-full left-1/2 mt-[min(3.5svh,1.75rem)] w-[min(88vw,36rem)] -translate-x-1/2 text-center">
        {(word || reduce) && <Sub text={scene.sub} delay={reduce ? 0 : 0.8} reduce={reduce} />}
      </div>
      </div>
    </div>
  );
}

/* ---------- wheel: gradient bars spin around a card that flips through the topics ---------- */

const BAR_FILLS = [
  `linear-gradient(180deg, ${C.violet}, ${C.pink})`,
  `linear-gradient(180deg, ${C.periwinkle}, ${C.violet})`,
  `linear-gradient(180deg, ${C.pink}, ${C.lilac})`,
  `linear-gradient(180deg, ${C.sky}, ${C.periwinkle})`,
];

function WheelScene({ scene, reduce }: { scene: Extract<IntroScene, { kind: 'wheel' }>; reduce: boolean }) {
  const t = useSceneTime(!reduce);
  const step = Math.floor((scene.ms - 300) / scene.cards.length);
  const k = reduce ? 0 : Math.max(0, Math.min(scene.cards.length - 1, Math.floor(t / step)));
  const sound = useContext(SoundCtx);
  const onCard = useCallback((i: number) => sound?.tick(i), [sound]);
  useOnChange(k, onCard);
  const card = scene.cards[k];
  const N = 18;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ color: scene.ink }}>
      <GroundLayer ground={scene.ground} />
      {/* CSS keyframes, so the spin stays smooth on the compositor */}
      <div className="absolute top-1/2 left-1/2 size-0" style={{ animation: reduce ? undefined : `wheel-spin ${scene.ms}ms cubic-bezier(0.3, 0, 0.2, 1) both` }}>
        {Array.from({ length: N }, (_, i) => (
          <span
            key={i}
            className="absolute rounded-full shadow-[0_10px_30px_-12px_rgb(76_29_149/0.45)]"
            style={{
              width: '6.5svmin',
              height: '14svmin',
              left: '-3.25svmin',
              top: '-7svmin',
              background: BAR_FILLS[i % BAR_FILLS.length],
              transform: `rotate(${(i * 360) / N}deg) translateY(-42svmin) rotate(${i % 2 ? 8 : -8}deg)`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2.5svmin]">
        <div className="relative grid size-[16svmin] place-items-center">
        <AnimatePresence initial={false}>
        <motion.div
          key={card.code}
          className="absolute inset-0 grid place-items-center rounded-[2.4svmin] font-code font-semibold shadow-[0_24px_60px_-20px_rgb(76_29_149/0.55)]"
          style={{
            background: `radial-gradient(120% 120% at 20% 10%, #FFFFFF99, transparent 55%), ${card.bg}`,
            color: C.black,
            fontSize: card.code.length > 3 ? '3.8svmin' : '5.8svmin',
          }}
          initial={reduce ? false : { scale: 0.85, rotate: k % 2 ? 10 : -10, opacity: 0 }}
          animate={{ scale: 1, rotate: k % 2 ? -4 : 4, opacity: 1 }}
          exit={{ scale: 0.9, rotate: k % 2 ? -14 : 14, opacity: 0, transition: { duration: reduce ? 0 : 0.25, ease: 'easeOut' } }}
          transition={reduce ? { duration: 0 } : { type: 'spring', duration: 0.5, bounce: 0.25 }}
        >
          {card.code}
        </motion.div>
        </AnimatePresence>
        </div>
        <div className="relative grid overflow-hidden pb-[0.1em]">
          <AnimatePresence initial={false}>
            <motion.div
              key={card.label}
              className="col-start-1 row-start-1 text-center"
              initial={reduce ? false : { y: '110%' }}
              animate={{ y: 0 }}
              exit={{ y: '-110%', transition: tr(reduce, 0.22, 0, EASE_IO) }}
              transition={tr(reduce, 0.5, 0.18)}
            >
              <p className="intro-label">{card.label}</p>
              <p className="intro-detail mx-auto mt-[0.6svmin] max-w-[34svmin] font-code text-balance">{card.detail}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-[max(6svh,calc(env(safe-area-inset-bottom)+1.5rem))] px-6 text-center">
        <Sub text={scene.sub} delay={0.7} reduce={reduce} />
      </div>
    </div>
  );
}

/* ---------- drift: the old way drifts apart, then gathers and vanishes ---------- */

// Designed, not random: [x vw, y vh, scale (depth), rotate deg, width vmin]
const WIN_POS: [number, number, number, number, number][] = [
  [-36, -31, 0.95, -6, 30],
  [36, -31, 0.8, 5, 28],
  [-37, 30, 0.85, 4, 30],
  [37, 30, 1, -4, 32],
  [-4, -34, 0.6, 2, 24],
  [4, 35, 0.65, -3, 24],
];

function Window({ label, i }: { label: string; i: number }) {
  const dark = i % 2 === 0;
  const accent = [
    `linear-gradient(100deg, ${C.violet}, ${C.pink})`,
    `linear-gradient(100deg, ${C.sky}, ${C.lilac})`,
    `linear-gradient(100deg, ${C.pink}, ${C.periwinkle})`,
  ][i % 3];
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-[1.6svmin] shadow-[0_30px_60px_-24px_rgb(46_16_101/0.45)]"
      style={{ background: dark ? 'linear-gradient(180deg, #1F1D24, #111111)' : 'linear-gradient(180deg, #FFFFFF, #F6F1FB)' }}
    >
      <div className="flex items-center gap-[0.8svmin] px-[1.4svmin] py-[1.1svmin]">
        {[C.pink, C.lilac, C.sky].map((c) => (
          <span key={c} className="size-[1.1svmin] rounded-full" style={{ background: c }} />
        ))}
        <span className="ml-[0.8svmin] truncate font-code text-[1.6svmin]" style={{ color: dark ? '#A8A8A8' : '#555555' }}>
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-[1svmin] px-[1.6svmin] pb-[1.6svmin]">
        <span className="h-[1.2svmin] w-3/4 rounded-full" style={{ background: dark ? '#2E2B36' : '#ECE6F3' }} />
        <span className="h-[1.2svmin] w-1/2 rounded-full" style={{ background: dark ? '#26242C' : '#F1ECF6' }} />
        <span className="mt-auto h-[6svmin] w-full rounded-[1svmin]" style={{ background: accent }} />
      </div>
    </div>
  );
}

function DriftScene({ scene, leaving, reduce }: { scene: Extract<IntroScene, { kind: 'drift' }>; leaving: boolean; reduce: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ color: scene.ink }}>
      <GroundLayer ground={scene.ground} />
      <div className="absolute top-1/2 left-1/2">
        {scene.windows.map((label, i) => {
          const [x, y, sc, rot, w] = WIN_POS[i % WIN_POS.length];
          return (
            <motion.div
              key={label}
              className="absolute"
              style={{ width: `${w}svmin`, height: `${w * 0.7}svmin`, left: `${-w / 2}svmin`, top: `${-w * 0.35}svmin` }}
              initial={reduce ? false : { x: 0, y: 0, scale: 0.5, rotate: 0, opacity: 0 }}
              animate={leaving ? { x: 0, y: 0, scale: 0.4, rotate: 0, opacity: 0 } : { x: `${x}vw`, y: `${y}svh`, scale: sc, rotate: rot, opacity: 1 }}
              transition={leaving ? tr(reduce, 0.45, i * 0.02, EASE_IO) : tr(reduce, 1.1, 0.05 * i)}
            >
              {/* the slow float is CSS on an inner layer, so it never fights the entrance */}
              <div className="h-full w-full" style={{ animation: reduce ? undefined : `drift-${i % 3} ${5 + i}s ease-in-out infinite alternate` }}>
                <Window label={label} i={i} />
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-5 text-center">
        {/* a soft pool of light under the words instead of a blurred scrim */}
        <motion.div
          className="pointer-events-none absolute h-[70svmin] w-[110svmin] rounded-full"
          style={{ background: 'radial-gradient(closest-side, #F7EEF9 30%, rgb(247 238 249 / 0))' }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: leaving ? 0 : 1 }}
          transition={tr(reduce, 0.5)}
        />
        <div className="relative">
        <p className="intro-display" style={{ fontSize: fit(scene.lines, true, 62) }}>
          {scene.lines.map((line, i) => (
            <span key={i} className="block overflow-hidden pb-[0.08em]">
              <motion.span
                className="block"
                initial={reduce ? false : { y: '105%' }}
                animate={leaving ? { y: '-105%' } : { y: 0 }}
                transition={leaving ? tr(reduce, 0.4, i * 0.04, EASE_IO) : tr(reduce, 0.8, 0.3 + i * 0.09)}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </p>
        <Sub text={scene.sub} delay={0.85} leaving={leaving} reduce={reduce} className="mt-[min(3svh,1.5rem)]" />
        </div>
      </div>
    </div>
  );
}

/** Raison fills the frame: size the type from its longest line so it spans the width, capped by height. */
function fit(lines: string[], big: boolean, width = 90): string {
  const longest = Math.max(...lines.map((l) => l.length));
  const em = longest * (big ? 0.54 : 0.5); // Geist bold, tight tracking: about half an em per character
  return big ? `min(${(width / em).toFixed(2)}vw, ${lines.length > 2 ? 15 : 22}svh, 12rem)` : `clamp(1.25rem, min(${(84 / em).toFixed(2)}vw, 6svh), 3.25rem)`;
}

/* ---------- statement: Raison's grammar ---------- */

function StatementScene({ scene, leaving, reduce }: { scene: Extract<IntroScene, { kind: 'statement' }>; leaving: boolean; reduce: boolean }) {
  const n = scene.lines.length;
  const big = scene.size === 'big';
  // Cut-in scenes rise top line first; wiped-in scenes trail the slab, bottom line first.
  const order = (i: number) => (scene.enter === 'wipe' ? n - 1 - i : i);
  const enterDelay = (i: number) => (scene.enter === 'wipe' ? 0.12 : 0.04) + order(i) * 0.08;
  const holdAnim = reduce
    ? undefined
    : scene.hold === 'grow'
      ? `hold-grow ${scene.ms}ms cubic-bezier(0.2, 0, 0.2, 1) both`
      : scene.hold === 'settle'
        ? `hold-settle ${scene.ms}ms cubic-bezier(0.2, 0, 0.2, 1) both`
        : undefined;
  const exiting = leaving && scene.exit !== 'none';
  const exitTo = (i: number) => (scene.exit === 'split' ? { x: i % 2 === 0 ? '-115vw' : '115vw' } : { opacity: 0 });
  const exitT = (i: number) =>
    scene.exit === 'split' ? tr(reduce, 0.42, i * 0.05, EASE_IO) : { duration: reduce ? 0 : 0.12, delay: reduce ? 0 : i * 0.14 };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center" style={{ color: scene.ink }}>
      <GroundLayer ground={scene.ground} />
      <div className="relative" style={{ animation: holdAnim }}>
        <p className={big ? 'intro-display' : 'intro-small'} style={{ fontSize: fit(scene.lines, big) }}>
          {scene.lines.map((line, i) => (
            <span
              key={i}
              // Clipped above and below only (the mask the line rises through). A side clip stopped split exits at
              // the text block's edge, which on a wide screen is well short of the screen's edge.
              className="block pb-[0.12em]"
              style={{ ['--i' as string]: i, clipPath: 'inset(0 -150vw)', animation: !reduce && scene.hold === 'breathe' ? `hold-breathe ${scene.ms}ms cubic-bezier(0.2, 0, 0.2, 1) both` : undefined } as CSSProperties}
            >
              <motion.span
                className="block"
                initial={reduce ? false : { y: '105%' }}
                animate={exiting ? exitTo(i) : { y: 0, x: 0, opacity: 1 }}
                transition={exiting ? exitT(i) : tr(reduce, big ? 0.85 : 0.7, enterDelay(i))}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </p>
        {scene.sub && <Sub text={scene.sub} delay={0.25 + n * 0.08} leaving={exiting} reduce={reduce} className="mt-[min(4svh,2rem)]" />}
      </div>
    </div>
  );
}

function Scene({ scene, leaving, reduce }: { scene: IntroScene; leaving: boolean; reduce: boolean }) {
  switch (scene.kind) {
    case 'mark':
      return <MarkScene scene={scene} reduce={reduce} />;
    case 'wheel':
      return <WheelScene scene={scene} reduce={reduce} />;
    case 'drift':
      return <DriftScene scene={scene} leaving={leaving} reduce={reduce} />;
    case 'statement':
      return <StatementScene scene={scene} leaving={leaving} reduce={reduce} />;
  }
}

/** One scene's layer. How it arrives is decided once, at mount, so nothing later can interrupt the slide. */
function Layer({ how, children }: { how: 'wipe' | 'fade' | 'none'; children: React.ReactNode }) {
  const [arrive] = useState(how);
  return (
    <motion.div
      className="absolute inset-0"
      initial={arrive === 'wipe' ? { y: '100%' } : arrive === 'fade' ? { opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={arrive === 'none' ? { duration: 0 } : { duration: arrive === 'wipe' ? 0.7 : 0.5, ease: [0.32, 0.72, 0, 1] }}
      aria-hidden="true"
    >
      {children}
    </motion.div>
  );
}

const wipes = (s: IntroScene) => s.kind === 'wheel' || (s.kind === 'statement' && s.enter === 'wipe');

/* ---------- the player ---------- */

/** signedIn: replayed from the profile menu, so the end offers one button instead of the sign-up choices. */
export function Intro({ onDone, signedIn = false }: { onDone: (how: IntroExit) => void; signedIn?: boolean }) {
  const reduce = useReducedMotion() ?? false;
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState<{ i: number; visit: number } | null>(null);
  const [sceneLeaving, setSceneLeaving] = useState(false);
  const [prevLeft, setPrevLeft] = useState(false); // did the scene now underneath a wipe already play its exit?
  const leavingRef = useRef(false); // read in go() so starting an exit never re-creates go/next (that reset the timers)
  leavingRef.current = sceneLeaving;
  const [leaving, setLeaving] = useState(false);
  const [fading, setFading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [paused, setPaused] = useState(false);
  const soundRef = useRef<IntroSound | null>(null);
  soundRef.current ??= new IntroSound();
  const sound = soundRef.current;
  // Sound is on by default. Browsers only let it start after the first tap (or key), so whatever the first touch
  // is, it starts the sound; that first tap only does that (it doesn't also pause).
  const [soundOn, setSoundOn] = useState(soundWanted);
  const [live, setLive] = useState(false);
  const firstTap = useRef(false);
  const pausedNow = useRef(paused);
  pausedNow.current = paused;
  const startSound = useCallback(() => {
    if (!sound.enable()) return false;
    setLive(true);
    if (pausedNow.current) sound.pause();
    return true;
  }, [sound]);
  useEffect(() => {
    if (!soundOn) return;
    void sound.tryAutostart().then((ok) => ok && setLive(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!soundOn || live) return;
    const onGesture = (e: Event) => {
      // the Sound button handles itself; Skip / Get started close the intro, so starting music there is just a blip
      if ((e.target as HTMLElement | null)?.closest?.('button')) return;
      if (startSound() && e.type !== 'keydown') firstTap.current = true;
    };
    const opts = { capture: true } as const;
    for (const t of ['pointerup', 'touchend', 'keydown']) window.addEventListener(t, onGesture, opts);
    return () => {
      for (const t of ['pointerup', 'touchend', 'keydown']) window.removeEventListener(t, onGesture, opts);
    };
  }, [soundOn, live, startSound]);
  const toggleSound = () => {
    if (soundOn && live) {
      sound.disable();
      setLive(false);
      setSoundOn(false);
      rememberSound(false);
    } else {
      // on but not started yet (no tap so far), or off: start it now
      if (startSound()) {
        setSoundOn(true);
        rememberSound(true);
      }
    }
  };
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);
  const scene = INTRO_SCENES[cur];
  const last = cur === INTRO_SCENES.length - 1;

  // The scene index as of the last move, so quick repeated presses each count (state lags a render behind).
  const curRef = useRef(cur);
  const visitRef = useRef(0);
  const swiped = useRef(false);
  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= INTRO_SCENES.length || leaving) return;
      const from = curRef.current;
      curRef.current = to;
      setPrevLeft(leavingRef.current);
      setSceneLeaving(false);
      setPaused(false); // moving on always plays
      // a wipe slides over the scene it came from; a cut replaces it
      setPrev(wipes(INTRO_SCENES[to]) ? { i: from, visit: visitRef.current } : null);
      visitRef.current += 1;
      setCur(to);
    },
    [leaving],
  );
  const next = useCallback(() => go(curRef.current + 1), [go]);
  const back = useCallback(() => go(curRef.current - 1), [go]);

  const finish = useCallback(
    async (how: IntroExit) => {
      if (leaving) return;
      setLeaving(true);
      if (how === 'start') sound.chime();
      sound.end(how === 'start' ? 1.6 : 0.5);
      if (how === 'start') await distortionWave(rootRef.current, { origin: recentTap(1000), tone: 'iridescent', tilt: false, duration: 1100, blend: 'normal' });
      setFading(true);
      setTimeout(() => onDone(how), reduce ? 0 : 380);
    },
    [leaving, onDone, reduce, sound],
  );

  // Hold, play the exit, then move on. Pausing stops the clock; resuming picks up where it left off.
  const played = useRef({ scene: -1, ms: 0 });
  if (played.current.scene !== cur) played.current = { scene: cur, ms: 0 };
  useEffect(() => {
    if (last || leaving || paused) return;
    const ex = reduce ? 0 : exitMs(scene);
    const start = performance.now();
    const done = played.current.ms;
    const a = ex && !leavingRef.current ? setTimeout(() => setSceneLeaving(true), Math.max(0, scene.ms - ex - done)) : undefined;
    const b = setTimeout(next, Math.max(0, scene.ms - done));
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      if (played.current.scene === cur) played.current.ms = done + (performance.now() - start);
    };
  }, [cur, last, leaving, next, scene, reduce, paused]);
  // Pausing mid-exit would freeze on an empty screen (the lines already flew off), so the scene comes back to its
  // held state and the exit plays again on resume.
  useEffect(() => {
    if (!paused || !sceneLeaving || reduce) return;
    setSceneLeaving(false);
    played.current = { scene: cur, ms: Math.max(0, scene.ms - exitMs(scene) - 400) };
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each scene arrives with its own sound: a whoosh for a slab wiping up, a thump for a hard cut.
  useEffect(() => {
    if (cur === 0) {
      sound.swell();
      return;
    }
    if (scene.kind === 'drift') sound.scatter();
    else if (wipes(scene)) sound.whoosh();
    else sound.thump();
  }, [cur, scene, sound]);
  // Lines splitting away get a swish.
  useEffect(() => {
    if (sceneLeaving && scene.kind === 'statement' && scene.exit === 'split') sound.swish();
  }, [sceneLeaving, scene, sound]);
  // Tap-to-pause holds the music too.
  useEffect(() => {
    if (paused) sound.pause();
    else sound.resume();
  }, [paused, sound]);
  useEffect(() => () => sound.end(0.3), [sound]);

  useEffect(() => {
    if (prev === null) return;
    const id = setTimeout(() => setPrev(null), reduce ? 0 : 950); // well after the 700 ms slide has landed
    return () => clearTimeout(id);
  }, [prev, cur, reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const onButton = (e.target as HTMLElement | null)?.closest('button');
      if (e.key === 'Escape') {
        e.preventDefault();
        void finish('skip');
      } else if ((e.key === ' ' || e.key === 'k') && !onButton) {
        e.preventDefault();
        if (!last) setPaused((v) => !v);
      } else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, finish, last]);

  useEffect(() => {
    if (last) ctaRef.current?.focus({ preventScroll: true });
  }, [last]);

  // A real modal: focus moves in, the app behind it can't be reached, and focus goes back when it closes.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    rootRef.current?.focus({ preventScroll: true });
    // a menu that opened it (the profile menu) hands focus back to its button as it closes; take it again after
    const again = setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) rootRef.current?.focus({ preventScroll: true });
    }, 120);
    return () => {
      clearTimeout(again);
      app?.removeAttribute('inert');
      try {
        prev?.focus?.({ preventScroll: true });
      } catch {
        /* gone */
      }
    };
  }, []);

  // Each visit to a scene is its own layer, so coming back to a scene (even one still sliding away) replays it fresh.
  const layers = prev !== null && !(prev.i === cur && prev.visit === visitRef.current) ? [prev, { i: cur, visit: visitRef.current }] : [{ i: cur, visit: visitRef.current }];

  return createPortal(
    <motion.div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="What py-tutor is"
      data-intro=""
      className={`fixed inset-0 z-[110] cursor-pointer touch-pan-y select-none overflow-hidden outline-none ${paused ? 'intro-paused' : ''}`}
      style={{ background: GROUNDS[scene.ground].base }}
      animate={fading ? { opacity: 0, scale: 1.03 } : { opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.38, ease: EASE }}
      // Tap pauses and resumes. Swipe left for the next scene, right for the one before; arrow keys do the same.
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY, at: performance.now() };
        swiped.current = false;
      }}
      // A finger that moves never produces a click, so swipes are read when it lifts.
      onPointerUp={(e) => {
        const s = swipe.current;
        if (!s || (e.target as HTMLElement).closest('button')) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          swiped.current = true; // the click a mouse drag fires next is not a tap
          firstTap.current = false; // a swipe that started the sound doesn't eat the next real tap
          if (dx < 0) next();
          else back();
        }
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        if (firstTap.current) {
          firstTap.current = false; // that tap just turned the sound on
          return;
        }
        if (!last) setPaused((v) => !v);
      }}
    >
      <PausedCtx.Provider value={paused}>
      <SoundCtx.Provider value={sound}>
      {layers.map(({ i, visit }) => {
        const isCur = visit === visitRef.current;
        const entering = isCur && prev !== null;
        return (
          // keyed by visit: the scene underneath a wipe keeps its state while it's covered, and a new visit starts fresh
          <Layer key={visit} how={reduce ? 'none' : entering ? 'wipe' : i === 0 && prev === null ? 'fade' : 'none'}>
            <Scene scene={INTRO_SCENES[i]} leaving={isCur ? sceneLeaving : prevLeft} reduce={reduce} />
          </Layer>
        );
      })}

      </SoundCtx.Provider>
      </PausedCtx.Provider>

      <p className="sr-only" aria-live="polite">
        {paused ? 'Paused.' : sceneText(scene)}
      </p>

      {paused && !last && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))]" aria-hidden="true">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#111111]/80 px-4 py-2 text-sm font-medium text-[#F5F5F5]">
            <Play className="size-3.5" strokeWidth={2.25} fill="currentColor" /> Paused · tap to keep going
          </span>
        </div>
      )}

      {/* Progress and skip, in the scene's own ink. Progress fills by scaleX, never width. */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center gap-4 px-[max(1.25rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))]"
        style={{ color: scene.ink }}
      >
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {INTRO_SCENES.map((s, i) => (
            <span key={s.id} className="h-[2px] flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, currentColor 28%, transparent)' }}>
              <span
                key={i === cur ? `run-${cur}` : 'still'}
                className="block h-full w-full origin-left rounded-full"
                style={{
                  background: 'currentColor',
                  transform: i < cur || (i === cur && last) ? 'scaleX(1)' : i === cur ? undefined : 'scaleX(0)',
                  animation: i === cur && !last && !reduce ? `intro-fill ${s.ms}ms linear forwards` : undefined,
                }}
              />
            </span>
          ))}
        </div>
        <button
          type="button"
          data-sound-toggle=""
          onClick={toggleSound}
          aria-pressed={soundOn && live}
          aria-label={soundOn && live ? 'Sound on. Tap to mute.' : 'Turn sound on'}
          className={`press -mr-1 inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium focus-visible:outline-current ${soundOn && !live ? 'intro-sound-hint' : ''}`}
          style={{ background: 'color-mix(in oklab, currentColor 14%, transparent)' }}
        >
          {soundOn ? <Volume2 className="size-4" strokeWidth={2} aria-hidden="true" /> : <VolumeX className="size-4" strokeWidth={2} aria-hidden="true" />}
          <span>{soundOn && !live ? 'Tap for sound' : 'Sound'}</span>
        </button>
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
            style={{ background: scene.ink, color: C.lilac }}
          >
            {signedIn ? 'Let’s go' : 'Get started'}
            <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
          {!signedIn && (
            <button
              type="button"
              onClick={() => void finish('signin')}
              className="press h-12 rounded-full px-5 text-[0.9375rem] font-medium underline-offset-4 hover:underline focus-visible:outline-current"
            >
              I already have an account
            </button>
          )}
        </motion.div>
      )}
    </motion.div>,
    document.body,
  );
}
