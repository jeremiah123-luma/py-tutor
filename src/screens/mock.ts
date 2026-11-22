import { emptyConcepts } from '../curriculum/ids';
// Mock data for building and screenshotting the UI before the engine is wired in.
import type { Concept, Progress, SessionState } from '../types';

const example = `grades = {"ana": 91, "ben": 78}
grades["cy"] = 85
for name, score in grades.items():
    print(name, score)`;

export const mockConcept: Concept = {
  id: 'dictionaries',
  title: 'Dictionaries',
  blurb: 'Store values under names you choose, then look them up fast.',
  allowed: ['dict literal', 'd[key]', 'd.get', 'in', 'for k in d', 'd.items()', 'len'],
  banned: ['DictComp', 'Lambda'],
  lessons: [
    {
      subskill: 'loop-items',
      title: 'Looping over a dictionary',
      define:
        'A dictionary is a set of labeled boxes. Each box has a key, the label, and a value, what is inside. You look things up by the label, not by position.',
      example,
      walkthrough: [
        { line: 1, text: 'We make a dictionary with two boxes. The key "ana" holds 91, and "ben" holds 78.' },
        { line: 2, text: 'Square brackets with a new key add a box. Now "cy" holds 85.' },
        {
          line: 3,
          text: '.items() hands us each key and value together, so the loop gets two names: name and score.',
          spoken: 'for name comma score in grades dot items, colon',
        },
        { line: 4, text: 'Inside the loop we print both. This runs once per box, three times.' },
      ],
      talkthrough: {
        id: 'd-talk-1',
        subskill: 'loop-items',
        prompt: 'How would you print only the names of people who scored 80 or higher?',
        starter: '',
        tests: [],
        rubric: ['loops with .items()', 'uses an if inside the loop', 'compares score >= 80', 'prints the name'],
        hints: ['You will need the loop from the example.', 'What goes between the loop line and the print?'],
        reference: '',
        wrong: [],
      },
      doit: {
        id: 'd-doit-1',
        subskill: 'loop-items',
        prompt:
          'Read a name and a score from input, add them to grades, then print every name with a score of 80 or higher, one per line.',
        starter: `grades = {"ana": 91, "ben": 78}
name = input()
score = int(input())
# add the new student, then print the names scoring 80 or more
`,
        tests: [],
        rubric: [],
        hints: [],
        reference: '',
        wrong: [],
      },
    },
  ],
};

export const mockConcepts: Concept[] = [
  mockConcept,
  {
    id: 'files',
    title: 'Files',
    blurb: 'Read text from a file and write results back out.',
    allowed: [],
    banned: [],
    lessons: [],
  },
  {
    id: 'classes',
    title: 'Classes',
    blurb: 'Make your own kinds of objects with their own data and actions.',
    allowed: [],
    banned: [],
    lessons: [],
  },
];

/** Sub-skill names per concept, used for the mastery display on Home. */
export const subskillNames: Record<string, string[]> = {
  dictionaries: ['Make a dict', 'Read a value', 'Add and update', 'Check with in', 'Loop with .items()', 'Count things', 'Nested dicts'],
  files: ['Open and read', 'Read line by line', 'strip and split', 'Write a file', 'Append', 'with blocks'],
  classes: ['__init__ and self', 'Attributes', 'Methods', '__str__', 'Many objects', 'Objects in a list'],
};

const sp = (mastered: boolean, streak = mastered ? 2 : 0) => ({ streak, typedPass: mastered, attempts: streak + 1, mastered });

export const mockProgress: Progress = {
  concepts: {
    ...emptyConcepts(),
    dictionaries: {
      'Make a dict': sp(true),
      'Read a value': sp(true),
      'Add and update': sp(true),
      'Check with in': sp(false, 1),
      'Loop with .items()': sp(false),
    },
    files: {},
    classes: {},
  },
  last: { concept: 'dictionaries', subskill: 'loop-items', step: 'walkthrough' },
  updatedAt: Date.now(),
};

export const mockSession: SessionState = {
  concept: 'dictionaries',
  lessonIndex: 0,
  step: 'walkthrough',
  walkLine: 3,
  code: example,
  busy: 'idle',
  turns: [
    {
      role: 'tutor',
      text: 'A dictionary is a set of labeled boxes. You look things up by the label, not by position.',
      at: 1,
    },
    { role: 'learner', text: 'So the key is like the label on the box?', at: 2 },
    {
      role: 'tutor',
      text: 'Exactly. The key is the label and the value is what is inside. Let’s walk the example one line at a time.',
      at: 3,
    },
  ],
};

export const mockFeedbackSession: SessionState = {
  ...mockSession,
  step: 'check',
  walkLine: 0,
  code: `grades = {"ana": 91, "ben": 78}
name = input()
score = int(input())
grades[name] = score
for name, score in grades.items():
    if score > 80:
        print(name)`,
  turns: [
    ...mockSession.turns,
    {
      role: 'tutor',
      text: 'Really close. One test caught an edge case.',
      nailed: ['You added the new student with grades[name] = score.', 'Your loop over .items() is exactly right.'],
      fix: ['The task says 80 or higher. What does > do when the score is exactly 80?'],
      highlightLines: [6],
      at: 4,
    },
  ],
  lastRun: { stdout: 'ana\n', stderr: '', timedOut: false, files: {}, ms: 41 },
  lastGrade: {
    passed: false,
    bannedUsed: [],
    results: [
      { name: 'Adds the new student', passed: true, hidden: false },
      { name: 'Prints names in order', passed: true, hidden: false },
      { name: 'Score of exactly 80', passed: false, hidden: false, expected: 'ana\ncy\n', got: 'ana\n' },
    ],
  },
};
