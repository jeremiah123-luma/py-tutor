// The learning loop. One Session per lesson; the only code that calls the tutor.
//   define -> example -> walkthrough(1..n) -> talkthrough -> feedback -> doit -> check -> mastered|next
// Scripted steps (define/example/walkthrough) come straight from the curriculum: no AI call, no latency.
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
export function codeOnScreen(lesson: Lesson, state: Pick<SessionState, 'step' | 'code'>) {
  return isWriting(state.step) ? state.code : lesson.example;
}

export interface EngineDeps {
  tutor: (req: TutorAsk, onText: (d: string) => void, signal?: AbortSignal) => Promise<{ text: string; meta: TutorMeta }>;
  run: (code: string, stdin?: string[], files?: Record<string, string>, trace?: boolean) => Promise<RunResult>;
  grade: (code: string, tests: TestCase[]) => Promise<GradeResult>;
  getProgress: () => Progress;
  setProgress: (p: Progress) => void;
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
    this.state = {
      concept: concept.id,
      lessonIndex,
      step: 'define',
      walkLine: 0,
      turns: [],
      code: this.lesson.doit.starter,
      busy: 'idle',
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private set(patch: Partial<SessionState>) {
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
        // Skip ahead (for example when the tutor can't be reached). Not a clean round.
        this.talkHints++;
        this.set({ step: 'feedback' });
        break;
      case 'feedback':
        this.set({ step: 'doit', code: this.lesson.doit.starter, lastRun: undefined, lastGrade: undefined });
        this.checks = 0;
        this.doHints = 0;
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

  /** Jump straight to any step (the step tabs). Nothing is graded or recorded by jumping. */
  goTo(step: 'define' | 'example' | 'walkthrough' | 'talkthrough' | 'doit') {
    if (this.state.step === step && step !== 'walkthrough') return;
    this.interrupt();
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
        this.set({ step, walkLine: 0 });
        this.scripted(`Your turn, no typing yet. ${this.lesson.talkthrough.prompt} Just tell me how you'd do it.`);
        break;
      case 'doit':
        if (!isWriting(this.state.step)) {
          this.checks = 0;
          this.doHints = 0;
        }
        this.set({ step, walkLine: 0, lastRun: undefined, lastGrade: undefined });
        this.scripted(
          this.mode === 'talk'
            ? `Now let's build it. ${this.lesson.doit.prompt} Say the code you'd write, line by line.`
            : `Now you write it. ${this.lesson.doit.prompt} Press Check when you're ready.`,
        );
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
    const turns = [...this.state.turns, { role: 'tutor' as const, text: '', at }];
    this.set({ turns });
    try {
      const res = await this.deps.tutor(
        { ...req, concept: this.concept.id, subskill: this.lesson.subskill, step: this.state.step, mode: this.mode, history },
        (d) => {
          live += d;
          this.replaceLast({ role: 'tutor', text: live, at });
          this.events.onTutorText?.(d);
        },
        ctrl.signal,
      );
      this.replaceLast({
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
      if ((e as Error).name === 'AbortError') return null;
      const msg =
        (e as Error).message === 'locked'
          ? 'The passcode was rejected. Enter it again from the home screen.'
          : "I couldn't reach the tutor just now. Check your connection and try again.";
      this.replaceLast({ role: 'tutor', text: msg, at });
      return null;
    } finally {
      if (this.ctrl === ctrl) {
        this.ctrl = null;
        this.set({ busy: 'idle' });
      }
    }
  }

  private replaceLast(t: TutorTurn) {
    const turns = this.state.turns.slice(0, -1).concat(t);
    this.set({ turns });
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
      if (res.meta.verdict === 'pass') {
        this.deps.setProgress(
          record(this.deps.getProgress(), this.concept.id, this.lesson.subskill, {
            passed: true,
            clean: this.talkHints === 0,
            typed: false,
          }),
        );
        this.set({ step: 'feedback' });
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

  async hint() {
    const step = this.state.step;
    if (step === 'talkthrough') this.talkHints++;
    else if (step === 'doit') this.doHints++;
    this.push({ role: 'learner', text: 'Can I get a hint?' });
    await this.callTutor({
      kind: 'hint',
      code: isWriting(step) ? this.state.code : undefined,
      hintsUsed: step === 'doit' ? this.doHints - 1 : this.talkHints - 1,
    });
  }

  /** Files a run starts with: the example's own files over the do-it sample files. */
  private runFiles() {
    const tests = this.lesson.doit.tests;
    const sample = (tests.find((t) => t.files && !t.hidden) ?? tests.find((t) => t.files))?.files;
    return this.lesson.exampleFiles ? { ...sample, ...this.lesson.exampleFiles } : sample;
  }

  /** Run the example with a line-by-line trace, for the step-through player. Null if it can't be played. */
  async traceExample() {
    const r = await this.deps.run(this.lesson.example, [], this.runFiles(), true);
    if (r.error || r.timedOut || !r.steps || r.steps.length < 2) return null;
    return r.steps;
  }

  /** Run whatever code is on screen (the example, or his code) with the program-input box contents. */
  async run(stdinText: string) {
    if (this.state.step === 'define') return this.state.lastRun;
    this.set({ busy: 'running' });
    const stdin = stdinText === '' ? [] : stdinText.split('\n');
    const files = this.runFiles();
    const lastRun = await this.deps.run(codeOnScreen(this.lesson, this.state), stdin, files);
    this.set({ lastRun, busy: 'idle' });
    return lastRun;
  }

  /** Grade against the tests, then have the tutor explain. */
  async check() {
    if (this.state.step !== 'doit' && this.state.step !== 'check') return;
    this.set({ busy: 'running' });
    const lastGrade = await this.deps.grade(this.state.code, this.lesson.doit.tests);
    this.checks++;
    this.set({ lastGrade, busy: 'idle' });
    this.push({ role: 'learner', text: 'Check my code.' });
    const res = await this.callTutor({ kind: 'explain-grade', code: this.state.code, grade: lastGrade, hintsUsed: this.doHints });
    // The tests decide pass/fail, not the model.
    this.finishDoit(lastGrade.passed, true, res !== null);
  }

  private finishDoit(passed: boolean, typed: boolean, explained = true) {
    const clean = passed && this.checks === 1 && this.doHints === 0;
    const p = record(this.deps.getProgress(), this.concept.id, this.lesson.subskill, { passed, clean, typed });
    this.deps.setProgress(p);
    if (!passed) {
      if (!explained) this.scripted("Not quite yet. Look at the first failing test, fix that, and check again.");
      return; // loop: stay on doit until it passes
    }
    const mastered = sub(p, this.concept.id, this.lesson.subskill).mastered;
    this.set({ step: mastered ? 'mastered' : 'check' });
    this.saveLast();
  }
}
