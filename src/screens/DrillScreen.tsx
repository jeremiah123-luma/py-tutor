// Exam Drill: exam conditions. No tutor, no hints; each answer is shown once locked in. 16 short questions, then 2 coding problems, then a score.
import { ArrowLeft, ArrowRight, Check, ListChecks, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ConceptId, GradeResult, Problem } from '../types';
import type { Drill } from '../loop/drill';
import { checkShort } from '../loop/drill';
import { QuestionCard as ShortQuestion, type ShortAnswer } from '../ui/QuestionCard';
import { CodeEditor } from '../ui/CodeEditor';
import { TestResults } from '../ui/Console';
import { Button } from '../ui/primitives';
import { FilePreview, sampleFiles } from '../ui/FilePreview';
import { TopBar } from '../ui/TopBar';
import { distortionWave } from '../ui/wave';

export interface DrillScreenProps {
  drill: Drill;
  grade: (code: string, problem: Problem) => Promise<GradeResult>;
  onExit: () => void;
  conceptTitle: (id: ConceptId) => string;
}


/** Time left, from a fixed end time (so a locked phone or a background tab can't pause or drift it). */
function useClock(minutes: number, running: boolean) {
  const end = useRef(Date.now() + minutes * 60_000);
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    if (!running) return;
    const tick = () => setLeft(Math.max(0, Math.round((end.current - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

export function DrillScreen({ drill, grade, onExit, conceptTitle }: DrillScreenProps) {
  const total = drill.short.length + drill.coding.length;
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ShortAnswer>>({});
  const [codes, setCodes] = useState<string[]>(() => drill.coding.map((c) => c.problem.starter));
  const [grades, setGrades] = useState<(GradeResult | null)[]>(() => drill.coding.map(() => null));
  const [checking, setChecking] = useState(false);
  const gradedFor = useRef<string[]>(drill.coding.map(() => ''));
  const codesRef = useRef(codes);
  codesRef.current = codes;
  const [done, setDone] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const { left, text: clock } = useClock(drill.minutes, !done);

  // Score it: any coding problem he didn't check (or changed since checking) is graded now, as it stands.
  const finish = async () => {
    setFinishing(true);
    // a grade only counts for the exact code it graded; anything unchecked or edited since is graded now
    const final = await Promise.all(drill.coding.map((c, k) => (grades[k] && gradedFor.current[k] === codes[k] ? grades[k]! : grade(codes[k], c.problem))));
    setGrades(final);
    setFinishing(false);
    setDone(true);
    window.scrollTo(0, 0);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (left === 0 && !done && !finishing) {
      setTimeUp(true);
      void finishRef.current();
    }
  }, [left, done, finishing]);

  // Leaving mid-exam throws the attempt away, so ask once anything is answered.
  const started = Object.keys(answers).length > 0 || codes.some((c, k) => c !== drill.coding[k].problem.starter);
  // Reloading or closing the tab mid-exam asks first, like the Leave button.
  useEffect(() => {
    if (done || !started) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [done, started]);
  const leave = () => {
    if (!done && started && !window.confirm('Leave the practice exam? Your answers will be lost.')) return;
    onExit();
  };
  // The browser's back button (or an iPhone swipe back) asks the same way.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    const onBack = () => leaveRef.current();
    window.addEventListener('py-tutor:back', onBack);
    return () => window.removeEventListener('py-tutor:back', onBack);
  }, []);

  const isShort = i < drill.short.length;
  const q = isShort ? drill.short[i] : null;
  const ci = i - drill.short.length;

  if (done) {
    const shortRight = drill.short.filter((x) => answers[x.id]?.correct).length;
    const codingRight = grades.filter((g) => g?.passed).length;
    const missedBy: Partial<Record<ConceptId, number>> = {};
    drill.short.forEach((x) => {
      if (!answers[x.id]?.correct) missedBy[x.concept] = (missedBy[x.concept] ?? 0) + 1;
    });
    drill.coding.forEach((c, k) => {
      if (!grades[k]?.passed) missedBy[c.concept] = (missedBy[c.concept] ?? 0) + 2;
    });
    const weakest = Object.entries(missedBy).sort((a, b) => b[1] - a[1])[0]?.[0] as ConceptId | undefined;
    return (
      <Shell clock={null} label="Results" onExit={onExit}>
        {timeUp && <p className="mb-3 text-sm font-medium text-fix">Time’s up. Here’s how you did.</p>}
        <h1 className="font-voice text-2xl font-medium md:text-3xl">
          {shortRight + codingRight} of {total}
        </h1>
        <p className="mt-3 text-md text-ink-2">
          {shortRight} of {drill.short.length} short questions, {codingRight} of {drill.coding.length} coding problems.
          {weakest ? ` Spend your next session on ${conceptTitle(weakest).toLowerCase()}.` : ' Clean sweep. That is exam-ready.'}
        </p>
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {drill.short.map((x, k) => (
            <li key={x.id} className="flex items-start gap-3 py-3">
              {answers[x.id]?.correct ? (
                <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.25} aria-label="right" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-err" strokeWidth={2.25} aria-label="wrong" />
              )}
              <div className="min-w-0">
                <p className="text-[0.9375rem]">
                  <span className="tnum text-ink-3">{k + 1}. </span>
                  {x.prompt}
                </p>
                {!answers[x.id]?.correct && (
                  <>
                    {answers[x.id] && x.kind === 'predict' && (
                      <div className="mt-2 text-sm text-ink-3">
                        You wrote:{' '}
                        <pre className="mt-1 inline-block rounded-md bg-surface-2 px-2 py-1 align-top font-code text-[13px] whitespace-pre-wrap text-ink-2">{String(answers[x.id]!.given)}</pre>
                      </div>
                    )}
                    {x.code && <pre className="mt-2 overflow-x-auto rounded-md bg-code-bg px-3 py-2 font-code text-[13px] leading-relaxed">{x.code}</pre>}
                    <div className="mt-2 text-sm text-ink-2">
                      Answer:{' '}
                      {x.kind === 'predict' ? (
                        <pre className="mt-1 inline-block rounded-md bg-surface-2 px-2 py-1 align-top font-code text-[13px] whitespace-pre-wrap text-ink">{String(x.answer)}</pre>
                      ) : (
                        <span className="text-ink">{x.choices?.[Number(x.answer)]}</span>
                      )}
                      {answers[x.id] && x.kind !== 'predict' && <span className="block text-ink-3">You picked: {x.choices?.[Number(answers[x.id]!.given)]}</span>}
                      {!answers[x.id] && <span className="block text-ink-3">Not answered.</span>}
                    </div>
                    <p className="mt-1 text-sm text-ink-2">{x.explain}</p>
                  </>
                )}
              </div>
            </li>
          ))}
          {drill.coding.map((c, k) => (
            <li key={`code-${k}`} className="flex items-start gap-3 py-3">
              {grades[k]?.passed ? (
                <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.25} aria-label="right" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-err" strokeWidth={2.25} aria-label="wrong" />
              )}
              <div className="min-w-0">
                <p className="text-[0.9375rem]">
                  <span className="tnum text-ink-3">{drill.short.length + k + 1}. </span>
                  Coding: {c.problem.prompt}
                </p>
                {!grades[k]?.passed && grades[k] && (
                  <p className="mt-1 text-sm text-ink-2">
                    {grades[k]!.results.filter((r) => r.passed).length} of {grades[k]!.results.length} tests passed.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Button variant="primary" size="lg" onClick={onExit}>
            Back to topics
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell clock={clock} label={`${i + 1} of ${total}`} onExit={leave}>
      {q ? (
        <ShortQuestion
          key={q.id}
          q={q}
          answered={answers[q.id]}
          onAnswer={(given) => setAnswers((a) => ({ ...a, [q.id]: { given, correct: checkShort(q, given) } }))}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-3">
            Coding problem {ci + 1} of {drill.coding.length} · {conceptTitle(drill.coding[ci].concept)}
          </p>
          <p className="font-voice text-lg leading-snug">{drill.coding[ci].problem.prompt}</p>
          {drill.coding[ci].problem.prompt.includes('input()') && <p className="mt-2 text-sm text-ink-2">Use input() with no prompt text inside the brackets.</p>}
          <FilePreview files={sampleFiles(drill.coding[ci].problem.tests)} caption="Sample file (the tests use other files like it):" />
          <div className="overflow-hidden rounded-xl border border-line bg-code-bg">
            <CodeEditor
              value={codes[ci]}
              onChange={(v) => {
                setCodes((c) => c.map((x, k) => (k === ci ? v : x)));
                setGrades((gs) => gs.map((x, k) => (k === ci ? null : x))); // a changed answer needs a fresh check
              }}
              label="Your code"
              minHeight="16rem"
            />
          </div>
          <div>
            <Button
              variant="primary"
              loading={checking}
              icon={<ListChecks className="size-4" strokeWidth={2} />}
              onClick={async () => {
                setChecking(true);
                const code = codes[ci];
                const k0 = ci;
                const g = await grade(code, drill.coding[k0].problem);
                // edited while it was grading: this result is for old code, so drop it
                if (codesRef.current[k0] === code) {
                  gradedFor.current[k0] = code;
                  setGrades((gs) => gs.map((x, k) => (k === k0 ? g : x)));
                }
                setChecking(false);
              }}
            >
              Check my code
            </Button>
          </div>
          {grades[ci] && <TestResults grade={grades[ci]!} />}
        </div>
      )}

      <nav className="mt-10 flex items-center justify-between border-t border-line pt-5">
        <Button variant="ghost" onClick={() => { setI((n) => Math.max(0, n - 1)); window.scrollTo(0, 0); }} disabled={i === 0} icon={<ArrowLeft className="size-4" strokeWidth={2} />}>
          Back
        </Button>
        {i < total - 1 ? (
          <Button variant="primary" onClick={() => { setI((n) => n + 1); window.scrollTo(0, 0); }} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
            Next
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={finishing}
            disabled={checking}
            onClick={async (e) => {
              // Handing in the exam gets the wave, then the score.
              const page = e.currentTarget.closest('main') ?? e.currentTarget.parentElement?.parentElement;
              await distortionWave(page as HTMLElement | null, { origin: { x: e.clientX, y: e.clientY }, tone: 'iridescent' });
              await finish();
            }}
          >
            Finish and score
          </Button>
        )}
      </nav>
    </Shell>
  );
}

function Shell({ clock, label, onExit, children }: { clock: string | null; label: string; onExit: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-paper [transform:translateZ(0)] md:bg-paper/90 md:backdrop-blur-md">
        <TopBar
          crumbs={['Exam drill', label]}
          onHome={onExit}
          right={
            <>
              {clock && (
                <span className="tnum inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium" aria-label="time left">
                  {clock}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={onExit} icon={<ArrowLeft className="size-4" strokeWidth={2} />} aria-label="Leave the drill">
                <span className="hidden sm:inline">Leave</span>
              </Button>
            </>
          }
        />
      </header>
      <main className="mx-auto max-w-2xl px-5 pt-8 pb-16 md:px-8 md:pt-12">{children}</main>
    </div>
  );
}
