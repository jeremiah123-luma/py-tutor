// Every lesson must be correct before Jeremy sees it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeRunner } from './helpers';
import { concepts } from '../src/curriculum';
import type { PyRunner } from '../src/runtime/runner';

let py: PyRunner;
beforeAll(async () => {
  py = nodeRunner();
  await py.whenReady();
}, 60_000);
afterAll(() => py.dispose());

for (const concept of Object.values(concepts)) {
  describe(concept!.title, () => {
    for (const lesson of concept!.lessons) {
      describe(lesson.subskill, () => {
        it('example runs cleanly and walkthrough lines exist', async () => {
          const r = await py.run(lesson.example, [], { ...lesson.doit.tests[0]?.files, ...lesson.exampleFiles });
          expect(r.error, JSON.stringify(r.error)).toBeUndefined();
          const n = lesson.example.split('\n').length;
          for (const w of lesson.walkthrough) expect(w.line).toBeLessThanOrEqual(n);
          expect(lesson.walkthrough.length).toBe(n);
        });
        it('reference solution passes every test', async () => {
          const g = await py.grade(lesson.doit.reference, lesson.doit.tests);
          expect(g.results.filter((r) => !r.passed), JSON.stringify(g)).toEqual([]);
          expect(g.bannedUsed).toEqual([]);
        });
        lesson.doit.wrong.forEach((w, i) => {
          it(`wrong solution #${i + 1} fails at least one test`, async () => {
            const g = await py.grade(w, lesson.doit.tests);
            expect(g.passed).toBe(false);
          });
        });
        it('has at least 2 wrong solutions and 2 hints', () => {
          expect(lesson.doit.wrong.length).toBeGreaterThanOrEqual(2);
          expect(lesson.doit.hints.length).toBeGreaterThanOrEqual(2);
          expect(lesson.talkthrough.hints.length, "talk-it-through needs written hints so Hint is free").toBeGreaterThanOrEqual(2);
          expect(lesson.talkthrough.rubric.length).toBeGreaterThanOrEqual(2);
        });
      });
    }
  });
}
