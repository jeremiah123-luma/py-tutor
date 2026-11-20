import { useState } from 'react';
import { ArrowUp, AudioLines, BookOpen, Boxes, FileText, Home, ListChecks, Play, Timer } from 'lucide-react';
import type { Concept, ConceptId, Mode, Progress } from '../types';
import { Button, ModeToggle } from '../ui/primitives';
import { FinalPill, TopBar } from '../ui/TopBar';

export interface HomeScreenProps {
  concepts: Concept[];
  progress: Progress;
  /** Ordered sub-skill names per concept, for the mastery chart. */
  subskills: Record<string, string[]>;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onContinue: () => void;
  onStart: (id: ConceptId) => void;
  onDrill?: () => void;
  /** Ask the tutor something from the home prompt; opens the current lesson with the question. */
  onAsk?: (text: string) => void;
  /** Mic button: switch to talk mode and start. */
  onTalkNow?: () => void;
  continueLabel?: string;
}

const ICONS: Record<string, typeof BookOpen> = { dictionaries: BookOpen, files: FileText, classes: Boxes };
const TAG: Record<string, string> = { dictionaries: 'text-tag-violet', files: 'text-tag-blue', classes: 'text-tag-pink' };

function MasteryChart({ names, state }: { names: string[]; state: Progress['concepts'][ConceptId] }) {
  return (
    <div className="flex h-24 flex-1 items-end gap-1.5 rounded-md bg-surface-2 px-3 pt-3 pb-2" aria-hidden="true">
      {names.map((n) => {
        const s = state[n];
        const h = s?.mastered ? '100%' : s && s.attempts > 0 ? '45%' : '0';
        return (
          <div key={n} className="flex h-full flex-1 flex-col justify-end">
            {h === '0' ? (
              <span className="h-[3px] w-full rounded-full bg-line-strong" />
            ) : (
              <span className={`w-full rounded-sm ${s?.mastered ? 'bg-accent' : 'bg-accent/45'}`} style={{ height: h }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HomeScreen(p: HomeScreenProps) {
  const [ask, setAsk] = useState('');
  const mastered = (id: ConceptId) => Object.values(p.progress.concepts[id] ?? {}).filter((s) => s.mastered).length;
  const started = Object.values(p.progress.concepts).some((c) => Object.keys(c).length > 0);
  const nextUp = (c: Concept) => c.lessons.find((l) => !p.progress.concepts[c.id]?.[l.subskill]?.mastered) ?? c.lessons[0];

  const submit = () => {
    const t = ask.trim();
    if (!t || !p.onAsk) return;
    p.onAsk(t);
    setAsk('');
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur-md">
        <TopBar crumbs={['Home']} right={<FinalPill />} />
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-line px-2 md:px-3">
          <span aria-current="page" className="tab flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] font-medium">
            <Home className="size-4" strokeWidth={1.75} aria-hidden="true" /> Home
          </span>
          {p.concepts.map((c) => {
            const Icon = ICONS[c.id] ?? BookOpen;
            return (
              <button key={c.id} onClick={() => p.onStart(c.id)} className="tab press flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] text-ink-2 hover:text-ink">
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" /> {c.title.replace(' and objects', '')}
              </button>
            );
          })}
          <button onClick={p.onDrill} disabled={!p.onDrill} className="tab press flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] text-ink-2 hover:text-ink">
            <Timer className="size-4" strokeWidth={1.75} aria-hidden="true" /> Exam drill
          </button>
        </nav>
      </header>

      <section aria-labelledby="hero" className="aurora px-5 pt-16 pb-28 text-center md:pt-24 md:pb-32">
        <h1 id="hero" className="font-voice text-[2.75rem] leading-[1.02] md:text-[4.25rem]">
          {started ? 'Back at it.' : 'Ace the final.'}
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-base text-[#3a3340] md:text-md">
          Dictionaries, files, and classes, taught the way your zyBook does. Ask a question, or pick up where you left off.
        </p>
      </section>

      <main className="mx-auto -mt-16 max-w-5xl px-4 pb-20 md:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="relative z-10 rounded-xl border border-line-strong bg-surface shadow-soft"
        >
          <div className="flex items-start gap-3 p-3 pl-4">
            <label htmlFor="ask" className="sr-only">
              Ask the tutor
            </label>
            <textarea
              id="ask"
              rows={1}
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask the tutor anything…"
              className="min-h-11 flex-1 resize-none bg-transparent py-2.5 text-md placeholder:text-ink-3 focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={p.onTalkNow}
              aria-label="Talk instead"
              className="press grid size-11 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <AudioLines className="size-5" strokeWidth={1.75} />
            </button>
            <button
              type="submit"
              aria-label="Ask"
              disabled={!ask.trim()}
              className="press grid size-11 shrink-0 place-items-center rounded-md bg-ink text-paper disabled:bg-surface-2 disabled:text-ink-3"
            >
              <ArrowUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
            <ModeToggle mode={p.mode} onChange={p.onModeChange} />
            <p className="text-sm text-ink-3 max-sm:hidden">
              {p.mode === 'talk' ? 'Hands-free. Phone in a mount, screen on.' : 'You write every line yourself.'}
            </p>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 text-sm text-ink-2">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" /> Tutor ready
            </span>
          </div>
        </form>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Pick up a lesson">
          <li>
            <button onClick={p.onContinue} className="press group flex h-full w-full items-stretch overflow-hidden rounded-lg border border-line bg-surface text-left hover:border-line-strong hover:bg-surface-2">
              <span className="grid w-16 shrink-0 place-items-center bg-ink text-paper" aria-hidden="true">
                <Play className="size-5" strokeWidth={2} />
              </span>
              <span className="p-3.5 text-[0.9375rem] leading-snug">
                <span className="font-semibold">{started ? 'Continue:' : 'Start:'}</span>{' '}
                <span className="text-ink-2">{(p.continueLabel ?? '').replace(/^(Start|Continue): /, '')}</span>
              </span>
            </button>
          </li>
          {p.concepts.map((c) => {
            const Icon = ICONS[c.id] ?? BookOpen;
            return (
              <li key={c.id}>
                <button onClick={() => p.onStart(c.id)} className="press flex h-full w-full items-stretch overflow-hidden rounded-lg border border-line bg-surface text-left hover:border-line-strong hover:bg-surface-2">
                  <span className={`grid w-16 shrink-0 place-items-center bg-surface-2 ${TAG[c.id] ?? 'text-ink'}`} aria-hidden="true">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="p-3.5 text-[0.9375rem] leading-snug">
                    <span className="font-semibold">{c.title.replace(' and objects', '')}</span>{' '}
                    <span className="text-ink-2">· {nextUp(c).title.charAt(0).toLowerCase() + nextUp(c).title.slice(1)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <h2 className="mt-14 text-xl">Your progress</h2>
        <p className="mt-1 text-[0.9375rem] text-ink-2">A skill counts as mastered after two clean passes in a row.</p>
        <div className="mt-5 grid overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-2 lg:grid-cols-4">
          {p.concepts.map((c) => {
            const names = p.subskills[c.id] ?? [];
            return (
              <div key={c.id} className="flex flex-col gap-3 border-line p-5 max-lg:border-b md:odd:border-r lg:border-r">
                <p className="text-sm text-ink-2">{c.title.replace(' and objects', '')} mastered</p>
                <p className="tnum text-2xl font-semibold tracking-[-0.03em]">
                  {mastered(c.id)}
                  <span className="text-ink-3"> / {names.length}</span>
                </p>
                <MasteryChart names={names} state={p.progress.concepts[c.id] ?? {}} />
                <div>
                  <Button size="sm" onClick={() => p.onStart(c.id)}>
                    Practice {c.title.replace(' and objects', '').toLowerCase()}
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-col gap-3 p-5">
            <p className="text-sm text-ink-2">Exam drill</p>
            <p className="tnum text-2xl font-semibold tracking-[-0.03em]">
              18<span className="text-ink-3"> questions</span>
            </p>
            <div className="flex h-24 flex-col justify-center gap-2 rounded-md bg-surface-2 px-3 text-sm text-ink-2">
              <p>16 short questions and 2 coding problems, timed. No tutor, no hints.</p>
            </div>
            <div>
              <Button size="sm" variant="primary" onClick={p.onDrill} disabled={!p.onDrill} icon={<ListChecks className="size-4" strokeWidth={2} />}>
                Start the drill
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
