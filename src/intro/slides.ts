// The intro, scene by scene. Only the site's own colours: studio black, paper white, violet, lilac, pink, sky.
// Scenes: the >_ mark builds and types the wordmark; a wheel spins the three topics; app windows fly apart
// (the old way) and collapse into one; then short statements ride in on full-bleed slabs.

export const C = {
  black: '#111111',
  surface: '#1A1A1A',
  white: '#F5F5F5',
  violet: '#A78BFA',
  lilac: '#C4B5FD',
  pink: '#F9A8D4',
  sky: '#93C5FD',
} as const;

interface Base {
  id: string;
  bg: string;
  ink: string;
  /** how long the scene holds before moving on by itself */
  ms: number;
}
export type IntroScene =
  | (Base & { kind: 'mark' })
  | (Base & { kind: 'wheel'; cards: { code: string; label: string; bg: string }[] })
  | (Base & { kind: 'chaos'; lines: string[]; windows: string[] })
  | (Base & { kind: 'slab'; lines: string[]; sub: string });

export const INTRO_SCENES: IntroScene[] = [
  { id: 'mark', kind: 'mark', bg: C.black, ink: C.white, ms: 2800 },
  {
    id: 'topics',
    kind: 'wheel',
    bg: C.white,
    ink: C.black,
    ms: 2200,
    cards: [
      { code: '{ }', label: 'Dictionaries', bg: C.violet },
      { code: 'open()', label: 'Files', bg: C.pink },
      { code: 'class', label: 'Classes', bg: C.sky },
    ],
  },
  {
    id: 'tabs',
    kind: 'chaos',
    bg: C.white,
    ink: C.black,
    ms: 2900,
    lines: ['No more three tabs', 'and two apps just', 'to learn Python.'],
    windows: ['zyBooks · Ch 11', 'lecture-11.pdf', 'Chatbot', 'Editor', 'Canvas', 'Visualizer', 'Notes', 'Group chat'],
  },
  { id: 'one', kind: 'slab', bg: C.violet, ink: C.black, ms: 1500, lines: ['One screen.'], sub: 'Lesson, editor, tests, and tutor, side by side.' },
  {
    id: 'coach',
    kind: 'slab',
    bg: C.black,
    ink: C.lilac,
    ms: 2000,
    lines: ['It coaches.', 'You code.'],
    sub: 'Chatbots hand you the answer. This points at the line to fix and lets you write it.',
  },
  { id: 'check', kind: 'slab', bg: C.pink, ink: C.black, ms: 1600, lines: ['Check your', 'code. Free.'], sub: 'Real tests in your browser, as often as you want.' },
  { id: 'see', kind: 'slab', bg: C.sky, ink: C.black, ms: 1600, lines: ['Watch your', 'code think.'], sub: 'Step through any program and see every variable change.' },
  { id: 'talk', kind: 'slab', bg: C.surface, ink: C.pink, ms: 1500, lines: ['Study in', 'the car.'], sub: 'Talk mode is hands-free.' },
  { id: 'final', kind: 'slab', bg: C.lilac, ink: C.black, ms: 0, lines: ['Built for', 'Dec 19.'], sub: 'Matched to our zyBook, with a timed practice exam.' },
];

/** Text a screen reader hears for a scene. */
export function sceneText(s: IntroScene): string {
  switch (s.kind) {
    case 'mark':
      return 'py-tutor';
    case 'wheel':
      return `Three topics: ${s.cards.map((c) => c.label).join(', ')}.`;
    case 'chaos':
      return s.lines.join(' ');
    case 'slab':
      return `${s.lines.join(' ')} ${s.sub}`;
  }
}
