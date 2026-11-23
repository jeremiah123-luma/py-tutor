import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ArrowRight, ArrowUp, AudioLines, BookOpen, Boxes, CalendarClock, Check, ChevronDown, FileText, GitBranch, Home, Layers, List, ListChecks, Play, Repeat, RotateCw, Sparkles, SquareFunction, Timer, Type, Variable, Eye } from 'lucide-react';
import { isPerfect } from '../loop/quizScore';
import { FOCUS } from '../curriculum/ids';
import type { Concept, ConceptId, Mode, Progress } from '../types';
import { ModeToggle } from '../ui/primitives';
import { FinalPill, TopBar, daysToFinal } from '../ui/TopBar';
import { Aurora } from '../ui/Aurora';
import { sfx } from '../ui/sfx';
import { homeGreeting } from '../ui/greeting';

export interface HomeScreenProps {
  /** The signed-in person's name, for the greeting. */
  name?: string;
  /** They had progress when they opened the app (says "Welcome back"). */
  returning?: boolean;
  concepts: Concept[];
  progress: Progress;
  /** Ordered sub-skill names per concept, for the mastery chart. */
  subskills: Record<string, string[]>;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onContinue: () => void;
  onStart: (id: ConceptId) => void;
  onDrill?: () => void;
  /** Every Quick check question in one topic, shuffled. */
  onPractice?: (id: ConceptId) => void;
  /** Open the visualizer (step through any program, frames and objects drawn). */
  onVisualize?: () => void;
  /** Ask the tutor something from the home prompt; opens the current lesson with the question. */
  onAsk?: (text: string) => void;
  /** Mic button: switch to talk mode and start. */
  onTalkNow?: () => void;
  continueLabel?: string;
}

const ICONS: Record<string, typeof BookOpen> = {
  dictionaries: BookOpen, files: FileText, classes: Boxes,
  basics: Variable, 'strings-lists': List, branching: GitBranch, 'for-loops': Repeat, functions: SquareFunction, 'str-methods': Type, 'while-loops': RotateCw,
};
const TINT: Record<string, string> = {
  dictionaries: 'text-tag-violet', files: 'text-tag-blue', classes: 'text-tag-pink',
  basics: 'text-tag-green', 'strings-lists': 'text-tag-blue', branching: 'text-tag-violet', 'for-loops': 'text-tag-pink', functions: 'text-tag-green', 'str-methods': 'text-tag-blue', 'while-loops': 'text-tag-violet',
};
const short = (c: Concept) => c.title.replace(' and objects', '');
const EASE = [0.16, 1, 0.3, 1] as const;

function MasteryChart({ names, state, quiz, delay }: { names: string[]; state: Progress['concepts'][ConceptId]; quiz: NonNullable<Progress['quiz']>[ConceptId]; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-[4.75rem] items-end gap-1" aria-hidden="true">
      {names.map((n, i) => {
        const s = state[n];
        const h = s?.mastered ? 1 : s && s.attempts > 0 ? 0.45 : 0;
        const perfect = isPerfect(quiz?.[n]);
        return (
          <div key={n} className="flex h-full flex-1 flex-col justify-end">
            {/* a perfect Quick check: a small check under that lesson's bar */}
            <span className="order-last flex h-3 items-end justify-center">
              {perfect && <Check className="size-3 text-ok" strokeWidth={3} />}
            </span>
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

/**
 * Every topic in one menu: the final's big three first, then the earlier topics, each with how many lessons are
 * mastered. It grows out of its button, the topics slide in one after another, and the arrow turns.
 */
function TopicsMenu({
  concepts,
  mastered,
  total,
  onStart,
}: {
  concepts: Concept[];
  mastered: (id: ConceptId) => number;
  total: (id: ConceptId) => number;
  onStart: (id: ConceptId) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const groups = [
    { label: 'The final’s big three', items: concepts.filter((c) => FOCUS.includes(c.id)) },
    { label: 'Earlier topics', items: concepts.filter((c) => !FOCUS.includes(c.id)) },
  ].filter((g) => g.items.length);
  let n = 0; // running index across both groups, for the stagger
  return (
    <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
      <Menu.Trigger asChild>
        <button className="tab press flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] text-ink-2 outline-none hover:text-ink focus-visible:text-ink data-[state=open]:text-ink">
          <Layers className="size-4" strokeWidth={1.75} aria-hidden="true" /> Topics
          <motion.span className="grid" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduce ? 0 : 0.28, ease: EASE }} aria-hidden="true">
            <ChevronDown className="size-4" strokeWidth={2} />
          </motion.span>
        </button>
      </Menu.Trigger>
      <AnimatePresence>
        {open && (
          <Menu.Portal forceMount>
            <Menu.Content forceMount asChild align="start" sideOffset={6} collisionPadding={12}>
              <motion.div
                className="z-50 max-h-[min(70svh,34rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line-strong bg-[#161616] p-2 text-ink shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] outline-none"
                style={{ transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)' }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.14, ease: 'easeIn' } }}
                transition={{ duration: reduce ? 0 : 0.26, ease: EASE }}
              >
                {groups.map((g, gi) => (
                  <Menu.Group key={g.label}>
                    {gi > 0 && <Menu.Separator className="mx-2 my-1.5 h-px bg-line" />}
                    <Menu.Label className="px-2.5 pt-1.5 pb-1 text-xs font-medium tracking-wide text-ink-3 uppercase">{g.label}</Menu.Label>
                    {g.items.map((c) => {
                      const Icon = ICONS[c.id] ?? BookOpen;
                      const i = n++;
                      const done = mastered(c.id), of = total(c.id);
                      return (
                        <Menu.Item key={c.id} asChild onSelect={() => onStart(c.id)}>
                          <motion.div
                            className="flex h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[0.9375rem] text-ink-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink"
                            initial={reduce ? false : { opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.04 + i * 0.03, ease: EASE }}
                          >
                            <span className={`grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 ${TINT[c.id] ?? ''}`} aria-hidden="true">
                              <Icon className="size-4" strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{short(c)}</span>
                            <span className={`tnum text-sm ${done === of && of > 0 ? 'text-ok' : 'text-ink-3'}`} aria-label={`${done} of ${of} mastered`}>
                              {done}/{of}
                            </span>
                          </motion.div>
                        </Menu.Item>
                      );
                    })}
                  </Menu.Group>
                ))}
              </motion.div>
            </Menu.Content>
          </Menu.Portal>
        )}
      </AnimatePresence>
    </Menu.Root>
  );
}

/** The greeting, kept current: an app left open overnight says good morning when it's opened again. */
function useGreeting(name: string, returning: boolean) {
  const [g, setG] = useState(() => homeGreeting(name, returning));
  useEffect(() => {
    const update = () => setG(homeGreeting(name, returning));
    update();
    const onVis = () => document.visibilityState === 'visible' && update();
    document.addEventListener('visibilitychange', onVis);
    const t = window.setInterval(update, 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(t);
    };
  }, [name, returning]);
  return g;
}

export function HomeScreen(p: HomeScreenProps) {
  const [ask, setAsk] = useState('');
  const reduce = useReducedMotion();
  const perfectQuizzes = (id: ConceptId) => (p.subskills[id] ?? []).filter((s) => isPerfect(p.progress.quiz?.[id]?.[s])).length;
  // counted from the lesson list, so an old save under a renamed lesson can't show 4/3
  const mastered = (id: ConceptId) => (p.subskills[id] ?? []).filter((s) => p.progress.concepts[id]?.[s]?.mastered).length;
  const started = Object.values(p.progress.concepts).some((c) => Object.keys(c).length > 0);
  const nextUp = (c: Concept) => c.lessons.find((l) => !p.progress.concepts[c.id]?.[l.subskill]?.mastered) ?? c.lessons[0];
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const headline = started ? 'Back at it.' : 'Ace the final.';
  const greeting = useGreeting(p.name ?? '', !!p.returning);

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
    sfx.send();
    p.onAsk(t);
    setAsk('');
  };

  const focus = p.concepts.filter((c) => FOCUS.includes(c.id));
  const earlier = p.concepts.filter((c) => !FOCUS.includes(c.id));
  const topicCard = (c: Concept, i: number, compact = false) => {
        const Icon = ICONS[c.id] ?? BookOpen;
        const names = p.subskills[c.id] ?? [];
        return (
          <motion.li key={c.id} {...rise(i + 1)} data-tour={i === 0 && !compact ? 'home-lessons' : undefined} className="lift flex flex-col overflow-hidden rounded-2xl border border-line bg-surface hover:border-line-strong">
            <button
              onClick={() => p.onStart(c.id)}
              className="press ht-host group relative flex w-full flex-1 flex-col gap-4 p-5 text-left"
            >
          <span className="halftone halftone-corner" aria-hidden="true" />
              <span className="flex w-full items-center gap-3">
                <span className={`grid size-9 place-items-center rounded-lg bg-surface-2 ${TINT[c.id] ?? ''}`} aria-hidden="true">
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="text-md font-semibold tracking-[-0.02em]">{short(c)}</span>
                <span className="tnum ml-auto text-sm text-ink-3">
                  {mastered(c.id)}/{names.length}
                </span>
              </span>
              <MasteryChart names={names} state={p.progress.concepts[c.id] ?? {}} quiz={p.progress.quiz?.[c.id]} delay={0.5 + i * 0.1} />
              <span className="flex w-full items-center gap-2 text-[0.9375rem] text-ink-2">
                <span className="truncate">Next: {lower(nextUp(c).title)}</span>
                <ArrowRight className="ml-auto size-4 shrink-0 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
            {p.onPractice && (
              <button
                onClick={() => p.onPractice!(c.id)}
                data-tour={i === 0 && !compact ? 'home-practice' : undefined}
                className="press group flex h-12 w-full items-center gap-2 border-t border-line px-5 text-left text-[0.9375rem] text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <ListChecks className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="font-medium">Practice questions</span>
                <span className="tnum ml-auto text-sm text-ink-3">
                  {perfectQuizzes(c.id)}/{names.length} perfect
                </span>
              </button>
            )}
          </motion.li>
        );

  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-paper [transform:translateZ(0)] md:bg-paper/80 md:backdrop-blur-xl">
        <TopBar crumbs={['Home']} right={<FinalPill />} />
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-line px-2 [scrollbar-width:none] md:px-3">
          <span aria-current="page" className="tab flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] font-medium">
            <Home className="size-4" strokeWidth={1.75} aria-hidden="true" /> Home
          </span>
          <TopicsMenu concepts={p.concepts} mastered={mastered} total={(id) => (p.subskills[id] ?? []).length} onStart={p.onStart} />
          <button onClick={p.onDrill} disabled={!p.onDrill} className="tab press flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] text-ink-2 hover:text-ink">
            <Timer className="size-4" strokeWidth={1.75} aria-hidden="true" /> Exam drill
          </button>
          <button onClick={p.onVisualize} disabled={!p.onVisualize} className="tab press flex h-11 shrink-0 items-center gap-2 px-2.5 text-[0.9375rem] text-ink-2 hover:text-ink">
            <Eye className="size-4" strokeWidth={1.75} aria-hidden="true" /> Visualize
          </button>
        </nav>
      </header>

      <Aurora className="px-5 pt-14 pb-32 text-center md:pt-20 md:pb-36">
        <ul className="mb-7 flex flex-wrap justify-center gap-2" aria-label="At a glance">
          {[
            { icon: CalendarClock, text: daysToFinal() === 0 ? 'Final is today' : `${daysToFinal()} day${daysToFinal() === 1 ? '' : 's'} to the final` },
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
              >
                <Icon className="size-4 opacity-70" strokeWidth={2} aria-hidden="true" />
                {text}
              </span>
            </motion.li>
          ))}
        </ul>
        <motion.p
          className="mb-2.5 text-[0.9375rem] font-medium text-[#3a3340] md:text-base"
          initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, delay: 0.02, ease: EASE }}
        >
          {greeting}
        </motion.p>
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
          All of CS 100, taught just like zyBooks (just better ;)
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
          <div data-tour="home-mode" className="flex items-center gap-3 border-t border-line/70 px-3 py-2">
            <ModeToggle mode={p.mode} onChange={p.onModeChange} />
            <p className="text-sm text-ink-3 max-sm:hidden">{p.mode === 'talk' ? 'Hands-free, phone in a mount.' : 'You write every line yourself.'}</p>
          </div>
        </motion.form>

        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Pick up a lesson">
          <motion.li {...rise(0)} className="sm:col-span-2">
            <button
              data-tour="home-continue"
              onClick={p.onContinue}
              className="lift press ht-host group flex w-full items-center gap-4 rounded-2xl bg-ink p-4 pr-5 text-left text-paper [--ht:rgb(167_139_250/0.55)] hover:shadow-[0_12px_40px_-8px_rgb(167_139_250/0.45)]"
            >
              <span className="halftone halftone-corner" aria-hidden="true" />
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
          {focus.map((c, i) => topicCard(c, i))}
          <motion.li {...rise(p.concepts.length + 1)} data-tour="home-drill">
            <button
              onClick={p.onDrill}
              disabled={!p.onDrill}
              className="lift press ht-host group flex h-full w-full flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-5 text-left hover:border-line-strong"
            >
              <span className="halftone halftone-corner" aria-hidden="true" />
              <span className="flex w-full items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-tag-green" aria-hidden="true">
                  <Timer className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="text-md font-semibold tracking-[-0.02em]">Practice exam</span>
              </span>
              <span className="text-[0.9375rem] text-ink-2">18 timed questions like the final. No tutor and no hints; you see each answer after you lock it in.</span>
              <span className="flex items-center gap-2 text-[0.9375rem] font-medium">
                Start it
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          </motion.li>
          <motion.li {...rise(p.concepts.length + 2)}>
            <button
              data-tour="home-visualize"
              onClick={p.onVisualize}
              disabled={!p.onVisualize}
              className="lift press ht-host group flex h-full w-full flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-5 text-left hover:border-line-strong"
            >
              <span className="halftone halftone-corner" aria-hidden="true" />
              <span className="flex w-full items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-tag-blue" aria-hidden="true">
                  <Eye className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="text-md font-semibold tracking-[-0.02em]">Visualize code</span>
              </span>
              <span className="text-[0.9375rem] text-ink-2">Paste any program and step through it. See every variable, list, dict, and object, with arrows.</span>
              <span className="flex items-center gap-2 text-[0.9375rem] font-medium">
                Open it
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          </motion.li>
        </ul>

        {earlier.length > 0 && (
          <section id="earlier-topics" aria-labelledby="earlier-heading" className="mt-14 scroll-mt-28">
            <h2 id="earlier-heading" className="text-lg font-semibold tracking-[-0.02em]">Earlier topics</h2>
            <p className="mt-1 max-w-[52ch] text-[0.9375rem] text-ink-2">
              The final covers the whole course. These come up less than the three above, but they’re all fair game.
            </p>
            <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Earlier topics">
              {earlier.map((c, i) => topicCard(c, focus.length + 3 + i, true))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
