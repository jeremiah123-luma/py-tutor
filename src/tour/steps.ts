import type { TourStep } from './types';

/**
 * First-run tour content. Each `target` matches a `data-tour="..."` attribute
 * in HomeScreen, LessonScreen, LessonStage or TopBar. A step with no target is
 * shown centered.
 */
export const TOUR_STEPS: TourStep[] = [
  // Home (top to bottom, so the page only ever scrolls one way)
  {
    id: 'home-welcome',
    screen: 'home',
    title: 'Welcome to py-tutor',
    body: 'This gets you ready for the CS 100 final on Sat, Dec 19. The tutor coaches you and never writes your code, because the course integrity rules forbid it.',
  },
  {
    id: 'home-profile',
    screen: 'home',
    target: 'profile',
    placement: 'bottom',
    title: 'Your profile',
    body: 'Tap your initial to see your progress and how much AI help you have left today. You can add Face ID, show this tutorial again, or sign out there.',
  },
  {
    id: 'home-mode',
    screen: 'home',
    target: 'home-mode',
    placement: 'bottom',
    title: 'Type or Talk',
    body: 'Type is for the keyboard. Talk is hands-free: put your phone in a mount, keep the screen on, and tap anywhere to interrupt the tutor.',
  },
  {
    id: 'home-continue',
    screen: 'home',
    target: 'home-continue',
    placement: 'bottom',
    title: 'Pick up where you left off',
    body: 'Tap here to start or continue your next lesson. Each one goes Learn, Example, Line by line, Talk it through, then Try it.',
  },
  {
    id: 'home-lessons',
    screen: 'home',
    target: 'home-lessons',
    placement: 'top',
    title: 'Your three topics',
    body: 'Dictionaries, Files, and Classes each get a card like this one. The bars fill in as you master each skill.',
  },
  {
    id: 'home-drill',
    screen: 'home',
    target: 'home-drill',
    placement: 'top',
    title: 'Practice exam',
    body: '18 timed questions, just like the final: no tutor and no hints. Your score tells you which topic to study next.',
  },
  {
    id: 'home-visualize',
    screen: 'home',
    target: 'home-visualize',
    placement: 'top',
    title: 'Watch code run',
    body: 'Paste any program and step through it, like pythontutor.com. You see every variable, list, dict, and object as it changes.',
  },

  // Lesson (shown the first time you reach Try it)
  {
    id: 'lesson-steps',
    screen: 'lesson',
    target: 'lesson-steps',
    placement: 'bottom',
    title: 'Six steps per lesson',
    body: 'These tabs show where you are: Learn, Example, Line by line, Talk it through, Try it, and Quick check (a few exam-style questions). Tap a step to go to it.',
  },
  {
    id: 'lesson-stage',
    screen: 'lesson',
    target: 'lesson-stage',
    placement: 'right',
    title: 'Your task',
    body: 'This is what your code has to do. Read it closely: the tests check exactly what it asks for.',
  },
  {
    id: 'lesson-editor',
    screen: 'lesson',
    target: 'lesson-editor',
    placement: 'left',
    title: 'You write the code',
    body: 'Type your code here, and Run shows what it prints. The tutor gives pointers and never writes the code for you, so the work stays yours.',
  },
  {
    id: 'lesson-check',
    screen: 'lesson',
    target: 'lesson-check',
    placement: 'bottom',
    title: 'Check your code',
    body: 'Check runs real tests in your browser and is always free. If a test fails, a speech-bubble button appears next to it: tap it to have the tutor explain, which uses your AI help for today.',
  },
  {
    id: 'lesson-hint',
    screen: 'lesson',
    target: 'lesson-hint',
    placement: 'top',
    title: 'Free written hints',
    body: 'Stuck? Hints come one at a time and are free. After the last one, the button changes to Ask the tutor for help, which uses your AI help for today.',
  },
  {
    id: 'lesson-convo',
    screen: 'lesson',
    target: 'lesson-convo',
    placement: 'right',
    title: 'Ask the tutor',
    body: 'Type questions here. Replies use your AI help for today, which grows or shrinks with how many classmates are studying. If it runs out, you can ask for more.',
  },
];
