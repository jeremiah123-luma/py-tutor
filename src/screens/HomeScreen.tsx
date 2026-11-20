import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUp, AudioLines, BookOpen, Boxes, CalendarClock, FileText, Home, Layers, Play, Sparkles, Timer } from 'lucide-react';
import type { Concept, ConceptId, Mode, Progress } from '../types';
import { ModeToggle } from '../ui/primitives';
import { FinalPill, TopBar, daysToFinal } from '../ui/TopBar';
import { Aurora } from '../ui/Aurora';

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
const TINT: Record<string, string> = { dictionaries: 'text-tag-violet', files: 'text-tag-blue', classes: 'text-tag-pink' };
const short = (c: Concept) => c.title.replace(' and objects', '');
const EASE = [0.16, 1, 0.3, 1] as const;

function MasteryChart({ names, state, delay }: { names: string[]; state: Progress['concepts'][ConceptId]; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-16 items-end gap-1" aria-hidden="true">
      {names.map((n, i) => {
        const s = state[n];
        const h = s?.mastered ? 1 : s && s.attempts > 0 ? 0.45 : 0;
        return (
          <div key={n} className="flex h-full flex-1 flex-col justify-end">
            {h === 0 ? (
              <motion.span
                className="h-[3px] w-full origin-left rounded-full bg-line-strong"
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: delay + i * 0.05, ease: EASE }}
              />
            ) : (
              <motion.span
                className={`w-full origin-bottom rounded-[3px] ${s?.mastered ? 'bg-accent' : 'bg-accent/40'}`}
                style={{ height: `${h * 100}%` }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.7, delay: delay + i * 0.06, ease: EASE }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HomeScreen(p: HomeScreenProps) {
  const [ask, setAsk] = useState('');
  const reduce = useReducedMotion();
  const mastered = (id: ConceptId) => Object.values(p.progress.concepts[id] ?? {}).filter((s) => s.mastered).length;
  const started = Object.values(p.progress.concepts).some((c) => Object.keys(c).length > 0);
  const nextUp = (c: Concept) => c.lessons.find((l) => !p.progress.concepts[c.id]?.[l.subskill]?.mastered) ?? c.lessons[0];
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const headline = started ? 'Back at it.' : 'Ace the final.';

  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay: 0.35 + i * 0.07, ease: EASE },
        };

  const submit = () => {
    const t = ask.trim();
    if (!t || !p.onAsk) return;
    p.onAsk(t);
    setAsk('');
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-paper/80 backdrop-blur-xl">
        <TopBar crumbs={['Home']} right={<FinalPill />} />
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-line px-2 md:px-3">
          <span aria-current="page" className="tab flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] font-medium">
            <Home className="size-4" strokeWidth={1.75} aria-hidden="true" /> Home
          </span>
          {p.concepts.map((c) => {
            const Icon = ICONS[c.id] ?? BookOpen;
            return (
              <button key={c.id} onClick={() => p.onStart(c.id)} className="tab press flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] text-ink-2 hover:text-ink">
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" /> {short(c)}
              </button>
            );
          })}
          <button onClick={p.onDrill} disabled={!p.onDrill} className="tab press flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] text-ink-2 hover:text-ink">
            <Timer className="size-4" strokeWidth={1.75} aria-hidden="true" /> Exam drill
          </button>
        </nav>
      </header>

      <Aurora className="px-5 pt-14 pb-32 text-center md:pt-20 md:pb-36">
        <ul className="mb-7 flex flex-wrap justify-center gap-2" aria-label="At a glance">
          {[
            { icon: CalendarClock, text: `${daysToFinal()} days to the final` },
            { icon: Layers, text: `${p.concepts.reduce((n, c) => n + c.lessons.length, 0)} lessons` },
            { icon: Sparkles, text: 'Built from your zyBook' },
          ].map(({ icon: Icon, text }, i) => (
            <motion.li
              key={text}
              initial={reduce ? false : { opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.05 + i * 0.08, ease: EASE }}
            >
              <span
                className="glass inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-[#1d1530]"
                style={reduce ? undefined : { animation: `float-y ${5 + i}s ease-in-out ${i * 0.7}s infinite` }}
              >
                <Icon className="size-4 opacity-70" strokeWidth={2} aria-hidden="true" />
                {text}
              </span>
            </motion.li>
          ))}
        </ul>
        <h1 className="font-voice text-[2.75rem] leading-[1.02] md:text-[4.5rem]" aria-label={headline}>
          {headline.split(' ').map((w, i) => (
            <motion.span
              key={`${w}-${i}`}
              aria-hidden="true"
              className="inline-block"
              initial={reduce ? false : { opacity: 0, y: 28, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, delay: 0.08 + i * 0.09, ease: EASE }}
            >
              {w}
              {i < headline.split(' ').length - 1 ? ' ' : ''}
            </motion.span>
          ))}
        </h1>
        <motion.p
          className="mx-auto mt-4 max-w-[38ch] text-base text-[#3a3340] md:text-md"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: EASE }}
        >
          Dictionaries, files, and classes, taught the way your zyBook does.
        </motion.p>
      </Aurora>

      <main className="mx-auto -mt-20 max-w-4xl px-4 pb-24 md:px-6">
        <motion.form
          {...(reduce ? {} : { initial: { opacity: 0, y: 24, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.7, delay: 0.25, ease: EASE } })}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="glow-ring relative z-10 rounded-2xl bg-surface shadow-[0_24px_60px_-12px_rgb(0_0_0/0.6)]"
        >
          <div className="flex items-center gap-2 p-2.5 pl-5">
            <label htmlFor="ask" className="sr-only">
              Ask the tutor
            </label>
            <input
              id="ask"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Ask the tutor anything…"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-md placeholder:text-ink-3 focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={p.onTalkNow}
              aria-label="Talk instead"
              className="press grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <AudioLines className="size-5" strokeWidth={1.75} />
            </button>
            <motion.button
              type="submit"
              aria-label="Ask"
              disabled={!ask.trim()}
              animate={{ scale: ask.trim() ? 1 : 0.92 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-paper disabled:bg-surface-2 disabled:text-ink-3"
            >
              <ArrowUp className="size-5" strokeWidth={2} />
            </motion.button>
          </div>
          <div className="flex items-center gap-3 border-t border-line/70 px-3 py-2">
            <ModeToggle mode={p.mode} onChange={p.onModeChange} />
            <p className="text-sm text-ink-3 max-sm:hidden">{p.mode === 'talk' ? 'Hands-free, phone in a mount.' : 'You write every line yourself.'}</p>
          </div>
        </motion.form>

        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Pick up a lesson">
          <motion.li {...rise(0)} className="sm:col-span-2">
            <button
              onClick={p.onContinue}
              className="lift press halftone-corner group flex w-full items-center gap-4 rounded-2xl bg-ink p-4 pr-5 text-left text-paper [--ht:rgb(167_139_250/0.55)] hover:shadow-[0_12px_40px_-8px_rgb(167_139_250/0.45)]"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper text-ink" aria-hidden="true">
                <Play className="size-5 translate-x-px" strokeWidth={2} fill="currentColor" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-paper/60">{started ? 'Continue:' : 'Start:'}</span>
                <span className="block truncate text-md font-semibold tracking-[-0.02em]">{(p.continueLabel ?? '').replace(/^(Start|Continue): /, '')}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
            </button>
          </motion.li>
          {p.concepts.map((c, i) => {
            const Icon = ICONS[c.id] ?? BookOpen;
            const names = p.subskills[c.id] ?? [];
            return (
              <motion.li key={c.id} {...rise(i + 1)}>
                <button
                  onClick={() => p.onStart(c.id)}
                  className="lift press halftone-corner group flex h-full w-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 text-left hover:border-line-strong"
                >
                  <span className="flex w-full items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-lg bg-surface-2 ${TINT[c.id] ?? ''}`} aria-hidden="true">
                      <Icon className="size-[18px]" strokeWidth={1.75} />
                    </span>
                    <span className="text-md font-semibold tracking-[-0.02em]">{short(c)}</span>
                    <span className="tnum ml-auto text-sm text-ink-3">
                      {mastered(c.id)}/{names.length}
                    </span>
                  </span>
                  <MasteryChart names={names} state={p.progress.concepts[c.id] ?? {}} delay={0.5 + i * 0.1} />
                  <span className="flex w-full items-center gap-2 text-[0.9375rem] text-ink-2">
                    <span className="truncate">Next: {lower(nextUp(c).title)}</span>
                    <ArrowRight className="ml-auto size-4 shrink-0 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" strokeWidth={2} aria-hidden="true" />
                  </span>
                </button>
              </motion.li>
            );
          })}
          <motion.li {...rise(p.concepts.length + 1)}>
            <button
              onClick={p.onDrill}
              disabled={!p.onDrill}
              className="lift press halftone-corner group flex h-full w-full flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-5 text-left hover:border-line-strong"
            >
              <span className="flex w-full items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-tag-green" aria-hidden="true">
                  <Timer className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="text-md font-semibold tracking-[-0.02em]">Practice exam</span>
              </span>
              <span className="text-[0.9375rem] text-ink-2">18 questions, timed. No tutor, no hints. Just like the real thing.</span>
              <span className="flex items-center gap-2 text-[0.9375rem] font-medium">
                Start it
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          </motion.li>
        </ul>
      </main>
    </div>
  );
}
