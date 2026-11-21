import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import type { LoopStep } from '../types';

/** The learner-facing phases of the loop. Engine steps fold into these. */
export const PHASES = [
  { id: 'learn', label: 'Learn', steps: ['define'] },
  { id: 'example', label: 'Example', steps: ['example'] },
  { id: 'walk', label: 'Line by line', steps: ['walkthrough'] },
  { id: 'talk', label: 'Talk it through', steps: ['talkthrough', 'feedback'] },
  { id: 'try', label: 'Try it', steps: ['doit', 'check'] },
] as const;

export function phaseIndex(step: LoopStep): number {
  if (step === 'mastered') return PHASES.length;
  return PHASES.findIndex((p) => (p.steps as readonly string[]).includes(step));
}

export type JumpTarget = 'define' | 'example' | 'walkthrough' | 'talkthrough' | 'doit';
const TARGET: Record<string, JumpTarget> = { learn: 'define', example: 'example', walk: 'walkthrough', talk: 'talkthrough', try: 'doit' };

export function StepTrack({ step, compact, onJump, seen }: { step: LoopStep; compact?: boolean; onJump?: (t: JumpTarget) => void; seen?: LoopStep[] }) {
  const current = phaseIndex(step);
  const listRef = useRef<HTMLOListElement>(null);
  // On a phone the five steps don't fit; slide the row so the current one is always in view.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !el) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const target = list.scrollLeft + (er.left - lr.left) - (lr.width - er.width) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [current]);
  const pct = Math.min(100, ((current + (step === 'mastered' ? 0 : 0.5)) / PHASES.length) * 100);
  return (
    <nav aria-label="Lesson progress" className="w-full">
      {compact ? (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">{current < PHASES.length ? PHASES[current].label : 'Mastered'}</span>
          <span className="tnum text-ink-3">
            {' '}
            · step {Math.min(current + 1, PHASES.length)} of {PHASES.length}
          </span>
        </p>
      ) : (
        <ol ref={listRef} className="flex items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
          {PHASES.map((p, i) => {
            // ticked only if he was actually on it (jumping ahead doesn't count earlier steps as done)
            const done = i < current && (!seen || (p.steps as readonly string[]).some((s) => seen.includes(s as LoopStep)));
            const now = i === current;
            return (
              <li key={p.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => onJump?.(TARGET[p.id])}
                  disabled={!onJump}
                  aria-current={now ? 'step' : undefined}
                  title={now ? undefined : `Go to ${p.label}`}
                  className={`press flex h-11 items-center gap-1.5 rounded-md px-2.5 text-[0.9375rem] whitespace-nowrap hover:text-ink disabled:cursor-default ${now ? 'font-medium text-ink' : done ? 'text-ink-2' : 'text-ink-3'}`}
                >
                {done ? (
                  <Check className="size-4 text-ok" strokeWidth={2.25} aria-label="done" />
                ) : (
                  <span className={`tnum grid size-5 place-items-center rounded-full text-xs ${now ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-3'}`} aria-hidden="true">
                    {i + 1}
                  </span>
                )}
                {p.label}
                </button>
                {now && (
                  <motion.span
                    layoutId="step-underline"
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-ink"
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className={`mt-2 h-0.5 w-full rounded-full bg-line ${compact ? '' : 'hidden'}`} aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-[240ms] ease-out" style={{ width: `${pct}%` }} />
      </div>
    </nav>
  );
}
