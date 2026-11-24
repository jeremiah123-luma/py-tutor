// A run of short questions, one at a time: Quick check after a lesson, and topic practice from Home.
// The score is what was right the first time. Missed questions come back once at the end, so each missed idea is
// seen twice, and the score is saved as soon as the first pass ends (leaving during the second look loses nothing).
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DrillQuestion } from '../types';
import { checkShort } from '../loop/drill';
import { QuestionCard, type ShortAnswer } from './QuestionCard';
import { Button } from './primitives';

export interface QuizRunnerProps {
  questions: DrillQuestion[];
  /** First-pass score, once per run. */
  onFinish?: (right: number, of: number) => void;
  /** The button on the score screen (for example Next skill, or Back to Home). */
  doneLabel: string;
  onDone: () => void;
  /** Shuffle again on Try again (topic practice); a lesson's Quick check keeps its order. */
  reshuffle?: (qs: DrillQuestion[]) => DrillQuestion[];
  /** Topic practice from Home rather than a lesson's Quick check (changes the wording on the score screen). */
  practice?: boolean;
  /** Keep a half-finished run on this device under this key, so leaving and coming back picks it up. */
  saveKey?: string;
}

interface SavedRun {
  ids: string[];
  queue: string[];
  i: number;
  answers: Record<string, ShortAnswer>;
  again: Record<string, ShortAnswer>;
}
/** A saved run is only used if it is for exactly these questions. */
function loadRun(key: string | undefined, questions: DrillQuestion[]) {
  if (!key) return null;
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null') as SavedRun | null;
    const byId = new Map(questions.map((q) => [q.id, q]));
    if (!s || !Array.isArray(s.ids) || s.ids.length !== questions.length || !s.ids.every((id) => byId.has(id))) return null;
    const queue = (Array.isArray(s.queue) ? s.queue : s.ids).map((id) => byId.get(id)).filter((q): q is DrillQuestion => !!q);
    if (queue.length < questions.length) return null;
    const i = Math.max(0, Math.min(queue.length - 1, Math.floor(Number(s.i)) || 0));
    return { order: s.ids.map((id) => byId.get(id)!), queue, i, answers: s.answers ?? {}, again: s.again ?? {} };
  } catch {
    return null;
  }
}

export function QuizRunner({ questions, onFinish, doneLabel, onDone, reshuffle, practice, saveKey }: QuizRunnerProps) {
  const [saved] = useState(() => loadRun(saveKey, questions)); // a run he left half-way, if there is one
  const [run, setRun] = useState(0);
  const [order, setOrder] = useState(saved?.order ?? questions);
  const [queue, setQueue] = useState<DrillQuestion[]>(saved?.queue ?? questions);
  const [i, setI] = useState(saved?.i ?? 0);
  const [answers, setAnswers] = useState<Record<string, ShortAnswer>>(saved?.answers ?? {}); // first pass
  const [again, setAgain] = useState<Record<string, ShortAnswer>>(saved?.again ?? {}); // the second look at missed ones
  const [finished, setFinished] = useState(false);
  // Every answer and every move is saved; a finished run is forgotten so the next visit starts fresh.
  useEffect(() => {
    if (!saveKey) return;
    try {
      if (finished || (i === 0 && !Object.keys(answers).length)) localStorage.removeItem(saveKey);
      else localStorage.setItem(saveKey, JSON.stringify({ ids: order.map((q) => q.id), queue: queue.map((q) => q.id), i, answers, again } satisfies SavedRun));
    } catch {
      /* storage blocked or full: the run just isn't kept */
    }
  }, [saveKey, order, queue, i, answers, again, finished]);
  const top = useRef<HTMLDivElement>(null);
  const reported = useRef(-1);

  const n = order.length;
  const firstPass = i < n;
  const q = queue[i];
  const answered = q ? (firstPass ? answers[q.id] : again[q.id]) : undefined;
  const right = order.filter((x) => answers[x.id]?.correct).length;

  // the score counts once the first pass is done
  useEffect(() => {
    if (Object.keys(answers).length === n && n > 0 && reported.current !== run) {
      reported.current = run;
      onFinish?.(order.filter((x) => answers[x.id]?.correct).length, n);
    }
  }, [answers, n, order, run, onFinish]);

  const scrollUp = () => top.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  const next = () => {
    if (i === n - 1) {
      const missed = order.filter((x) => !answers[x.id]?.correct);
      if (missed.length) setQueue([...order, ...missed]);
      else return setFinished(true);
    } else if (i >= queue.length - 1) return setFinished(true);
    setI(i + 1);
    scrollUp();
  };
  const restart = () => {
    const o = reshuffle ? reshuffle(questions) : questions;
    setOrder(o);
    setQueue(o);
    setAnswers({});
    setAgain({});
    setI(0);
    setFinished(false);
    setRun((r) => r + 1);
    scrollUp();
  };

  if (finished) {
    const perfect = right === n;
    return (
      <div ref={top} className="flex flex-col gap-5 animate-[stage-in_420ms_var(--ease-out)]" role="status">
        <p className="text-sm text-ink-3">{practice ? 'Practice done' : 'Quick check done'}</p>
        <h2 className="font-voice text-3xl font-medium tracking-[-0.02em]">
          <span className="tnum">
            {right} of {n}
          </span>
          {perfect && <Check className="ml-2 inline size-7 align-[-0.1em] text-ok" strokeWidth={2.5} aria-hidden="true" />}
        </h2>
        <p className="max-w-[46ch] text-md text-ink-2">
          {perfect
            ? practice
              ? 'Perfect. Every question right.'
              : 'Perfect. It shows as a check on Home.'
            : n >= 3 && right >= n - 1
              ? 'Close. Read the one you missed again, then try once more for a perfect score.'
              : 'Worth another pass. Go back through Learn or the example, then try again.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onDone} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
            {doneLabel}
          </Button>
          <Button variant="ghost" onClick={restart} icon={<RotateCcw className="size-4" strokeWidth={2} />}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!q) return null;
  const missedCount = queue.length - n;
  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-6">
      <div>
        <p className="tnum text-sm text-ink-3" aria-live="polite">
          {firstPass ? `Question ${i + 1} of ${n}` : `One more look · ${i - n + 1} of ${missedCount}`}
        </p>
        <div className="mt-2 h-0.5 w-full rounded-full bg-line" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-[240ms] ease-out"
            style={{ width: `${((i + (answered ? 1 : 0)) / queue.length) * 100}%` }}
          />
        </div>
      </div>
      <div key={`${run}-${i}`} className="animate-[stage-in_420ms_var(--ease-out)]">
        <QuestionCard
          q={q}
          answered={answered}
          onAnswer={(given) => {
            const a = { given, correct: checkShort(q, given) };
            if (firstPass) setAnswers((x) => ({ ...x, [q.id]: a }));
            else setAgain((x) => ({ ...x, [q.id]: a }));
          }}
        />
      </div>
      {answered && (
        <div className="animate-[stage-in_320ms_var(--ease-out)]">
          <Button variant="primary" autoFocus onClick={next} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
            {i === queue.length - 1 && (i !== n - 1 || right === n) ? 'See your score' : 'Next question'}
          </Button>
        </div>
      )}
    </div>
  );
}
