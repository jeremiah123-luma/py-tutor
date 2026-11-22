// One short exam-style question (what does this print / pick one / find the bug). Used by the practice exam and by
// Quick check. Answers lock in once given; the right answer and why show straight after.
import { useMemo, useState } from 'react';
import type { DrillQuestion } from '../types';
import { CodeEditor } from './CodeEditor';
import { FilePreview } from './FilePreview';
import { Button } from './primitives';

export type ShortAnswer = { given: string | number; correct: boolean };

export function QuestionCard({ q, answered, onAnswer }: { q: DrillQuestion; answered?: ShortAnswer; onAnswer: (a: string | number) => void }) {
  const [text, setText] = useState('');
  const locked = !!answered;
  const kindLabel = useMemo(
    () => ({ predict: 'What does this print?', choice: 'Pick one', 'spot-bug': 'Find the bug' })[q.kind],
    [q.kind],
  );
  return (
    <div className="flex flex-col gap-5">
      <p><span className="glass-dark inline-flex items-center rounded-full px-3 py-1 text-sm text-tag-violet">{kindLabel}</span></p>
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
            {answered.correct ? 'Right.' : q.kind === 'predict' ? 'Not quite. It prints:' : 'Not quite.'}
          </p>
          {!answered.correct && q.kind === 'predict' && (
            <pre className="mt-1.5 rounded-md bg-code-bg px-3 py-2 font-code text-[13px] leading-relaxed whitespace-pre-wrap">{String(q.answer)}</pre>
          )}
          <p className="mt-1 text-[0.9375rem] text-ink-2">{q.explain}</p>
        </div>
      )}
    </div>
  );
}
