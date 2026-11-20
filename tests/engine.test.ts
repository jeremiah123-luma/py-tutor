import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeRunner } from './helpers';
import { concepts } from '../src/curriculum';
import { Session, codeOnScreen, type EngineDeps } from '../src/loop/engine';
import { emptyProgress, sub } from '../src/loop/progress';
import type { TutorAsk } from '../src/loop/api';
import type { Progress } from '../src/types';
import type { PyRunner } from '../src/runtime/runner';

let py: PyRunner;
beforeAll(async () => { py = nodeRunner(); await py.whenReady(); }, 60_000);
afterAll(() => py.dispose());

/** Recorded-style mock: passes spoken answers containing "GOOD", explains grades from the real test results. */
function deps(progress: { p: Progress }, calls: TutorAsk[]): EngineDeps {
  return {
    tutor: async (req, onText) => {
      calls.push(req);
      let text = 'ok';
      let verdict: 'pass' | 'fail' | 'none' = 'none';
      if (req.kind === 'assess-talk' || req.kind === 'assess-spoken-code') {
        verdict = req.learnerText?.includes('GOOD') ? 'pass' : 'fail';
        text = verdict === 'pass' ? 'You nailed it.' : 'Good start, but one part is off.';
      }
      if (req.kind === 'explain-grade') { verdict = req.grade!.passed ? 'pass' : 'fail'; text = verdict === 'pass' ? 'All tests pass.' : 'Close, look at the first failing test.'; }
      onText(text);
      return { text, meta: { verdict, nailed: ['something right'], fix: verdict === 'fail' ? ['the fix'] : [], highlightLines: [], next: 'stay' } };
    },
    run: (c, s, f) => py.run(c, s, f),
    grade: (c, t) => py.grade(c, t),
    getProgress: () => progress.p,
    setProgress: (p) => { progress.p = p; },
  };
}

for (const concept of Object.values(concepts)) {
  describe(`loop: ${concept!.title}`, () => {
    concept!.lessons.forEach((lesson, i) => {
      it(`${lesson.subskill}: define -> mastered, with one wrong turn looped back`, async () => {
        const prog = { p: emptyProgress() };
        const calls: TutorAsk[] = [];
        const s = new Session(concept!, i, 'type', deps(prog, calls));
        s.start();
        expect(s.state.step).toBe('define');
        expect(s.state.turns[0].text).toBe(lesson.define);
        s.next(); expect(s.state.step).toBe('example');
        s.next(); expect(s.state.step).toBe('walkthrough');
        for (let k = 1; k < lesson.walkthrough.length; k++) s.next();
        expect(s.state.walkLine).toBe(lesson.walkthrough.length);
        s.next(); expect(s.state.step).toBe('talkthrough');
        // no AI calls during scripted steps
        expect(calls.length).toBe(0);

        await s.say('I am not sure');
        expect(s.state.step).toBe('talkthrough'); // loops on a miss
        await s.say('GOOD answer');
        expect(s.state.step).toBe('feedback');
        s.next(); expect(s.state.step).toBe('doit');

        s.setCode(lesson.doit.wrong[0]);
        await s.check();
        expect(s.state.step).toBe('doit'); // wrong code loops
        expect(s.state.lastGrade?.passed).toBe(false);

        s.setCode(lesson.doit.reference);
        await s.check();
        expect(s.state.lastGrade?.passed).toBe(true);
        // talk miss + a failed check means this round wasn't clean: practiced, not mastered yet
        expect(s.state.step).toBe('check');
        expect(sub(prog.p, concept!.id, lesson.subskill).mastered).toBe(false);
      }, 30_000);
    });

    it('a clean round masters the subskill', async () => {
      const prog = { p: emptyProgress() };
      const lesson = concept!.lessons[0];
      const s = new Session(concept!, 0, 'type', deps(prog, []));
      s.start(); s.next(); s.next();
      for (let k = 1; k < lesson.walkthrough.length; k++) s.next();
      s.next();
      await s.say('GOOD');
      s.next();
      s.setCode(lesson.doit.reference);
      await s.check();
      expect(s.state.step).toBe('mastered');
      expect(sub(prog.p, concept!.id, lesson.subskill)).toMatchObject({ streak: 2, typedPass: true, mastered: true });
    }, 30_000);

    it('talk mode grades spoken code and never marks typed mastery', async () => {
      const prog = { p: emptyProgress() };
      const lesson = concept!.lessons[0];
      const calls: TutorAsk[] = [];
      const s = new Session(concept!, 0, 'talk', deps(prog, calls));
      s.start(); s.next(); s.next();
      for (let k = 1; k < lesson.walkthrough.length; k++) s.next();
      s.next();
      await s.say('GOOD');
      s.next();
      await s.say('GOOD code');
      expect(calls.at(-1)?.kind).toBe('assess-spoken-code');
      expect(s.state.step).toBe('check');
      expect(sub(prog.p, concept!.id, lesson.subskill).mastered).toBe(false);
    }, 30_000);
  });
}

// Regression: Run must run exactly the code on screen. (Run on an example once ran the hidden do-it starter,
// which called input() and crashed with EOFError.) Checked for every lesson, on every step, with an empty input box.
for (const concept of Object.values(concepts)) {
  describe(`Run runs what is on screen: ${concept!.title}`, () => {
    concept!.lessons.forEach((lesson, i) => {
      it(`${lesson.subskill}`, async () => {
        const prog = { p: emptyProgress() };
        const ran: string[] = [];
        const d = deps(prog, []);
        const realRun = d.run;
        d.run = (c, s, f) => { ran.push(c); return realRun(c, s, f); };
        const s = new Session(concept!, i, 'type', d);
        s.start();
        await s.run(''); // define: nothing on screen, nothing runs
        expect(ran).toEqual([]);

        const expectExampleRuns = async (where: string) => {
          expect(codeOnScreen(lesson, s.state), where).toBe(lesson.example);
          const r = await s.run('');
          expect(ran.at(-1), where).toBe(lesson.example);
          expect(r?.error, `${where}: ${JSON.stringify(r?.error)}`).toBeUndefined();
        };
        s.next(); await expectExampleRuns('example');
        s.next(); await expectExampleRuns('walkthrough line 1');
        for (let k = 1; k < lesson.walkthrough.length; k++) s.next();
        await expectExampleRuns('last walkthrough line');
        s.next(); await expectExampleRuns('talkthrough');
        await s.say('GOOD answer'); await expectExampleRuns('feedback');

        s.next();
        expect(s.state.step).toBe('doit');
        expect(s.state.lastRun, 'output from the example must not carry into Try it').toBeUndefined();
        expect(codeOnScreen(lesson, s.state)).toBe(lesson.doit.starter);
        s.setCode(lesson.doit.reference);
        const t = lesson.doit.tests.find((x) => !x.hidden) ?? lesson.doit.tests[0];
        const r = await s.run((t.stdin ?? []).join('\n'));
        expect(ran.at(-1)).toBe(lesson.doit.reference);
        expect(r?.error, JSON.stringify(r?.error)).toBeUndefined();
      }, 30_000);
    });
  });
}
