import { ArrowRight, ChevronRight, Timer } from 'lucide-react';
import type { Concept, ConceptId, Mode, Progress } from '../types';
import { Button, ModeToggle } from '../ui/primitives';

export interface HomeScreenProps {
  concepts: Concept[];
  progress: Progress;
  /** Ordered sub-skill names per concept, for the mastery bar. */
  subskills: Record<string, string[]>;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onContinue: () => void;
  onStart: (id: ConceptId) => void;
  onDrill?: () => void;
  continueLabel?: string;
}

function MasteryBar({ names, state }: { names: string[]; state: Progress['concepts'][ConceptId] }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {names.map((n) => {
        const s = state[n];
        return (
          <span
            key={n}
            className={`h-1.5 w-5 rounded-full ${s?.mastered ? 'bg-accent' : s && s.attempts > 0 ? 'bg-[color-mix(in_oklab,var(--accent)_35%,var(--line))]' : 'bg-line'}`}
          />
        );
      })}
    </div>
  );
}

export function HomeScreen(p: HomeScreenProps) {
  const mastered = (id: ConceptId) => Object.values(p.progress.concepts[id] ?? {}).filter((s) => s.mastered).length;
  const allDone = p.concepts.every((c) => mastered(c.id) >= (p.subskills[c.id]?.length ?? Infinity));
  const started = Object.values(p.progress.concepts).some((c) => Object.keys(c).length > 0);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center px-5 pt-5 md:px-8 md:pt-8">
        <p className="font-voice text-md font-semibold tracking-[-0.01em]">
          py<span className="bg-[linear-gradient(transparent_55%,var(--hl)_55%)] px-0.5">tutor</span>
        </p>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col px-5 pb-16 md:px-8">
        <section aria-labelledby="welcome" className="pt-12 pb-10 md:pt-20 md:pb-14">
          <h1 id="welcome" className="font-voice text-2xl leading-tight font-medium md:text-3xl">
            {started ? 'Welcome back.' : 'Let’s learn some Python.'}
          </h1>
          <p className="mt-3 max-w-[52ch] text-md leading-normal text-ink-2">
            Three topics stand between you and the final: dictionaries, files, and classes. One small idea at a time, and
            you write every line yourself.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button size="lg" variant="primary" onClick={p.onContinue} iconEnd={<ArrowRight className="size-5" strokeWidth={2} />} className="w-full justify-between sm:order-2 sm:w-auto sm:justify-center">
              {p.continueLabel ?? (started ? 'Continue' : 'Start with dictionaries')}
            </Button>
            <div className="sm:order-1">
              <ModeToggle mode={p.mode} onChange={p.onModeChange} size="lg" />
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-3">
            {p.mode === 'talk'
              ? 'Talk keeps your hands free, so you can learn while driving. The phone stays on in a mount.'
              : 'Type at a desk. Writing the code yourself is how it sticks.'}
          </p>
        </section>

        <section aria-labelledby="topics">
          <h2 id="topics" className="pb-3 text-sm font-medium text-ink-2">
            Topics
          </h2>
          <ul className="border-t border-line">
            {p.concepts.map((c) => {
              const names = p.subskills[c.id] ?? [];
              const m = mastered(c.id);
              return (
                <li key={c.id} className="border-b border-line">
                  <button
                    onClick={() => p.onStart(c.id)}
                    className="press group flex w-full items-center gap-4 py-5 text-left hover:bg-surface-2/60 md:-mx-3 md:w-[calc(100%+1.5rem)] md:rounded-lg md:px-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-md font-semibold tracking-[-0.01em]">{c.title}</p>
                      <p className="mt-0.5 text-[0.9375rem] text-ink-2">{c.blurb}</p>
                    </div>
                    <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
                      <MasteryBar names={names} state={p.progress.concepts[c.id] ?? {}} />
                      <p className="tnum text-sm text-ink-3">
                        {m} of {names.length} mastered
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-sm text-ink-3 sm:hidden">
                      {m}/{names.length}
                    </p>
                    <ChevronRight className="size-5 shrink-0 text-ink-3 transition-transform duration-[160ms] group-hover:translate-x-0.5 group-hover:text-ink-2" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
            <li className="border-b border-line">
              <button
                onClick={p.onDrill}
                disabled={!p.onDrill}
                className="press flex w-full items-center gap-4 py-5 text-left disabled:cursor-default md:-mx-3 md:w-[calc(100%+1.5rem)] md:px-3"
              >
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-2 text-md font-semibold tracking-[-0.01em] ${allDone ? '' : 'text-ink-2'}`}>
                    <Timer className="size-4.5" strokeWidth={1.75} aria-hidden="true" /> Exam drill
                  </p>
                  <p className="mt-0.5 text-[0.9375rem] text-ink-3">
                    16 short questions and 2 coding problems, timed like the midterms.
                    {!allDone && ' Best once all three topics are done, but you can try it anytime.'}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
