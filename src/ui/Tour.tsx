// First-run tour overlay: dims the page, cuts a rounded hole around the current step's
// [data-tour] element, and shows a card next to it (docked to the bottom on narrow screens).
// The positioning math is pure and exported (placeCard, spotlightRect, cardWidth) so it can be tested.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from './primitives';
import type { TourScreen, TourStep } from '../tour/types';

/* ---------- Pure layout math ---------- */

export interface Rect { top: number; left: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Viewport { width: number; height: number; insets?: Insets }
export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface PlaceOptions {
  placement?: TourStep['placement'];
  /** space between the spotlight and the card */
  gap?: number;
  /** minimum space between the card and the screen edge (added to the safe-area inset) */
  margin?: number;
  /** viewports narrower than this dock the card to the bottom */
  dockBelow?: number;
  /** widest the floating card gets */
  maxWidth?: number;
}
export interface CardPlacement {
  mode: 'anchored' | 'center' | 'dock';
  side?: Side;
  top: number;
  left: number;
  width: number;
}

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULTS = { gap: 12, margin: 12, dockBelow: 640, maxWidth: 360 };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The safe box the card must stay inside. */
function safeBox(vp: Viewport, margin: number) {
  const i = vp.insets ?? ZERO;
  return { L: i.left + margin, R: vp.width - i.right - margin, T: i.top + margin, B: vp.height - i.bottom - margin };
}

export function isDocked(vp: Viewport, opts: PlaceOptions = {}): boolean {
  return vp.width < (opts.dockBelow ?? DEFAULTS.dockBelow);
}

/** Card width for this viewport: full safe width when docked, otherwise maxWidth (never wider than the screen). */
export function cardWidth(vp: Viewport, opts: PlaceOptions = {}): number {
  const { L, R } = safeBox(vp, opts.margin ?? DEFAULTS.margin);
  const avail = Math.max(0, R - L);
  return isDocked(vp, opts) ? avail : Math.min(opts.maxWidth ?? DEFAULTS.maxWidth, avail);
}

/** The spotlight hole: the target grown by `pad` on every side. */
export function spotlightRect(target: Rect, pad = 8): Rect {
  return { top: target.top - pad, left: target.left - pad, width: target.width + pad * 2, height: target.height + pad * 2 };
}

/**
 * Where the card goes. `target` is the spotlight rect in viewport coordinates (null for no target).
 * Docked on narrow screens; otherwise beside the target on the requested side if it fits, then the
 * opposite side, then bottom/top/right/left; centered when nothing fits. Always clamped inside the safe box.
 */
export function placeCard(target: Rect | null, card: Size, vp: Viewport, opts: PlaceOptions = {}): CardPlacement {
  const gap = opts.gap ?? DEFAULTS.gap;
  const { L, R, T, B } = safeBox(vp, opts.margin ?? DEFAULTS.margin);
  const w = Math.max(0, Math.min(card.width, R - L));
  const h = card.height;

  if (isDocked(vp, opts)) {
    return { mode: 'dock', top: Math.max(T, B - h), left: L, width: Math.max(0, R - L) };
  }

  const center = (): CardPlacement => ({
    mode: 'center',
    top: T + Math.max(0, (B - T - h) / 2),
    left: L + Math.max(0, (R - L - w) / 2),
    width: w,
  });
  if (!target) return center();

  const tBottom = target.top + target.height;
  const tRight = target.left + target.width;
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;

  const fits: Record<Side, boolean> = {
    bottom: tBottom + gap + h <= B,
    top: target.top - gap - h >= T,
    right: tRight + gap + w <= R,
    left: target.left - gap - w >= L,
  };
  const at = (side: Side): CardPlacement => {
    let top: number;
    let left: number;
    if (side === 'bottom' || side === 'top') {
      top = side === 'bottom' ? tBottom + gap : target.top - gap - h;
      left = clamp(cx - w / 2, L, R - w);
    } else {
      left = side === 'right' ? tRight + gap : target.left - gap - w;
      top = clamp(cy - h / 2, T, B - h);
    }
    return { mode: 'anchored', side, top: clamp(top, T, B - h), left: clamp(left, L, R - w), width: w };
  };

  const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const order: Side[] = [];
  const pref = opts.placement && opts.placement !== 'auto' ? opts.placement : null;
  if (pref) order.push(pref, opposite[pref]);
  for (const s of ['bottom', 'top', 'right', 'left'] as Side[]) if (!order.includes(s)) order.push(s);

  const side = order.find((s) => fits[s]);
  return side ? at(side) : center();
}

/* ---------- DOM helpers (only called in effects/handlers) ---------- */

function findTarget(id: string | undefined): HTMLElement | null {
  if (!id) return null;
  try {
    const sel = `[data-tour="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"')}"]`;
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null; // display:none or detached
    return el;
  } catch {
    return null;
  }
}

function toRect(r: DOMRect): Rect {
  return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

interface Layout { vp: Viewport; target: Rect | null }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EASE = [0.16, 1, 0.3, 1] as const;
const PAD = 8;
const RADIUS = 12;

/* ---------- Component ---------- */

export function Tour({ steps, screen, onDone }: { steps: TourStep[]; screen: TourScreen; onDone: (how: 'finished' | 'skipped') => void }) {
  const list = useMemo(() => steps.filter((s) => s.screen === screen), [steps, screen]);
  const [pos, setPos] = useState({ screen, i: 0 });
  const i = pos.screen === screen ? Math.min(pos.i, Math.max(0, list.length - 1)) : 0;
  const step = list[i] as TourStep | undefined;
  const n = list.length;
  const last = i === n - 1;

  const reduce = useReducedMotion() ?? false;
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [cardH, setCardH] = useState(0);
  const [glide, setGlide] = useState(false);

  const go = useCallback((to: number) => setPos({ screen, i: to }), [screen]);
  const next = useCallback(() => (last ? onDone('finished') : go(i + 1)), [last, onDone, go, i]);
  const back = useCallback(() => i > 0 && go(i - 1), [i, go]);
  const skip = useCallback(() => onDone('skipped'), [onDone]);

  // Measure viewport, safe-area insets and the target; track with ResizeObserver, scroll, resize and DOM changes.
  useLayoutEffect(() => {
    if (!step) return;
    let raf = 0;
    let observed: HTMLElement | null = null;
    let scrolledFor = false;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null;

    const measure = () => {
      raf = 0;
      try {
        const de = document.documentElement;
        let insets = ZERO;
        if (probeRef.current) {
          const cs = getComputedStyle(probeRef.current);
          insets = {
            top: parseFloat(cs.paddingTop) || 0,
            right: parseFloat(cs.paddingRight) || 0,
            bottom: parseFloat(cs.paddingBottom) || 0,
            left: parseFloat(cs.paddingLeft) || 0,
          };
        }
        const vp: Viewport = { width: de.clientWidth || window.innerWidth, height: de.clientHeight || window.innerHeight, insets };
        const el = findTarget(step.target);
        if (el !== observed) {
          if (observed) ro?.unobserve(observed);
          if (el) ro?.observe(el);
          observed = el;
        }
        if (el && !scrolledFor) {
          scrolledFor = true;
          const r = el.getBoundingClientRect();
          const docked = isDocked(vp);
          // On phones the card covers the bottom, so the target has to sit in the upper part.
          const bottomLimit = docked ? vp.height * 0.55 : vp.height - insets.bottom;
          // A sticky page header would cover a target scrolled to the very top, so keep it below the header.
          let headerBottom = insets.top;
          for (const h of document.querySelectorAll<HTMLElement>('header, [data-sticky-header]')) {
            const cs = getComputedStyle(h);
            if (cs.position === 'sticky' || cs.position === 'fixed') headerBottom = Math.max(headerBottom, h.getBoundingClientRect().bottom);
          }
          if (r.top < headerBottom || r.bottom > bottomLimit) {
            const want = docked ? headerBottom + 12 : Math.max(headerBottom + 12, (vp.height - r.height) / 2);
            window.scrollTo({ top: window.scrollY + r.top - want, behavior: reduce ? 'auto' : 'smooth' });
          }
        }
        const target = el ? toRect(el.getBoundingClientRect()) : null;
        setLayout((prev) =>
          prev && sameRect(prev.target, target) && prev.vp.width === vp.width && prev.vp.height === vp.height &&
          JSON.stringify(prev.vp.insets) === JSON.stringify(vp.insets)
            ? prev
            : { vp, target },
        );
      } catch {
        setLayout((prev) => prev ?? { vp: { width: window.innerWidth, height: window.innerHeight }, target: null });
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    mo?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tour', 'class', 'style', 'hidden'] });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [step, reduce]);

  // Glide the hole and card between steps, but follow scrolling instantly.
  useEffect(() => {
    if (reduce) return;
    setGlide(true);
    const t = setTimeout(() => setGlide(false), 320);
    return () => clearTimeout(t);
  }, [step?.id, reduce]);

  // Card height (its width comes from the viewport, so measure height after width is applied).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const read = () => setCardH(card.offsetHeight);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(card);
    return () => ro.disconnect();
  }, [step?.id, layout?.vp.width]);

  // Focus: remember where focus was, move it to the card on each step, restore it on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      try {
        prev?.focus?.({ preventScroll: true });
      } catch {
        /* element gone */
      }
    };
  }, []);
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [step?.id]);

  // Keyboard: Esc skips, ArrowRight/Enter next, ArrowLeft back.
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Enter') {
        if (t?.closest('button, a, input, textarea, select')) return; // let the focused control act
        e.preventDefault();
        next();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [step, next, back, skip]);

  // Keep Tab inside the card (aria-modal).
  const onCardKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !cardRef.current) return;
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === cardRef.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!step || typeof document === 'undefined') return null;

  const vp = layout?.vp ?? { width: 0, height: 0 };
  const hole = layout?.target ? spotlightRect(layout.target, PAD) : null;
  const width = cardWidth(vp);
  const place = placeCard(hole, { width, height: cardH }, vp, { placement: step.placement });
  const ready = !!layout && cardH > 0;
  const move = glide && !reduce ? { duration: 0.24, ease: EASE } : { duration: 0 };
  const maskId = `tour-mask-${titleId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const safe = vp.insets ?? ZERO;
  const maxH = Math.max(160, vp.height - safe.top - safe.bottom - 24);

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-tour-overlay="">
      {/* Reads env(safe-area-inset-*) so the math can respect it. */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed top-0 left-0"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
        }}
      />

      {/* Dim with a hole. Catches clicks so the page under the tour stays put. */}
      <motion.svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hole && (
              <motion.rect
                initial={false}
                animate={{ x: hole.left, y: hole.top, width: hole.width, height: hole.height }}
                transition={move}
                rx={RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgb(0 0 0 / 0.66)" mask={`url(#${maskId})`} />
        {hole && (
          <motion.rect
            initial={false}
            animate={{ x: hole.left, y: hole.top, width: hole.width, height: hole.height }}
            transition={move}
            rx={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity={0.7}
            strokeWidth={1.5}
          />
        )}
      </motion.svg>

      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onCardKeyDown}
        className="absolute overflow-y-auto rounded-xl border border-line-strong bg-surface text-ink outline-none"
        style={{ width: place.width || undefined, maxHeight: maxH, opacity: ready ? 1 : 0, pointerEvents: ready ? undefined : 'none' }}
        initial={false}
        animate={{ top: place.top, left: place.left }}
        transition={move}
      >
        <motion.div
          key={step.id}
          className="flex flex-col gap-4 p-5"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-3 tabular-nums">
              Step {i + 1} of {n}
            </p>
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-[var(--dur-panel)] ease-[var(--ease-out)]"
                style={{ width: `${((i + 1) / n) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 id={titleId} className="font-voice text-md font-semibold tracking-[-0.01em] text-ink">
              {step.title}
            </h2>
            <p id={bodyId} className="text-[0.9375rem] leading-relaxed text-ink-2">
              {step.body}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="md" onClick={skip} className="-ml-2 px-2">
              Skip tutorial
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={back}
                disabled={i === 0}
                icon={<ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />}
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={next}
                iconEnd={
                  last ? (
                    <Check className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  )
                }
              >
                {last ? 'Done' : 'Next'}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}
