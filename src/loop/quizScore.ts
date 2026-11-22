// Quick check scores: which one to keep. Shared by the app and the Worker (no browser imports here).
import type { QuizScore } from '../types';

export const isPerfect = (q: QuizScore | undefined) => !!q && q.of > 0 && q.best >= q.of;

/** Which of two scores to keep: perfect beats everything, then the higher share right. */
export function betterQuiz(a: QuizScore | undefined, b: QuizScore | undefined): QuizScore | undefined {
  if (!a) return b;
  if (!b) return a;
  if (isPerfect(a) !== isPerfect(b)) return isPerfect(a) ? a : b;
  return b.best / b.of > a.best / a.of ? b : a;
}
