import type { TourStep } from './types';

/**
 * First-run tour content. Each `target` matches a `data-tour="..."` attribute
 * in HomeScreen, LessonScreen, LessonStage or TopBar. A step with no target is
 * shown centered.
 */
export const TOUR_STEPS: TourStep[] = [
  // Home
  {
    id: 'home-welcome',
    screen: 'home',
    title: 'Welcome to py-tutor',
    body: 'This gets you ready for the CS 100 final on Sat, Dec 19. The tutor coaches you and never writes your code, because the course integrity rules forbid it.',
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
    body: 'Each card shows a topic and how many skills you have mastered. The Practice exam card gives you 18 timed questions with no tutor and no hints.',
  },
  {
    id: 'home-mode',
    screen: 'home',
    target: 'home-mode',
    placement: 'bottom',
    title: 'Type or Talk',
    body: 'Type is for the keyboard. Talk is hands-free studying: put your phone in a mount, the screen stays on, and you tap anywhere to interrupt the tutor.',
  },
  {
    id: 'home-visualize',
    screen: 'home',
    target: 'home-visualize',
    placement: 'top',
    title: 'Watch code run',
    body: 'Visualize code lets you paste any program and step through it, like pythontutor.com. You see every variable, list, dict, and object as it changes.',
  },
  {
    id: 'home-profile',
    screen: 'home',
    target: 'profile',
    placement: 'bottom',
    title: 'Your profile',
    body: 'Tap your initial to see your progress and how much AI help you have left today. You can add a passkey there, replay this tour, or sign out.',
  },

  // Lesson
  {
    id: 'lesson-steps',
    screen: 'lesson',
    target: 'lesson-steps',
    placement: 'bottom',
    title: 'Five steps per lesson',
    body: 'These tabs show where you are: Learn, Example, Line by line, Talk it through, and Try it. Tap a step to jump back to it.',
  },
  {
    id: 'lesson-stage',
    screen: 'lesson',
    target: 'lesson-stage',
    placement: 'right',
    title: 'Read, then explain',
    body: 'The tutor talks you through each step here. In Talk it through, you explain your approach out loud or in text before you write any code.',
  },
  {
    id: 'lesson-editor',
    screen: 'lesson',
    target: 'lesson-editor',
    placement: 'left',
    title: 'You write the code',
    body: 'Your code goes here, and Run shows what it prints. The tutor gives pointers and never writes the code for you, so the work stays yours.',
  },
  {
    id: 'lesson-check',
    screen: 'lesson',
    target: 'lesson-check',
    placement: 'bottom',
    title: 'Check my code',
    body: 'This runs real tests in your browser and is always free. If a check fails, Ask the tutor about this appears, and that button uses AI credits.',
  },
  {
    id: 'lesson-hint',
    screen: 'lesson',
    target: 'lesson-hint',
    placement: 'top',
    title: 'Free written hints',
    body: 'Stuck? Hints come one at a time and are free. After the last one, the button changes to Ask the tutor for help, which uses your AI allowance.',
  },
  {
    id: 'lesson-convo',
    screen: 'lesson',
    target: 'lesson-convo',
    placement: 'right',
    title: 'Ask the tutor',
    body: 'Type questions here. Replies use your daily AI allowance, which adjusts to how many classmates are studying. If it runs out, a pop-up lets you ask for more.',
  },
];
