// The learning loop. One Session per lesson; the only code that calls the tutor.
//   define -> example -> walkthrough(1..n) -> talkthrough -> feedback -> doit -> check -> mastered|next
// Scripted steps (define/example/walkthrough) come straight from the curriculum: no AI call, no latency.
import { gradeFeedback } from './feedback';
import type { Concept, GradeResult, Lesson, Mode, Progress, RunResult, SessionState, TestCase, TutorTurn } from '../types';
import type { TutorAsk, TutorMeta } from './api';
import { record, sub, withLast } from './progress';

/** True on the steps where the editor holds his own code (everything else shows the lesson example). */
export function isWriting(step: SessionState['step']) {
  return step === 'doit' || step === 'check';
}

/**
 * The one source of truth for which code is on screen. The editor shows it and Run runs it,
 * so what he sees is always exactly what runs.
 */
/**
 * Files a run starts with. His own code (Try it) gets the do-it sample files. The example gets its own files
 * when the lesson lists them (even none, for an example that creates its file), otherwise the do-it samples.
 */
export function runFilesFor(lesson: Lesson, step?: SessionState['step']) {
  const tests = lesson.doit.tests;
  const sample = (tests.find((t) => t.files && !t.hidden) ?? tests.find((t) => t.files))?.files;
  if (step && showsOwnCode(step)) return sample;
  return lesson.exampleFiles ?? sample;
}

/** His own code stays on screen while writing, after a pass, and once the skill is mastered. */
export function showsOwnCode(step: SessionState['step']) {
  return isWriting(step) || step === 'mastered';
}

export function codeOnScreen(lesson: Lesson, state: Pick<SessionState, 'step' | 'code'>) {
  return showsOwnCode(state.step) ? state.code : lesson.example;
}

export interface EngineDeps {
  tutor: (req: TutorAsk, onText: (d: string) => void, signal?: AbortSignal) => Promise<{ text: string; meta: TutorMeta }>;
  run: (code: string, stdin?: string[], files?: Record<string, string>, trace?: boolean) => Promise<RunResult>;
  grade: (code: string, tests: TestCase[]) => Promise<GradeResult>;
  getProgress: () => Progress;
  setProgress: (p: Progress) => void;
  /** Keeps what he typed on Try it between visits (optional). */
  draft?: { load(): string | null; save(code: string): void; clear(): void };
}

export interface SessionEvents {
  /** Fires for every chunk of tutor text as it streams (voice uses this). */
  onTutorText?: (delta: string) => void;
  /** Fires when a whole tutor line is known (scripted lines, or the end of a stream). */
  onTutorLine?: (text: string, scripted: boolean) => void;
}

export class Session {
  state: SessionState;
  private listeners = new Set<() => void>();
  private ctrl: AbortController | null = null;
  private talkHints = 0;
  private doHints = 0;
  private checks = 0;
  /** A pass finished the current round; the next visit to Try it starts a fresh one (starter code, counters reset). */
  private roundDone = false;
  /** Talk it through passed cleanly this round (it counts toward mastery, like a clean typed pass). */
  private talkClean = false;
  /** He read hints after passing; the next round starts with that hint already counted. */
  private hintsAfterPass = 0;
  private wasMastered = false;
  /** He gave Talk it through a go this round (passed or not). */
  private talkTried = false;
  readonly lesson: Lesson;

  readonly concept: Concept;
  mode: Mode;
  events: SessionEvents;
  private deps: EngineDeps;

  constructor(concept: Concept, lessonIndex: number, mode: Mode, deps: EngineDeps, events: SessionEvents = {}) {
    this.concept = concept;
    this.mode = mode;
    this.deps = deps;
    this.events = events;
    this.lesson = concept.lessons[lessonIndex];
    this.wasMastered = sub(deps.getProgress(), concept.id, this.lesson.subskill).mastered;
    this.state = {
      concept: concept.id,
      lessonIndex,
      step: 'define',
      seen: ['define'],
      walkLine: 0,
      turns: [],
      code: this.deps.draft?.load() ?? this.lesson.doit.starter,
      busy: 'idle',
      freeHints: { talk: 0, doit: 0 },
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private set(patch: Partial<SessionState>) {
    if (patch.step && !(this.state.seen ?? []).includes(patch.step)) patch = { ...patch, seen: [...(this.state.seen ?? []), patch.step] };
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  private push(turn: Omit<TutorTurn, 'at'>) {
    this.set({ turns: [...this.state.turns, { ...turn, at: Date.now() }] });
  }
  private scripted(text: string, highlightLines?: number[]) {
    this.push({ role: 'tutor', text, highlightLines, scripted: true });
    this.events.onTutorLine?.(text, true);
  }
  private saveLast() {
    this.deps.setProgress(withLast(this.deps.getProgress(), this.concept.id, this.lesson.subskill, this.state.step));
  }

  get walkNotes() {
    return this.lesson.walkthrough;
  }
  get hasNextLesson() {
    return this.state.lessonIndex + 1 < this.concept.lessons.length;
  }

  start() {
    this.set({ step: 'define' });
    this.scripted(this.lesson.define);
    this.saveLast();
  }

  /** Move forward on scripted steps. Ignored while he has something to answer. */
  next() {
    const s = this.state;
    switch (s.step) {
      case 'define':
        this.set({ step: 'example' });
        this.scripted(
          this.mode === 'talk'
            ? "Here's a short example. I'll read it to you one line at a time."
            : "Here's a short example. Read it once, then we'll go line by line.",
        );
        break;
      case 'example':
        this.set({ step: 'walkthrough', walkLine: 1 });
        this.speakWalkLine(1);
        break;
      case 'walkthrough': {
        const n = this.lesson.walkthrough.length;
        if (s.walkLine < n) {
          this.set({ walkLine: s.walkLine + 1 });
          this.speakWalkLine(s.walkLine + 1);
        } else {
          this.set({ step: 'talkthrough', walkLine: 0 });
          this.scripted(
            `Your turn, no typing yet. ${this.lesson.talkthrough.prompt} Just tell me how you'd do it.`,
          );
        }
        break;
      }
      case 'talkthrough':
        // Skip ahead (for example when the tutor can't be reached).
        this.talkHints++;
        this.talkClean = false;
        this.set({ step: 'feedback', skippedTalk: true });
        break;
      case 'feedback':
        this.enterDoit();
        this.scripted(
          this.mode === 'talk'
            ? `Now let's build it. ${this.lesson.doit.prompt} Say the code you'd write, line by line.`
            : `Now you write it. ${this.lesson.doit.prompt} Press Check when you're ready.`,
        );
        break;
      default:
        return;
    }
    this.saveLast();
  }

  /**
   * Enter Try it. Mid-round (he jumped to another tab and came back) everything is kept: his code, his checks,
   * and the hints he used, so a tab jump can't wipe a hint or hand him a free "clean" pass. After a pass, the
   * next visit is a new round: starter code and fresh counters, so a clean pass means writing it again.
   */
  private enterDoit() {
    if (this.roundDone) {
      this.roundDone = false;
      this.checks = 0;
      this.doHints = this.hintsAfterPass; // hints read after the last pass count against this round
      this.hintsAfterPass = 0;
      this.deps.draft?.clear();
      this.set({ code: this.lesson.doit.starter, freeHints: { talk: this.state.freeHints?.talk ?? 0, doit: 0 } });
    }
    this.set({ step: 'doit', walkLine: 0, lastRun: undefined, lastGrade: undefined, gradeExplained: false });
  }

  /** Jump straight to any step (the step tabs). Nothing is graded or recorded by jumping. */
  goTo(step: 'define' | 'example' | 'walkthrough' | 'talkthrough' | 'doit' | 'quiz') {
    if (this.state.step === step && step !== 'walkthrough') return;
    this.interrupt();
    // Leaving Try it: his run output and test results belong to his code, not to the example.
    if (step !== 'doit') this.set({ lastRun: undefined, lastGrade: undefined, gradeExplained: false });
    switch (step) {
      case 'define':
        this.set({ step, walkLine: 0 });
        this.scripted(this.lesson.define);
        break;
      case 'example':
        this.set({ step, walkLine: 0 });
        break;
      case 'walkthrough':
        this.set({ step, walkLine: 1 });
        this.speakWalkLine(1);
        break;
      case 'talkthrough':
        this.talkHints = 0; // a fresh explanation; an earlier skip or hint doesn't count against this one
        this.talkClean = false;
        this.set({ step, walkLine: 0, skippedTalk: false });
        this.scripted(`Your turn, no typing yet. ${this.lesson.talkthrough.prompt} Just tell me how you'd do it.`);
        break;
      case 'doit':
        this.enterDoit();
        this.scripted(
          this.mode === 'talk'
            ? `Now let's build it. ${this.lesson.doit.prompt} Say the code you'd write, line by line.`
            : `Now you write it. ${this.lesson.doit.prompt} Press Check when you're ready.`,
        );
        break;
      case 'quiz':
        // Practice only: answered and scored on screen, nothing here touches mastery or calls the tutor.
        this.set({ step, walkLine: 0 });
        break;
    }
    this.saveLast();
  }

  /** Step back through the scripted part (walkthrough lines, then example, then definition). */
  back() {
    const s = this.state;
    if (s.step === 'walkthrough' && s.walkLine > 1) {
      this.set({ walkLine: s.walkLine - 1 });
      this.speakWalkLine(s.walkLine - 1);
    } else if (s.step === 'walkthrough') {
      this.set({ step: 'example', walkLine: 0 });
    } else if (s.step === 'example') {
      this.set({ step: 'define' });
    }
  }

  private speakWalkLine(line: number) {
    const note = this.lesson.walkthrough.find((w) => w.line === line);
    if (!note) return;
    const text = this.mode === 'talk' && note.spoken ? `${note.spoken}. ${note.text}` : note.text;
    this.scripted(text, [line]);
  }

  setCode(code: string) {
    this.set({ code });
    this.deps.draft?.save(code);
  }

  /** Stop the tutor mid-sentence (barge-in or tap). */
  interrupt() {
    this.ctrl?.abort();
    this.ctrl = null;
    if (this.state.busy === 'thinking' || this.state.busy === 'speaking') this.set({ busy: 'idle' });
  }

  private async callTutor(req: Omit<TutorAsk, 'concept' | 'subskill' | 'step' | 'mode' | 'history'>) {
    this.interrupt();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.set({ busy: 'thinking' });
    const history = this.state.turns.slice(-8).map((t) => ({ role: t.role, text: t.text }));
    // Placeholder turn that fills in as text streams.
    const at = Date.now();
    let live = '';
    // Updated by identity, not by position: a check or hint pushed mid-stream must not get overwritten.
    let mine: TutorTurn = { role: 'tutor', text: '', at };
    const fill = (t: TutorTurn) => {
      const i = this.state.turns.lastIndexOf(mine);
      if (i < 0) return;
      const turns = this.state.turns.slice();
      turns[i] = t;
      mine = t;
      this.set({ turns });
    };
    this.set({ turns: [...this.state.turns, mine] });
    try {
      const res = await this.deps.tutor(
        { ...req, concept: this.concept.id, subskill: this.lesson.subskill, step: this.state.step, mode: this.mode, history },
        (d) => {
          if (ctrl.signal.aborted) return; // stopped: text still in flight is dropped
          live += d;
          fill({ role: 'tutor', text: live, at });
          this.events.onTutorText?.(d);
        },
        ctrl.signal,
      );
      fill({
        role: 'tutor',
        text: res.text,
        nailed: res.meta.nailed,
        fix: res.meta.fix,
        highlightLines: res.meta.highlightLines,
        at,
      });
      this.events.onTutorLine?.(res.text, false);
      return res;
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // stopped before it said anything: don't leave an empty bubble behind
        if (!live) this.set({ turns: this.state.turns.filter((t) => t !== mine) });
        return null;
      }
      const m = (e as Error).message;
      const msg =
        m === 'locked'
          ? 'You were signed out. Sign in again from the home screen.'
          : m === 'cap'
            ? "You've used today's AI help. Checks and written hints still work, and it resets tomorrow."
            : "I couldn't reach the tutor just now. Check your connection and try again.";
      fill({ role: 'tutor', text: msg, at });
      this.events.onTutorLine?.(msg, true); // Talk mode says it out loud and finishes the turn
      return null;
    } finally {
      if (this.ctrl === ctrl) {
        this.ctrl = null;
        this.set({ busy: 'idle' });
      }
    }
  }

  /** He said or typed something. What it means depends on the step. */
  async say(text: string) {
    const t = text.trim();
    if (!t) return;
    this.push({ role: 'learner', text: t });
    const step = this.state.step;
    if (step === 'talkthrough') {
      const res = await this.callTutor({ kind: 'assess-talk', learnerText: t, hintsUsed: this.talkHints });
      if (!res) return;
      this.talkTried = true;
      if (res.meta.verdict === 'pass') {
        const p = record(this.deps.getProgress(), this.concept.id, this.lesson.subskill, {
          passed: true,
          clean: this.talkHints === 0,
          typed: false,
        });
        this.deps.setProgress(p);
        this.talkClean = this.talkHints === 0;
        if (sub(p, this.concept.id, this.lesson.subskill).mastered && !this.wasMastered) {
          // a clean explanation after a clean typed pass completes mastery: say so
          this.wasMastered = true;
          this.roundDone = true;
          this.set({ step: 'mastered', skippedTalk: false });
          this.saveLast();
          return;
        }
        this.set({ step: 'feedback', skippedTalk: false });
      } else {
        this.talkHints++;
      }
      return;
    }
    if (step === 'doit' && this.mode === 'talk') {
      const res = await this.callTutor({ kind: 'assess-spoken-code', learnerText: t, hintsUsed: this.doHints });
      if (!res) return;
      this.checks++;
      this.finishDoit(res.meta.verdict === 'pass', false);
      return;
    }
    await this.callTutor({ kind: 'ask', learnerText: t, code: isWriting(step) ? this.state.code : undefined });
  }

  /** The written hints for the question on screen, and how many he has already seen. */
  hintBudget() {
    const step = this.state.step;
    const used = this.state.freeHints ?? { talk: 0, doit: 0 };
    if (step === 'talkthrough') return { list: this.lesson.talkthrough.hints, used: used.talk };
    if (isWriting(step)) return { list: this.lesson.doit.hints, used: used.doit };
    return { list: [] as string[], used: 0 };
  }

  /**
   * Hints cost nothing until the written ones run out: each lesson question ships with 2–3 hand-written hints,
   * shown in order with no AI call. Only after those does Hint ask the tutor (which uses API credits).
   */
  async hint() {
    this.interrupt(); // a reply still streaming stops here; the hint comes next
    const step = this.state.step;
    if (step === 'talkthrough') this.talkHints++;
    else if (step === 'doit') this.doHints++;
    else if (step === 'check' || step === 'mastered') this.hintsAfterPass++;
    this.push({ role: 'learner', text: 'Can I get a hint?' });
    const { list, used } = this.hintBudget();
    if (used < list.length) {
      const text = `Hint ${used + 1} of ${list.length}: ${list[used]}`;
      const fh = this.state.freeHints ?? { talk: 0, doit: 0 };
      this.set({ freeHints: step === 'talkthrough' ? { ...fh, talk: fh.talk + 1 } : { ...fh, doit: fh.doit + 1 } });
      this.push({ role: 'tutor', text });
      this.events.onTutorLine?.(text, true);
      return;
    }
    await this.callTutor({
      kind: 'hint',
      code: isWriting(step) ? this.state.code : undefined,
      hintsUsed: step === 'doit' ? this.doHints - 1 : this.talkHints - 1,
    });
  }

  /** Files a run starts with: the example's own files over the do-it sample files. */
  private runFiles() {
    return runFilesFor(this.lesson, this.state.step);
  }

  /** Run the example with a line-by-line trace, for the step-through player. Null if it can't be played. */
  async traceExample() {
    const r = await this.deps.run(this.lesson.example, [], runFilesFor(this.lesson), true);
    if (r.error || r.timedOut || !r.steps || r.steps.length < 2) return null;
    return r.steps;
  }

  /** Run whatever code is on screen (the example, or his code) with the program-input box contents. */
  async run(stdinText: string) {
    if (this.state.step === 'define') return this.state.lastRun;
    this.set({ busy: 'running' });
    const stdin = stdinText === '' ? [] : stdinText.split('\n');
    const files = this.runFiles();
    const result = await this.deps.run(codeOnScreen(this.lesson, this.state), stdin, files);
    const changed = Object.fromEntries(Object.entries(result.files ?? {}).filter(([name, text]) => files?.[name] !== text));
    const lastRun = Object.keys(changed).length ? { ...result, changedFiles: changed } : result;
    this.set({ lastRun, busy: 'idle' });
    return lastRun;
  }

  /** Grade against the tests and explain the result from the tests alone. Always free: no AI call, no credits. */
  async check() {
    if (this.state.step !== 'doit' && this.state.step !== 'check') return;
    if (this.state.busy === 'running') return; // a double tap grades once
    this.interrupt(); // a reply still streaming stops; the check result comes next
    this.set({ busy: 'running' });
    const lastGrade = await this.deps.grade(this.state.code, this.lesson.doit.tests);
    this.checks++;
    this.set({ lastGrade, busy: 'idle', gradeExplained: false });
    this.push({ role: 'learner', text: 'Check my code.' });
    const fb = gradeFeedback(lastGrade, this.state.code);
    this.push({ role: 'tutor', text: fb.text, nailed: fb.nailed, fix: fb.fix });
    this.events.onTutorLine?.(fb.text, true);
    this.finishDoit(lastGrade.passed, true);
  }

  /** "Ask the tutor about this": only when he taps it does the tutor (AI, uses credits) explain the last failed check. */
  async explainCheck() {
    const grade = this.state.lastGrade;
    if (!grade || grade.passed || this.state.gradeExplained || this.state.step !== 'doit' || this.state.busy !== 'idle') return;
    this.set({ gradeExplained: true });
    this.push({ role: 'learner', text: 'Can you explain what went wrong?' });
    const res = await this.callTutor({ kind: 'explain-grade', code: this.state.code, grade, hintsUsed: this.doHints });
    if (res === null) this.set({ gradeExplained: false });
  }

  private finishDoit(passed: boolean, typed: boolean) {
    const clean = passed && this.checks === 1 && this.doHints === 0;
    const p = record(this.deps.getProgress(), this.concept.id, this.lesson.subskill, { passed, clean, typed });
    this.deps.setProgress(p);
    if (!passed) {
      // loop: back on Try it until it passes (a failing re-check after a pass must not leave "All tests pass" up).
      // He's working on new code now, so it's mid-round again: a tab jump must not reset it to the starter.
      if (this.state.step === 'check' || this.state.step === 'mastered') {
        this.roundDone = false;
        this.doHints += this.hintsAfterPass; // hints read on the pass screen belong to this (continued) round
        this.hintsAfterPass = 0;
        this.set({ step: 'doit' });
      }
      return;
    }
    this.roundDone = true;
    const mastered = sub(p, this.concept.id, this.lesson.subskill).mastered;
    if (mastered) this.wasMastered = true;
    // why it isn't mastered yet, in plain words (shown on the pass screen)
    const sp = sub(p, this.concept.id, this.lesson.subskill);
    const passReason: SessionState['passReason'] = !clean
      ? 'notClean'
      : !sp.typedPass
        ? 'notTyped'
        : this.state.skippedTalk
          ? 'skippedTalk'
          : this.talkClean
            ? 'streakReset'
            : this.talkTried
              ? 'talkHinted'
              : 'notTalked';
    this.talkTried = false;
    this.set({ step: mastered ? 'mastered' : 'check', lastClean: clean, passReason });
    this.saveLast();
  }
}
