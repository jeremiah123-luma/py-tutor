// Step-through player, like the zyBooks animations: plays the example one executed line at a time,
// showing that line's explanation, the variables after it ran, and the output so far.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { TraceStep, WalkNote } from '../types';

const SPEED_MS = 1700;

export function StepPlayer({
  steps,
  notes,
  onLine,
  onClose,
}: {
  steps: TraceStep[];
  notes: WalkNote[];
  onLine: (line: number) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const step = steps[i];
  const prev = i > 0 ? steps[i - 1] : null;
  const last = i === steps.length - 1;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => onLine(step.line), [step.line, onLine]);
  useEffect(() => {
    if (!playing) return;
    if (last) {
      setPlaying(false);
      return;
    }
    timer.current = window.setTimeout(() => setI((n) => Math.min(n + 1, steps.length - 1)), SPEED_MS);
    return () => window.clearTimeout(timer.current);
  }, [playing, i, last, steps.length]);

  const prevVars = useMemo(() => new Map(prev?.vars ?? []), [prev]);
  const note = notes.find((n) => n.line === step.line)?.text;
  const newOut = step.out.slice(prev?.out.length ?? 0);

  const btn = 'press grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-35';
  return (
    <section aria-label="Step-through player" className="flex h-full min-h-[15rem] flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <button className={btn} onClick={() => { setPlaying(false); setI((n) => Math.max(0, n - 1)); }} disabled={i === 0} aria-label="Previous step">
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <button
          className="press grid size-9 place-items-center rounded-lg bg-ink text-paper"
          onClick={() => (last ? (setI(0), setPlaying(true)) : setPlaying((p) => !p))}
          aria-label={last ? 'Play again' : playing ? 'Pause' : 'Play'}
        >
          {last ? <RotateCcw className="size-4" strokeWidth={2} /> : playing ? <Pause className="size-4" strokeWidth={2} /> : <Play className="size-4" strokeWidth={2} />}
        </button>
        <button className={btn} onClick={() => { setPlaying(false); setI((n) => Math.min(steps.length - 1, n + 1)); }} disabled={last} aria-label="Next step">
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
        <div className="mx-2 h-1 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
        </div>
        <p className="tnum text-sm text-ink-3">
          Step {i + 1} of {steps.length} · line {step.line}
        </p>
        <button className={btn} onClick={onClose} aria-label="Close the player">
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-px bg-line md:grid-cols-[1.1fr_1fr_1fr]">
        <div className="bg-paper p-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-3 uppercase">What line {step.line} does</p>
          <p key={i} className="text-[0.9375rem] leading-snug text-ink animate-[stage-in_300ms_var(--ease-out)]">
            {note ?? 'Python runs this line.'}
          </p>
        </div>
        <div className="overflow-auto bg-paper p-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-3 uppercase">Variables</p>
          {step.vars.length === 0 ? (
            <p className="text-sm text-ink-3">None yet.</p>
          ) : (
            <table className="w-full font-code text-[0.8125rem]">
              <tbody>
                {step.vars.map(([k, v]) => {
                  const changed = prevVars.get(k) !== v;
                  return (
                    <tr key={k} className={changed ? 'animate-[var-flash_1200ms_var(--ease-out)]' : ''}>
                      <td className="py-0.5 pr-3 align-top text-ink">{k}</td>
                      <td className="py-0.5 break-all text-ink-2">{v}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="overflow-auto bg-paper p-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-3 uppercase">Output</p>
          {step.out ? (
            <pre className="font-code text-[0.8125rem] whitespace-pre-wrap text-ink">
              {step.out.slice(0, step.out.length - newOut.length)}
              <span className="rounded-sm bg-hl">{newOut}</span>
            </pre>
          ) : (
            <p className="text-sm text-ink-3">Nothing printed yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
