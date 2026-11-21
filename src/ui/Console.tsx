import { useState } from 'react';
import { CircleCheck, CircleX, EyeOff } from 'lucide-react';
import type { GradeResult, RunResult } from '../types';

/** Makes spaces and newlines visible so "expected vs got" differences are obvious. */
function Visible({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (const line of text.split('\n')) {
    if (i > 0) parts.push(<span key={`n${i}`} className="text-ink-3" aria-label="new line">↵{'\n'}</span>);
    line.split(/( )/).forEach((seg, j) =>
      parts.push(
        seg === ' ' ? (
          <span key={`${i}-${j}`} className="text-ink-3" aria-label="space">·</span>
        ) : (
          <span key={`${i}-${j}`}>{seg}</span>
        ),
      ),
    );
    i++;
  }
  return <>{parts}</>;
}

export function TestResults({ grade }: { grade: GradeResult }) {
  const passed = grade.results.filter((r) => r.passed).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        <span className={`font-medium ${grade.passed ? 'text-ok' : 'text-ink'}`}>
          {passed} of {grade.results.length} tests pass
        </span>
        {grade.passed ? ' · nice work' : ''}
      </p>
      {grade.bannedUsed.length > 0 && (
        <p className="rounded-lg bg-fix-bg px-3 py-2 text-sm text-fix">
          This uses {grade.bannedUsed.join(', ')}, which class hasn’t covered. The exam only allows what was taught, so let’s
          solve it without that.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {grade.results.map((r) => (
          <li key={r.name} className="py-2.5 first:pt-0">
            <div className="flex items-center gap-2 text-sm">
              {r.passed ? (
                <CircleCheck className="size-4 shrink-0 text-ok" strokeWidth={1.75} aria-label="passed" />
              ) : (
                <CircleX className="size-4 shrink-0 text-err" strokeWidth={1.75} aria-label="failed" />
              )}
              <span className={r.passed ? 'text-ink-2' : 'font-medium text-ink'}>{r.name}</span>
              {r.hidden && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-ink-3">
                  <EyeOff className="size-3.5" strokeWidth={1.75} /> hidden test
                </span>
              )}
            </div>
            {!r.passed && (r.expected != null || r.got != null) && (
              <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                {(
                  [
                    ['Expected', r.expected ?? ''],
                    ['Your output', r.got ?? ''],
                  ] as const
                ).map(([label, text]) => (
                  <div key={label} className="min-w-0">
                    <p className="mb-1 text-xs text-ink-3">{label}</p>
                    <pre className="overflow-x-auto rounded-md bg-surface-2 px-2.5 py-2 font-code text-[13px] leading-relaxed whitespace-pre">
                      {text ? <Visible text={text} /> : <span className="font-ui text-ink-3">{label === 'Your output' ? 'Nothing printed' : '—'}</span>}
                    </pre>
                  </div>
                ))}
              </div>
            )}
            {r.error && <p className="mt-1.5 pl-6 font-code text-[13px] break-words text-err">{r.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ConsoleProps {
  run?: RunResult;
  grade?: GradeResult;
  programInput: string;
  onProgramInputChange: (v: string) => void;
  running?: boolean;
  /** The program input box only matters when he is writing code that calls input(). */
  showInput?: boolean;
}

export function Console({ run, grade, programInput, onProgramInputChange, running, showInput = true }: ConsoleProps) {
  const [tab, setTab] = useState<'output' | 'tests'>(grade ? 'tests' : 'output');
  const activeTab = grade ? tab : 'output';
  return (
    <section aria-label="Console" className="flex min-h-0 flex-col">
      <div role="tablist" className="flex items-center gap-1 border-b border-line px-3">
        {(
          [
            ['output', 'Output'],
            ['tests', 'Tests'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            disabled={id === 'tests' && !grade}
            onClick={() => setTab(id)}
            className={`press -mb-px border-b-2 px-2.5 py-2.5 text-sm font-medium ${
              activeTab === id ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2 disabled:hover:text-ink-3'
            }`}
          >
            {label}
          </button>
        ))}
        {run && !running && <span className="tnum ml-auto text-xs text-ink-3">ran in {run.ms} ms</span>}
      </div>
      <div className={`grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0 ${showInput ? 'md:grid-cols-[minmax(0,1fr)_14rem]' : ''}`}>
        <div className="min-h-[7rem] min-w-0 overflow-auto p-3" role="tabpanel">
          {activeTab === 'tests' && grade ? (
            <TestResults grade={grade} />
          ) : running ? (
            <p className="text-sm text-ink-3">Running…</p>
          ) : run ? (
            <pre className="font-code text-[13.5px] leading-relaxed whitespace-pre-wrap">
              {run.stdout}
              {run.stderr && <span className="text-err">{run.stderr}</span>}
              {run.timedOut && (
                <span className="font-ui text-sm text-fix">
                  {'\n'}This kept running for over 3 seconds, so it was stopped. Look for a loop that never ends.
                </span>
              )}
              {run.error && !run.timedOut && (
                <span className="block pt-1 text-err">
                  {run.error.type}: {run.error.message}
                  {run.error.line ? ` (line ${run.error.line})` : ''}
                </span>
              )}
              {run.error?.friendly && !run.timedOut && <span className="block pt-2 font-ui text-sm text-ink">{run.error.friendly}</span>}
              {!run.stdout && !run.error && !run.timedOut && <span className="font-ui text-sm text-ink-3">The program ran but printed nothing.</span>}
            </pre>
          ) : (
            <p className="max-w-[40ch] text-sm text-ink-3">
              Press Run to see what your program prints. Anything it prints shows up here.
            </p>
          )}
        </div>
        {showInput && (
        <label className="flex flex-col gap-1.5 border-t border-line p-3 md:border-t-0 md:border-l">
          <span className="text-xs font-medium text-ink-2">Program input</span>
          <textarea
            value={programInput}
            onChange={(e) => onProgramInputChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'One value per line,\nlike zyBooks'}
            className="min-h-[4.5rem] flex-1 resize-none rounded-md border border-line bg-code-bg px-2.5 py-2 font-code text-[13.5px] leading-relaxed placeholder:font-ui placeholder:text-ink-3 focus-visible:border-accent"
          />
        </label>
        )}
      </div>
    </section>
  );
}
