import { Check } from 'lucide-react';
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

export function StepTrack({ step, compact }: { step: LoopStep; compact?: boolean }) {
  const current = phaseIndex(step);
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
        <ol className="flex items-center gap-5">
          {PHASES.map((p, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li
                key={p.id}
                aria-current={now ? 'step' : undefined}
                className={`flex items-center gap-1.5 text-sm whitespace-nowrap ${now ? 'font-medium text-ink' : done ? 'text-ink-2' : 'text-ink-3'}`}
              >
                {done && <Check className="size-3.5 text-accent" strokeWidth={2.25} aria-label="done" />}
                {p.label}
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-2 h-0.5 w-full rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-[240ms] ease-out" style={{ width: `${pct}%` }} />
      </div>
    </nav>
  );
}
