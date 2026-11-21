// The intro: what py-tutor is, the problem it fixes, and why it beats the usual way of studying.
// Each slide is one statement set big (lines are authored, so the breaks land where they read best)
// plus one plain sentence under it. Colours are clashing pairs pulled from the aurora palette.

export interface IntroSlide {
  id: string;
  lines: string[];
  sub: string;
  bg: string;
  ink: string;
}

export const INTRO_SLIDES: IntroSlide[] = [
  {
    id: 'meet',
    lines: ['Meet', 'py-tutor'],
    sub: 'A Python tutor for CS 100. Dictionaries, files, and classes, all the way to the final.',
    bg: '#6D28D9',
    ink: '#FBCFE8',
  },
  {
    id: 'tabs',
    lines: ['No more three tabs', 'and two apps just', 'to learn Python.'],
    sub: 'zyBooks in one tab, the slides in another, a chatbot in a third, and an editor on the side. That’s the old way.',
    bg: '#FBCFE8',
    ink: '#6B0F3A',
  },
  {
    id: 'one-screen',
    lines: ['Read it, run it,', 'write it.', 'One screen.'],
    sub: 'The lesson, the editor, the tests, and the tutor sit side by side, so you never lose your place.',
    bg: '#1E1B4B',
    ink: '#93C5FD',
  },
  {
    id: 'chatbots',
    lines: ['Chatbots hand', 'you the answer.', 'That’s the problem.'],
    sub: 'Copy it and you learn nothing, and the course counts it as cheating. Here, you write every line.',
    bg: '#93C5FD',
    ink: '#1E3A8A',
  },
  {
    id: 'coach',
    lines: ['It coaches.', 'You code.'],
    sub: 'Hints point at the line to fix and ask the right question. Your homework stays yours.',
    bg: '#111111',
    ink: '#C4B5FD',
  },
  {
    id: 'check',
    lines: ['Check your code.', 'Free, every time.'],
    sub: 'Real tests run right in your browser and show expected vs. actual output, spaces and all.',
    bg: '#86EFAC',
    ink: '#14532D',
  },
  {
    id: 'see',
    lines: ['Watch your', 'code think.'],
    sub: 'Step through any program and see every variable, list, dict, and object change.',
    bg: '#FDE68A',
    ink: '#7C2D12',
  },
  {
    id: 'talk',
    lines: ['Study in', 'the car.'],
    sub: 'Talk mode is hands-free. It explains out loud, listens to your answer, and keeps going.',
    bg: '#2E1065',
    ink: '#F9A8D4',
  },
  {
    id: 'final',
    lines: ['Built for', 'Dec 19.'],
    sub: 'Lined up with our zyBook chapter by chapter, plus a timed 18-question practice exam.',
    bg: '#A78BFA',
    ink: '#14092B',
  },
];

/** How long a slide holds before moving on by itself. */
export function holdMs(s: IntroSlide): number {
  return 1600 + s.lines.join(' ').length * 38 + s.sub.length * 22;
}
