// The intro, scene by scene. Only the site's own colours, laid as the same soft aurora gradients the heroes use.
// The statement scenes follow the motion of Anagram's Raison piece: hard cuts alternate with slabs wiping up,
// nothing holds still (a slow grow, a slow settle, leading that breathes), and every statement leaves on purpose
// (lines splitting sideways, or a paragraph dropping its lines from the top).

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

export type IntroScene =
  | (Base & { kind: 'mark' })
  | (Base & { kind: 'wheel'; cards: { code: string; label: string; bg: string }[] })
  | (Base & { kind: 'drift'; lines: string[]; windows: string[] })
  | (Base & { kind: 'statement'; lines: string[]; size: 'big' | 'small'; enter: Enter; hold: Hold; exit: Exit; sub?: string });

export const INTRO_SCENES: IntroScene[] = [
  { id: 'mark', kind: 'mark', ground: 'night', ink: C.white, ms: 2800 },
  {
    id: 'topics',
    kind: 'wheel',
    ground: 'aurora',
    ink: C.black,
    ms: 2300,
    cards: [
      { code: '{ }', label: 'Dictionaries', bg: C.violet },
      { code: 'open()', label: 'Files', bg: C.pink },
      { code: 'class', label: 'Classes', bg: C.sky },
    ],
  },
  {
    id: 'tabs',
    kind: 'drift',
    ground: 'aurora',
    ink: C.black,
    ms: 3000,
    lines: ['No more three tabs', 'and two apps just', 'to learn Python.'],
    windows: ['zyBooks · Ch 11', 'lecture-11.pdf', 'Chatbot', 'Editor', 'Canvas', 'Notes'],
  },
  { id: 'one', kind: 'statement', ground: 'violet', ink: C.black, ms: 1900, size: 'big', enter: 'cut', hold: 'grow', exit: 'split', lines: ['One', 'screen.'] },
  {
    id: 'one-sub',
    kind: 'statement',
    ground: 'lilac',
    ink: '#2E1065',
    ms: 2200,
    size: 'small',
    enter: 'cut',
    hold: 'breathe',
    exit: 'none',
    lines: ['The lesson, the editor,', 'the tests, and the tutor,', 'side by side.'],
  },
  { id: 'coach', kind: 'statement', ground: 'night', ink: C.lilac, ms: 2300, size: 'big', enter: 'wipe', hold: 'settle', exit: 'none', lines: ['It coaches.', 'You code.'] },
  {
    id: 'chatbots',
    kind: 'statement',
    ground: 'sky',
    ink: '#172554',
    ms: 2900,
    size: 'small',
    enter: 'cut',
    hold: 'breathe',
    exit: 'lines',
    lines: ['Chatbots hand you the answer.', 'py-tutor points at the line', 'to fix, then lets you write it.', 'Your homework stays yours.'],
  },
  { id: 'check', kind: 'statement', ground: 'pink', ink: C.black, ms: 1900, size: 'big', enter: 'wipe', hold: 'grow', exit: 'split', lines: ['Check your', 'code. Free.'] },
  { id: 'see', kind: 'statement', ground: 'aurora', ink: C.black, ms: 1900, size: 'big', enter: 'cut', hold: 'settle', exit: 'none', lines: ['Watch your', 'code think.'] },
  { id: 'talk', kind: 'statement', ground: 'night', ink: C.pink, ms: 1900, size: 'big', enter: 'wipe', hold: 'grow', exit: 'split', lines: ['Study in', 'the car.'] },
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
    lines: ['Built for', 'Dec 19.'],
    sub: 'Matched to our zyBook, with a timed practice exam.',
  },
];

/** Text a screen reader hears for a scene. */
export function sceneText(s: IntroScene): string {
  switch (s.kind) {
    case 'mark':
      return 'py-tutor';
    case 'wheel':
      return `Three topics: ${s.cards.map((c) => c.label).join(', ')}.`;
    case 'drift':
      return s.lines.join(' ');
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
