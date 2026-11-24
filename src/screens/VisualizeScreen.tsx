// Visualize: paste or write any program and watch it run one step at a time,
// with every frame, variable, and object drawn (and arrows for references).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Eye, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Concept, VizResult } from '../types';
import { TopBar } from '../ui/TopBar';
import { Button } from '../ui/primitives';
import { Splitter, usePanelLayout } from '../ui/Splitter';
import { CodeEditor } from '../ui/CodeEditor';
import { VizDiagram, describeStep } from '../ui/VizDiagram';
import { runFilesFor } from '../loop/engine';

export interface VizInit {
  code: string;
  files?: Record<string, string>;
  stdin?: string;
  /** Where it came from, shown as the starting point. */
  from?: string;
}

const KEY = 'py-tutor.viz';
export const DEFAULT_VIZ: VizInit = {
  code: `scores = {"Ana": 90}
scores["Ben"] = 85

def average(d):
    total = 0
    for name in d:
        total += d[name]
    return total / len(d)

avg = average(scores)
print("Average:", avg)
`,
};

function load(): VizInit | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VizInit) : null;
  } catch {
    return null;
  }
}
function save(v: VizInit) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: fine */
  }
}

// Tiny Python highlighter for the read-only stepping view.
const TOKEN = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+(?:\.\d+)?)\b|\b(def|class|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|import|from|as|with|try|except|finally|pass|break|continue|del|lambda|global|raise)\b|\b(self)\b|\b([A-Za-z_]\w*)(?=\()/g;
function highlight(line: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index! > last) out.push(line.slice(last, m.index));
    const [txt, com, str, num, kw, self] = m;
    const c = com ? 'var(--syn-comment)' : str ? 'var(--syn-string)' : num ? 'var(--syn-number)' : kw || self ? 'var(--syn-keyword)' : 'var(--syn-func)';
    out.push(<span key={m.index} style={{ color: c }}>{txt}</span>);
    last = m.index! + txt.length;
  }
  out.push(line.slice(last));
  return out;
}

function CodeListing({ code, line, prevLine }: { code: string; line: number | null; prevLine: number | null }) {
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <ol className="py-3 font-code text-[0.875rem] leading-[1.75]" aria-label="Program">
      {lines.map((t, i) => {
        const n = i + 1;
        const next = n === line;
        const just = n === prevLine && !next;
        return (
          <li
            key={i}
            ref={next ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
            className={`flex pr-4 ${next ? 'bg-accent/12' : just ? 'bg-ok/[0.07]' : ''}`}
            aria-current={next ? 'step' : undefined}
          >
            <span className="w-7 shrink-0 text-center" aria-hidden="true">
              {next ? <span className="text-accent">➜</span> : just ? <span className="text-ok/80">➜</span> : null}
            </span>
            <span className="w-7 shrink-0 pr-3 text-right text-ink-3 select-none">{n}</span>
            <span className="whitespace-pre-wrap text-[var(--syn-name)]">{highlight(t)}{'​'}</span>
            {next && <span className="sr-only"> (next line to run)</span>}
            {just && <span className="sr-only"> (line that just ran)</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function VisualizeScreen({
  init,
  concepts,
  visualize,
  onBack,
  backLabel = 'Home',
}: {
  init?: VizInit;
  concepts: Concept[];
  visualize: (code: string, stdin: string[], files: Record<string, string>) => Promise<VizResult>;
  onBack: () => void;
  backLabel?: string;
}) {
  const start = init ?? load() ?? DEFAULT_VIZ;
  const [code, setCode] = useState(start.code);
  const [stdin, setStdin] = useState(start.stdin ?? '');
  const [files, setFiles] = useState<[string, string][]>(Object.entries(start.files ?? {}));
  const [res, setRes] = useState<VizResult | null>(null);
  const [ran, setRan] = useState('');
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => save({ code, stdin, files: Object.fromEntries(files) }), [code, stdin, files]);

  const examples = useMemo(
    () =>
      concepts.flatMap((c) =>
        c.lessons.map((l, k) => ({
          id: `${c.id}-${k}`,
          label: `${c.title.replace(' and objects', '')}: ${l.title}`,
          code: l.example,
          files: runFilesFor(l) ?? {},
        })),
      ),
    [concepts],
  );

  const go = async () => {
    setBusy(true);
    const r = await visualize(code, stdin === '' ? [] : stdin.split('\n'), Object.fromEntries(files.filter(([n]) => n.trim())));
    setBusy(false);
    setRan(code);
    setRes(r);
    setI(0);
  };

  const steps = res?.steps ?? [];
  const stepping = !!res && steps.length > 0;
  const step = steps[i];
  const move = useCallback((d: number) => setI((n) => Math.max(0, Math.min(steps.length - 1, n + d))), [steps.length]);
  useEffect(() => {
    if (!stepping) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepping, move]);

  const btn = 'press grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-35';

  const mainRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = usePanelLayout('visualize');
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:min-h-0">
      <header>
        <TopBar
          crumbs={['Visualize']}
          onHome={onBack}
          right={
            <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="size-4" strokeWidth={2} />} aria-label={`Back to ${backLabel.toLowerCase()}`}>
              <span className="hidden sm:inline">{backLabel}</span>
            </Button>
          }
        />
      </header>

      <main
        ref={mainRef}
        // On a laptop, drag the divider to resize the two panels; the swap button moves the code to the other side.
        style={{ ['--lw' as string]: layout.lw ? `${layout.lw}px` : undefined }}
        className={`grid min-w-0 flex-1 grid-cols-1 md:min-h-0 ${
          layout.swap ? 'md:grid-cols-[minmax(0,1fr)_var(--lw,minmax(20rem,32rem))]' : 'md:grid-cols-[var(--lw,minmax(20rem,32rem))_minmax(0,1fr)]'
        }`}
      >
        {/* the code */}
        <section className={`flex min-h-0 min-w-0 flex-col border-b border-line bg-surface md:border-b-0 ${layout.swap ? 'md:order-2 md:border-l' : 'md:border-r'}`} aria-label="Code">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
            <p className="text-sm font-medium text-ink-2">{stepping ? 'Running' : 'Write or paste any Python'}</p>
            <button
              type="button"
              onClick={() => setLayout({ swap: !layout.swap })}
              aria-label={layout.swap ? 'Move the code to the left side' : 'Move the code to the right side'}
              title={layout.swap ? 'Move the code to the left side' : 'Move the code to the right side'}
              className="press hidden size-7 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink md:grid"
            >
              <ArrowLeftRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              {stepping ? (
                <Button size="sm" variant="secondary" onClick={() => setRes(null)} icon={<Pencil className="size-3.5" strokeWidth={2} />}>
                  Edit code
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => void go()} loading={busy} icon={<Eye className="size-4" strokeWidth={1.75} />}>
                  Visualize
                </Button>
              )}
            </div>
          </div>

          {stepping ? (
            <>
              <div className="min-h-[12rem] flex-1 overflow-auto bg-[var(--code-bg)] md:min-h-0">
                <CodeListing code={ran} line={step.line} prevLine={step.prevLine} />
              </div>
              <div className="border-t border-line px-3 py-2">
                <div className="flex items-center gap-1">
                  <button className={btn} onClick={() => setI(0)} disabled={i === 0} aria-label="First step"><ChevronFirst className="size-4" strokeWidth={2} /></button>
                  <button className={btn} onClick={() => move(-1)} disabled={i === 0} aria-label="Back one step"><ChevronLeft className="size-4" strokeWidth={2} /></button>
                  <input
                    type="range"
                    min={0}
                    max={steps.length - 1}
                    value={i}
                    onChange={(e) => setI(Number(e.target.value))}
                    className="mx-2 h-9 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
                    aria-label="Step"
                  />
                  <button className={btn} onClick={() => move(1)} disabled={i === steps.length - 1} aria-label="Forward one step"><ChevronRight className="size-4" strokeWidth={2} /></button>
                  <button className={btn} onClick={() => setI(steps.length - 1)} disabled={i === steps.length - 1} aria-label="Last step"><ChevronLast className="size-4" strokeWidth={2} /></button>
                </div>
                <p className="tnum mt-1 text-sm text-ink-3" aria-live="polite">
                  Step {i + 1} of {steps.length}
                  {res.stopped && ` (stopped after ${res.maxSteps} steps: a loop may never end)`}
                </p>
                <p className="mt-1 min-h-[2.75rem] text-[0.9375rem] leading-snug text-ink">{describeStep(step, i)}</p>
                {step.event === 'error' && res?.error?.friendly && <p className="mt-1 text-sm text-ink-2">{res.error.friendly}</p>}
                <p className="mt-1 flex gap-4 text-xs text-ink-3">
                  <span><span className="text-ok/80">➜</span> line that just ran</span>
                  <span><span className="text-accent">➜</span> next line to run</span>
                </p>
              </div>
              <div className="border-t border-line bg-paper px-4 py-3">
                <p className="mb-1 text-xs font-medium tracking-wide text-ink-3 uppercase">Printed output</p>
                <pre className="max-h-40 min-h-[2.5rem] overflow-auto font-code text-[0.8125rem] whitespace-pre-wrap text-ink">{step.out || <span className="text-ink-3">{step.event === 'done' || step.event === 'error' ? 'Nothing was printed.' : 'Nothing printed yet.'}</span>}</pre>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                <label htmlFor="viz-example" className="text-sm text-ink-3">Load an example</label>
                <select
                  id="viz-example"
                  className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm text-ink"
                  value=""
                  onChange={(e) => {
                    const ex = examples.find((x) => x.id === e.target.value);
                    if (!ex) return;
                    setCode(ex.code);
                    setFiles(Object.entries(ex.files));
                    setStdin('');
                  }}
                >
                  <option value="">Pick one from your lessons…</option>
                  {/* grouped by topic: 63 lessons in one flat list was a long scroll */}
                  {concepts.map((c) => (
                    <optgroup key={c.id} label={c.title.replace(' and objects', '')}>
                      {examples
                        .filter((x) => x.id.startsWith(`${c.id}-`) && /^\d+$/.test(x.id.slice(c.id.length + 1)))
                        .map((x) => (
                          <option key={x.id} value={x.id}>{x.label.slice(x.label.indexOf(': ') + 2)}</option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="min-h-[14rem] flex-1 overflow-auto md:min-h-0">
                <CodeEditor value={code} onChange={setCode} label="Code to visualize" />
              </div>
              <div className="space-y-3 border-t border-line bg-paper px-4 py-3">
                <div>
                  <label htmlFor="viz-input" className="mb-1 block text-xs font-medium tracking-wide text-ink-3 uppercase">Program input</label>
                  <textarea
                    id="viz-input"
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    rows={2}
                    placeholder="One line per input() call"
                    className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 font-code text-sm text-ink placeholder:text-ink-3"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center">
                    <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">Files your program can open</p>
                    <button
                      className="press ml-auto inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
                      onClick={() => setFiles((f) => [...f, [`file${f.length + 1}.txt`, '']])}
                    >
                      <Plus className="size-3.5" strokeWidth={2} /> Add a file
                    </button>
                  </div>
                  {files.length === 0 && <p className="text-sm text-ink-3">None. Add one to try open() and read().</p>}
                  <div className="space-y-2">
                    {files.map(([name, content], k) => (
                      <div key={k} className="rounded-md border border-line bg-surface">
                        <div className="flex items-center gap-2 border-b border-line px-2 py-1">
                          <FileText className="size-3.5 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                          <input
                            value={name}
                            onChange={(e) => setFiles((f) => f.map((x, j) => (j === k ? [e.target.value, x[1]] : x)))}
                            aria-label="File name"
                            className="min-w-0 flex-1 bg-transparent font-code text-sm text-ink"
                          />
                          <button className="press rounded p-1 text-ink-3 hover:text-err" onClick={() => setFiles((f) => f.filter((_, j) => j !== k))} aria-label={`Remove ${name}`}>
                            <Trash2 className="size-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                        <textarea
                          value={content}
                          onChange={(e) => setFiles((f) => f.map((x, j) => (j === k ? [x[0], e.target.value] : x)))}
                          rows={3}
                          aria-label={`Contents of ${name}`}
                          className="w-full resize-y bg-transparent px-2.5 py-1.5 font-code text-sm text-ink"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* right: frames and objects */}
        <section className={`relative min-h-[24rem] min-w-0 bg-paper md:min-h-0 ${layout.swap ? 'md:order-1' : ''}`} aria-label="What Python is holding">
          <Splitter
            axis="x"
            label="Resize the code and diagram panels"
            style={layout.swap ? { right: -5 } : { left: -5 }}
            onDrag={(x) => {
              const r = mainRef.current?.getBoundingClientRect();
              if (r) setLayout({ lw: Math.round(Math.max(260, Math.min(r.width - 320, layout.swap ? r.right - x : x - r.left))) });
            }}
            onNudge={(d) => {
              const r = mainRef.current?.getBoundingClientRect();
              if (r) setLayout({ lw: Math.round(Math.max(260, Math.min(r.width - 320, (layout.lw ?? Math.min(512, r.width * 0.4)) + (layout.swap ? -d : d)))) });
            }}
            onReset={() => setLayout({ lw: undefined })}
          />
          {res?.error && !stepping ? (
            <div className="m-4 rounded-lg border border-err/40 bg-err-bg p-4">
              <p className="font-medium text-err">{res.error.type}{res.error.line ? ` on line ${res.error.line}` : ''}: {res.error.message}</p>
              {res.error.friendly && <p className="mt-1 text-ink-2">{res.error.friendly}</p>}
            </div>
          ) : stepping ? (
            <VizDiagram step={step} prev={i > 0 ? steps[i - 1] : undefined} />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm">
                <Eye className="mx-auto mb-3 size-8 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-lg font-medium text-ink">See what your code does</p>
                <p className="mt-1 text-ink-2">
                  Press Visualize, then step through it. You'll see every variable, every list, dict, and object, and an arrow wherever a variable refers to one.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
