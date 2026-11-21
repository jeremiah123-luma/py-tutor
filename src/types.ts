// Shared contract between the UI track and the engine track.
// UI imports these types; engine modules implement them.

export type ConceptId = 'dictionaries' | 'files' | 'classes';
export type Mode = 'type' | 'talk';

export type LoopStep =
  | 'define'
  | 'example'
  | 'walkthrough'
  | 'talkthrough'
  | 'feedback'
  | 'doit'
  | 'check'
  | 'mastered';

/** One line-by-line note for the walkthrough. `line` is 1-based. */
export interface WalkNote {
  line: number;
  text: string; // plain English, read aloud
  spoken?: string; // how to say the code on that line, if different
}

export interface TestCase {
  name: string;
  /** Lines fed to input(), in order. */
  stdin?: string[];
  /** Files present before the run: path -> contents. */
  files?: Record<string, string>;
  /** Exact expected stdout (trailing newline tolerant). */
  expectStdout?: string;
  /** Python run after the student's code; must raise AssertionError to fail. */
  check?: string;
  /** Files expected after the run: path -> contents. */
  expectFiles?: Record<string, string>;
  hidden?: boolean;
  /** When this test fails, the likely reason in plain words (shown instead of a generic hint). */
  why?: string;
}

export interface Problem {
  id: string;
  subskill: string;
  prompt: string; // what the learner is asked, shown + spoken
  starter: string; // starter code in the editor
  tests: TestCase[];
  /** For talk-through: what a good spoken approach includes. */
  rubric: string[];
  hints: string[]; // escalating
  /** Reference solution. NEVER sent to the client UI or shown to the learner; used for grader self-tests and Claude's grading context only. */
  reference: string;
  /** Plausible student mistakes that MUST fail at least one test (grader self-test). */
  wrong: string[];
}

export interface Lesson {
  subskill: string;
  title: string;
  define: string; // 1–2 plain-English lines
  example: string; // short code
  exampleFiles?: Record<string, string>; // files the example reads, if not the do-it sample files
  walkthrough: WalkNote[];
  talkthrough: Problem; // slightly harder variant, spoken
  doit: Problem; // typed and graded
}

export interface Concept {
  id: ConceptId;
  title: string;
  blurb: string;
  allowed: string[]; // constructs allowed (CS 100 scope)
  banned: string[]; // AST node/feature names to flag
  lessons: Lesson[];
}

/** One executed line, for the step-through player: the state AFTER that line ran. */
export interface TraceStep {
  line: number;
  vars: [string, string][];
  out: string;
}

export interface RunResult {
  /** Present when the run was traced (step-through player). */
  steps?: TraceStep[];
  stdout: string;
  stderr: string;
  error?: { type: string; message: string; line?: number; friendly?: string };
  timedOut: boolean;
  files: Record<string, string>;
  ms: number;
  /** Files the program created or changed (set by the lesson engine), so Run can show what it wrote. */
  changedFiles?: Record<string, string>;
}

export interface TestResult {
  name: string;
  passed: boolean;
  hidden: boolean;
  expected?: string;
  got?: string;
  error?: string;
  /** error is an assert message from the test's check, not a crash. */
  checkFailed?: boolean;
  /** The mismatch is in this file's contents, not in printed output. */
  file?: string;
  why?: string;
  /** Files opened for writing that were never closed (their writes may be missing). */
  unclosed?: string[];
}

export interface GradeResult {
  passed: boolean;
  results: TestResult[];
  bannedUsed: string[];
  /** Correct but not how class teaches it (with, try). Never fails the check. */
  notes?: string[];
}

/** One tutor turn, as the UI renders it. */
export interface TutorTurn {
  role: 'tutor' | 'learner';
  text: string;
  nailed?: string[];
  fix?: string[];
  highlightLines?: number[];
  /** Came straight from the curriculum (already shown on the lesson stage). */
  scripted?: boolean;
  at: number;
}

export interface SubskillProgress {
  streak: number; // clean passes in a row
  typedPass: boolean; // at least one clean pass in type mode
  attempts: number;
  mastered: boolean;
}

export interface Progress {
  concepts: Record<ConceptId, Record<string, SubskillProgress>>;
  last?: { concept: ConceptId; subskill: string; step: LoopStep };
  updatedAt: number;
}

/** Visible state of a running session, owned by the loop engine. */
export interface SessionState {
  concept: ConceptId;
  lessonIndex: number;
  step: LoopStep;
  walkLine: number; // current walkthrough line (1-based), 0 if not walking
  turns: TutorTurn[];
  code: string;
  lastRun?: RunResult;
  lastGrade?: GradeResult;
  /** The tutor already explained lastGrade (he tapped "Ask the tutor about this"). */
  gradeExplained?: boolean;
  busy: 'idle' | 'thinking' | 'running' | 'speaking' | 'listening';
  /** Written hints already shown (free, no AI call), per question. After these run out, Hint asks the tutor. */
  freeHints?: { talk: number; doit: number };
  /** He skipped Talk it through this round. */
  skippedTalk?: boolean;
  /** The last pass was clean (first check, no hints); drives the copy after a pass. */
  lastClean?: boolean;
  /** Why a pass didn't master the skill yet. */
  passReason?: 'notClean' | 'notTyped' | 'skippedTalk' | 'notTalked' | 'talkHinted' | 'streakReset';
  /** Steps he has actually been on this lesson (the step row only ticks these). */
  seen?: LoopStep[];
}

/** Exam Drill short question (16 per drill, plus 2 coding Problems). */
export interface DrillQuestion {
  id: string;
  concept: ConceptId;
  kind: 'predict' | 'choice' | 'spot-bug';
  prompt: string;
  code?: string; // shown in a code block
  choices?: string[]; // for 'choice' and 'spot-bug'
  /** 'predict': exact stdout (verified by running `code`). 'choice'/'spot-bug': index into choices. */
  answer: string | number;
  explain: string; // why, in plain English, 1–2 lines
  files?: Record<string, string>; // seeded files for predict questions that read files
}

/** Visualizer (frames and objects, like Python Tutor). A value is either inline or a reference to a heap object. */
export type VizValue = [kind: string, text: string] | ['ref', number];
export type VizObject =
  | { kind: 'list' | 'tuple' | 'set'; label: string; items: VizValue[]; more: number }
  | { kind: 'dict'; label: string; pairs: [VizValue, VizValue][]; more: number }
  | { kind: 'instance' | 'class'; label: string; attrs: [string, VizValue][] }
  | { kind: 'function'; label: string; name: string }
  | { kind: 'file'; label: string; name: string; mode: string; closed: boolean }
  | { kind: 'other'; label: string; repr: string };
export interface VizFrame {
  id: number;
  name: string;
  vars: [string, VizValue][];
  returnValue?: VizValue;
}
export interface VizStep {
  /** Next line to run (null once the program has ended). */
  line: number | null;
  /** Line that just ran. */
  prevLine: number | null;
  event: 'line' | 'call' | 'return' | 'unwind' | 'exception' | 'done' | 'error';
  frames: VizFrame[];
  heap: [number, VizObject][];
  out: string;
  exception?: string;
}
export interface VizResult {
  steps: VizStep[];
  stdout: string;
  stopped: boolean;
  maxSteps: number;
  error?: RunResult['error'];
  timedOut?: boolean;
}
