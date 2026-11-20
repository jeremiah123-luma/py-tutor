// Exam Drill: exam conditions. No tutor, no hints. 16 short questions, then 2 coding problems, then a score.
import { ArrowLeft, ArrowRight, Check, ListChecks, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ConceptId, DrillQuestion, GradeResult, Problem } from '../types';
import type { Drill } from '../loop/drill';
import { checkShort } from '../loop/drill';
import { CodeEditor } from '../ui/CodeEditor';
import { TestResults } from '../ui/Console';
import { Button } from '../ui/primitives';
import { FilePreview, sampleFiles } from '../ui/FilePreview';
import { TopBar } from '../ui/TopBar';

export interface DrillScreenProps {
  drill: Drill;
  grade: (code: string, problem: Problem) => Promise<GradeResult>;
  onExit: () => void;
  conceptTitle: (id: ConceptId) => string;
}

type ShortAnswer = { given: string | number; correct: boolean };

function useClock(minutes: number) {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

export function DrillScreen({ drill, grade, onExit, conceptTitle }: DrillScreenProps) {
  const total = drill.short.length + drill.coding.length;
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ShortAnswer>>({});
  const [codes, setCodes] = useState<string[]>(() => drill.coding.map((c) => c.problem.starter));
  const [grades, setGrades] = useState<(GradeResult | null)[]>(() => drill.coding.map(() => null));
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);
  const clock = useClock(drill.minutes);

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
                {!answers[x.id]?.correct && <p className="mt-1 text-sm text-ink-2">{x.explain}</p>}
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
    <Shell clock={clock} label={`${i + 1} of ${total}`} onExit={onExit}>
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
          <FilePreview files={sampleFiles(drill.coding[ci].problem.tests)} caption="Sample file (the tests use other files like it):" />
          <div className="overflow-hidden rounded-xl border border-line bg-code-bg">
            <CodeEditor
              value={codes[ci]}
              onChange={(v) => setCodes((c) => c.map((x, k) => (k === ci ? v : x)))}
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
                const g = await grade(codes[ci], drill.coding[ci].problem);
                setGrades((gs) => gs.map((x, k) => (k === ci ? g : x)));
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
        <Button variant="ghost" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} icon={<ArrowLeft className="size-4" strokeWidth={2} />}>
          Back
        </Button>
        {i < total - 1 ? (
          <Button variant="primary" onClick={() => setI((n) => n + 1)} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
            Next
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setDone(true)}>
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
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur-md">
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

function ShortQuestion({ q, answered, onAnswer }: { q: DrillQuestion; answered?: ShortAnswer; onAnswer: (a: string | number) => void }) {
  const [text, setText] = useState('');
  const locked = !!answered;
  const kindLabel = useMemo(
    () => ({ predict: 'What does this print?', choice: 'Pick one', 'spot-bug': 'Find the bug' })[q.kind],
    [q.kind],
  );
  return (
    <div className="flex flex-col gap-5">
      <p><span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-sm text-tag-violet">{kindLabel}</span></p>
      {q.prompt.trim() !== kindLabel && <p className="font-voice text-lg leading-snug">{q.prompt}</p>}
      <FilePreview files={q.files} caption="The file it reads:" />
      {q.code && (
        <div className="overflow-hidden rounded-xl border border-line bg-code-bg">
          <CodeEditor value={q.code} readOnly label="Question code" minHeight="0" />
        </div>
      )}
      {q.kind === 'predict' ? (
        <div className="flex flex-col gap-3">
          <label htmlFor={`a-${q.id}`} className="text-sm text-ink-2">
            Exact output, one printed line per line
          </label>
          <textarea
            id={`a-${q.id}`}
            value={locked ? String(answered!.given) : text}
            onChange={(e) => setText(e.target.value)}
            disabled={locked}
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full rounded-lg border border-line-strong bg-surface p-3 font-code text-sm focus-visible:outline-2 focus-visible:outline-accent"
          />
          {!locked && (
            <div>
              <Button variant="primary" onClick={() => onAnswer(text)} disabled={!text.trim()}>
                Lock in answer
              </Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {q.choices!.map((c, k) => {
            const picked = answered?.given === k;
            const right = Number(q.answer) === k;
            const tone = !locked
              ? 'border-line-strong hover:border-ink-3'
              : right
                ? 'border-ok bg-nail-bg'
                : picked
                  ? 'border-err bg-err-bg'
                  : 'border-line opacity-70';
            return (
              <li key={k}>
                <button
                  disabled={locked}
                  onClick={() => onAnswer(k)}
                  className={`press w-full rounded-lg border px-4 py-3 text-left text-[0.9375rem] ${tone}`}
                >
                  {c}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {answered && (
        <div className={`rounded-lg px-4 py-3 ${answered.correct ? 'bg-nail-bg' : 'bg-fix-bg'}`} role="status">
          <p className="text-[0.9375rem] font-medium">
            {answered.correct ? 'Right.' : q.kind === 'predict' ? `Not quite. It prints: ${String(q.answer)}` : 'Not quite.'}
          </p>
          <p className="mt-1 text-[0.9375rem] text-ink-2">{q.explain}</p>
        </div>
      )}
    </div>
  );
}
