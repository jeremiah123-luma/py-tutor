// The intro, scene by scene. Only the site's own colours, laid as the same soft aurora gradients the heroes use.
// The statement scenes keep Raison's pacing (hard cuts alternate with slabs wiping up, nothing holds still, every
// statement leaves on purpose), and each one now has its own way of setting the words, chosen for what it says:
//   squeeze   letters trade widths inside a fixed block, with a one-frame colour flip on the beat ("One screen.")
//   scatter   the words of the problem drift out of place while the last line stays put
//   flutter   lines ripple in like a banner and settle (and keep swaying, for the car)
//   heat      a soft blob in our colours crosses the last line and leaves it heavier
//   stickers  facts slap on as die-cut stickers
//   step      a highlight steps through the words, the way the visualizer steps through code
//   coin      the final's date as a turning coin

export const C = {
  black: '#111111',
  surface: '#1A1A1A',
  white: '#F5F5F5',
  violet: '#A78BFA',
  lilac: '#C4B5FD',
  pink: '#F9A8D4',
  sky: '#93C5FD',
  periwinkle: '#A5B4FC',
  blush: '#FBCFE8',
} as const;

/** Gradient grounds, all built from the aurora palette. */
export type Ground = 'aurora' | 'night' | 'violet' | 'pink' | 'sky' | 'lilac';

interface Base {
  id: string;
  ground: Ground;
  ink: string;
  /** how long the scene holds before moving on by itself (its exit plays in the last part of this) */
  ms: number;
}
export type Enter = 'cut' | 'wipe';
export type Hold = 'grow' | 'settle' | 'breathe';
export type Exit = 'split' | 'lines' | 'none';
export type Fx = 'squeeze' | 'scatter' | 'flutter' | 'sway' | 'heat' | 'stickers' | 'step' | 'coin';

export type IntroScene =
  | (Base & { kind: 'mark'; sub: string })
  | (Base & { kind: 'wheel'; sub: string; cards: { code: string; label: string; detail: string; bg: string }[] })
  | (Base & { kind: 'drift'; lines: string[]; sub: string; windows: string[] })
  | (Base & { kind: 'statement'; lines: string[]; size: 'big' | 'small'; enter: Enter; hold: Hold; exit: Exit; sub?: string; fx?: Fx });

// Every headline carries a short line under it that names the problem or says plainly what it means.
export const INTRO_SCENES: IntroScene[] = [
  { id: 'mark', kind: 'mark', ground: 'night', ink: C.white, ms: 3400, sub: 'The Python tutor for CS 100.' },
  {
    id: 'topics',
    kind: 'wheel',
    ground: 'aurora',
    ink: C.black,
    ms: 3800,
    sub: 'The whole course, in the order our zyBook teaches it, with extra depth on the big three.',
    cards: [
      { code: 'x = 5', label: 'The basics', detail: 'variables, strings, lists, if', bg: C.sky },
      { code: 'for', label: 'Loops and functions', detail: 'for, while, range, def, return', bg: C.pink },
      { code: '{ }', label: 'Dictionaries', detail: 'keys, values, get, pop, update', bg: C.violet },
      { code: 'open()', label: 'Files', detail: 'open, read, write, close', bg: C.pink },
      { code: 'class', label: 'Classes', detail: '__init__, self, attributes', bg: C.sky },
    ],
  },
  {
    id: 'tabs',
    kind: 'drift',
    ground: 'aurora',
    ink: C.black,
    ms: 3800,
    lines: ['No more three tabs', 'and two apps just', 'to learn Python.'],
    sub: 'zyBooks in one tab, the slides in another, a chatbot in a third, and an editor on the side.',
    windows: ['zyBooks · Ch 11', 'lecture-11.pdf', 'Chatbot', 'Editor', 'Canvas', 'Notes'],
  },
  {
    id: 'one',
    kind: 'statement',
    ground: 'violet',
    ink: C.black,
    ms: 2600,
    size: 'big',
    enter: 'cut',
    hold: 'grow',
    exit: 'split',
    fx: 'squeeze',
    lines: ['One', 'screen.'],
    sub: 'The lesson, the editor, the tests, and the tutor, side by side.',
  },
  {
    id: 'one-sub',
    kind: 'statement',
    ground: 'lilac',
    ink: '#2E1065',
    ms: 2600,
    size: 'small',
    enter: 'cut',
    hold: 'breathe',
    exit: 'none',
    fx: 'scatter',
    lines: ['Every switch between tabs', 'costs you your place and', 'the idea you were holding.', 'Here, it all stays put.'],
  },
  {
    id: 'coach',
    kind: 'statement',
    ground: 'night',
    ink: C.lilac,
    ms: 2700,
    size: 'big',
    enter: 'wipe',
    hold: 'settle',
    exit: 'none',
    fx: 'flutter',
    lines: ['It coaches.', 'You code.'],
    sub: 'A tutor that asks the right question instead of writing your code.',
  },
  {
    id: 'chatbots',
    kind: 'statement',
    ground: 'sky',
    ink: '#172554',
    ms: 3100,
    size: 'small',
    enter: 'cut',
    hold: 'breathe',
    exit: 'lines',
    fx: 'heat',
    lines: ['Chatbots hand you the answer.', 'You learn nothing, and the', 'course counts it as cheating.', 'py-tutor makes you write it.'],
  },
  {
    id: 'check',
    kind: 'statement',
    ground: 'pink',
    ink: C.black,
    ms: 2700,
    size: 'big',
    enter: 'wipe',
    hold: 'grow',
    exit: 'split',
    fx: 'stickers',
    lines: ['Check your', 'code. Free.'],
    sub: 'Real tests run in your browser and show what you printed next to what was expected.',
  },
  {
    id: 'see',
    kind: 'statement',
    ground: 'aurora',
    ink: C.black,
    ms: 2600,
    size: 'big',
    enter: 'cut',
    hold: 'settle',
    exit: 'none',
    fx: 'step',
    lines: ['Watch your', 'code think.'],
    sub: 'Step through any program and see every variable, list, and object change.',
  },
  {
    id: 'talk',
    kind: 'statement',
    ground: 'night',
    ink: C.pink,
    ms: 2600,
    size: 'big',
    enter: 'wipe',
    hold: 'grow',
    exit: 'split',
    fx: 'sway',
    lines: ['Study in', 'the car.'],
    sub: 'Talk mode explains out loud and listens to your answer. No screen needed.',
  },
  {
    id: 'final',
    kind: 'statement',
    ground: 'lilac',
    ink: C.black,
    ms: 0,
    size: 'big',
    enter: 'cut',
    hold: 'settle',
    exit: 'none',
    fx: 'coin',
    lines: ['Built for', 'Dec 19.'],
    sub: 'Matched to our zyBook chapter by chapter, with a Quick check after every lesson and a timed 18-question practice exam.',
  },
];

/** Text a screen reader hears for a scene. */
export function sceneText(s: IntroScene): string {
  switch (s.kind) {
    case 'mark':
      return `py-tutor. ${s.sub}`;
    case 'wheel':
      return `Three topics: ${s.cards.map((c) => c.label).join(', ')}. ${s.sub}`;
    case 'drift':
      return `${s.lines.join(' ')} ${s.sub}`;
    case 'statement':
      return `${s.lines.join(' ')}${s.sub ? ` ${s.sub}` : ''}`;
  }
}

/** How long a scene's exit plays before the next scene takes over. */
export function exitMs(s: IntroScene): number {
  // Each is timed so the next scene lands just as the last piece clears, with no empty frames between.
  if (s.kind === 'drift') return 480;
  if (s.kind !== 'statement') return 0;
  return s.exit === 'split' ? 360 + (s.lines.length - 1) * 50 : s.exit === 'lines' ? 140 * s.lines.length + 40 : 0;
}
