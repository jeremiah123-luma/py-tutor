// Every Quick check answer must be right before anyone sees it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeRunner } from './helpers';
import { concepts } from '../src/curriculum';
import { drill } from '../src/curriculum/drill';
import { quizzes } from '../src/curriculum/quiz';
import type { PyRunner } from '../src/runtime/runner';
import type { ConceptId } from '../src/types';

let py: PyRunner;
beforeAll(async () => {
  py = nodeRunner();
  await py.whenReady();
}, 60_000);
afterAll(() => py.dispose());

const trim = (s: string) => s.replace(/\n+$/, '');
const only = process.env.QUIZ_CONCEPT as ConceptId | undefined;
const all = Object.values(quizzes).flatMap((byLesson) => Object.values(byLesson).flat());

describe('quick check: the whole bank', () => {
  it('ids are unique and never reuse a practice exam id', () => {
    const ids = all.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const drillIds = new Set(drill.map((q) => q.id));
    expect(ids.filter((id) => drillIds.has(id))).toEqual([]);
  });
});

for (const concept of Object.values(concepts)) {
  if (only && concept!.id !== only) continue;
  const bank = quizzes[concept!.id];
  describe(`quick check: ${concept!.title}`, () => {
    it('only covers real lessons', () => {
      const subs = new Set(concept!.lessons.map((l) => l.subskill));
      expect(Object.keys(bank).filter((s) => !subs.has(s))).toEqual([]);
    });
    it('uses all three kinds across the topic, and right answers are not always in one spot', () => {
      const qs = Object.values(bank).flat();
      for (const k of ['predict', 'choice', 'spot-bug']) expect(qs.some((q) => q.kind === k), k).toBe(true);
      const spots = new Set(qs.filter((q) => q.kind !== 'predict').map((q) => q.answer));
      expect(spots.size).toBeGreaterThanOrEqual(3);
    });
    for (const lesson of concept!.lessons) {
      const qs = bank[lesson.subskill] ?? [];
      describe(lesson.subskill, () => {
        it('has 4 to 6 questions, at least one "what does this print" and one with choices', () => {
          expect(qs.length).toBeGreaterThanOrEqual(4);
          expect(qs.length).toBeLessThanOrEqual(6);
          expect(qs.some((q) => q.kind === 'predict')).toBe(true);
          expect(qs.some((q) => q.kind !== 'predict')).toBe(true);
          for (const q of qs) {
            expect(q.concept).toBe(concept!.id);
            expect(q.prompt.trim().length).toBeGreaterThan(0);
            expect(q.explain.trim().length).toBeGreaterThan(0);
            expect(`${q.prompt} ${q.explain} ${(q.choices ?? []).join(' ')}`, `${q.id} uses a dash`).not.toMatch(/[–—]/);
          }
        });
        for (const q of qs) {
          if (q.kind === 'predict') {
            it(`${q.id}: answer matches the real output`, async () => {
              expect(typeof q.answer).toBe('string');
              expect(q.code).toBeTruthy();
              const r = await py.run(q.code!, [], q.files);
              expect(r.error, JSON.stringify(r.error)).toBeUndefined();
              expect(trim(r.stdout)).toBe(trim(q.answer as string));
            });
          } else {
            it(`${q.id}: answer is one of 3 or 4 different choices`, () => {
              expect(Number.isInteger(q.answer)).toBe(true);
              expect(q.choices!.length).toBeGreaterThanOrEqual(3);
              expect(q.choices!.length).toBeLessThanOrEqual(4);
              expect(new Set(q.choices).size).toBe(q.choices!.length);
              expect(q.answer as number).toBeGreaterThanOrEqual(0);
              expect(q.answer as number).toBeLessThan(q.choices!.length);
            });
          }
          if (q.code) {
            it(`${q.id}: code stays inside what class teaches`, async () => {
              const g = await py.grade(q.code!, [{ name: 'scan' }]);
              expect(g.bannedUsed).toEqual([]);
              // class opens files with open()/close() and hasn't taught try yet
              expect(q.code!).not.toMatch(/^\s*(with|try)\b/m);
            });
          }
        }
      });
    }
  });
}
