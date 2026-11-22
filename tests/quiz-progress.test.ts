// Quick check scores: kept at their best, synced between devices without loss, and never part of mastery.
import { describe, expect, it } from 'vitest';
import { cleanProgress, mergeProgress, sameProgress } from '../src/loop/mergeProgress';
import { emptyProgress, quizScore, recordQuiz, sub } from '../src/loop/progress';
import { betterQuiz, isPerfect } from '../src/loop/quizScore';
import { Session, type EngineDeps } from '../src/loop/engine';
import { concepts } from '../src/curriculum';
import { phaseIndex, phasesFor } from '../src/ui/StepTrack';

describe('quick check scores', () => {
  it('keeps the best score, and a perfect one survives a worse retry', () => {
    let p = recordQuiz(emptyProgress(), 'dictionaries', 'in-get', 3, 5);
    p = recordQuiz(p, 'dictionaries', 'in-get', 5, 5);
    p = recordQuiz(p, 'dictionaries', 'in-get', 2, 5);
    expect(quizScore(p, 'dictionaries', 'in-get')).toEqual({ best: 5, of: 5 });
    expect(isPerfect(quizScore(p, 'dictionaries', 'in-get'))).toBe(true);
  });
  it('a quiz never changes mastery', () => {
    const p = recordQuiz(emptyProgress(), 'files', 'write', 5, 5);
    expect(sub(p, 'files', 'write')).toEqual({ streak: 0, typedPass: false, attempts: 0, mastered: false });
  });
  it('perfect beats a higher-looking imperfect score from a bigger set', () => {
    expect(betterQuiz({ best: 4, of: 4 }, { best: 5, of: 6 })).toEqual({ best: 4, of: 4 });
  });
  it('merging two devices keeps the better score per lesson, and counts as a change', () => {
    const a = recordQuiz(emptyProgress(), 'classes', 'methods', 5, 5);
    const b = recordQuiz(recordQuiz(emptyProgress(), 'classes', 'methods', 2, 5), 'classes', 'class-init', 4, 5);
    const m = mergeProgress(a, b);
    expect(m.quiz?.classes).toEqual({ methods: { best: 5, of: 5 }, 'class-init': { best: 4, of: 5 } });
    expect(sameProgress(m, a)).toBe(false);
    expect(sameProgress(m, mergeProgress(b, a))).toBe(true);
  });
  it('cleaning drops bad scores and odd keys, and keeps good ones', () => {
    const raw = {
      concepts: {},
      updatedAt: 1,
      quiz: {
        dictionaries: { 'in-get': { best: 4, of: 5 }, bad: { best: 9, of: 5 }, toString: { best: 1, of: 1 }, neg: { best: -1, of: 5 }, frac: { best: 1.5, of: 5 } },
        nope: { x: { best: 1, of: 1 } },
      },
      last: { concept: 'files', subskill: 'write', step: 'quiz' },
    };
    const c = cleanProgress(raw);
    expect(c.quiz).toEqual({ dictionaries: { 'in-get': { best: 4, of: 5 } } });
    expect(c.last?.step).toBe('quiz');
    expect(cleanProgress({ concepts: {}, updatedAt: 1 }).quiz).toBeUndefined();
  });
});

describe('quick check step', () => {
  const noop = async () => ({}) as never;
  const deps = (): EngineDeps => {
    let p = emptyProgress();
    return { tutor: noop, run: noop, grade: noop, getProgress: () => p, setProgress: (x) => { p = x; } };
  };
  it('the step tabs can jump to it from anywhere, and it remembers where he was', () => {
    const s = new Session(concepts.dictionaries!, 0, 'type', deps());
    s.start();
    s.goTo('quiz');
    expect(s.state.step).toBe('quiz');
    expect(s.state.seen).toContain('quiz');
  });
  it('is the sixth step, and hidden for a lesson with no questions', () => {
    expect(phaseIndex('quiz')).toBe(5);
    expect(phaseIndex('mastered')).toBe(4);
    expect(phasesFor(false).map((p) => p.id)).not.toContain('quiz');
  });
});
