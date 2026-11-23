// A passed solution can't be re-checked into mastery, and a check finishing late doesn't yank him off Quick check.
import { describe, expect, it } from 'vitest';
import { Session, type EngineDeps } from '../src/loop/engine';
import { emptyProgress, sub } from '../src/loop/progress';
import { concepts } from '../src/curriculum';
import type { GradeResult, Progress } from '../src/types';

const pass: GradeResult = { passed: true, results: [{ name: 't', passed: true, hidden: false }], bannedUsed: [] };
function deps(prog: { p: Progress }, store: { v: string | null }, grade: () => Promise<GradeResult> = async () => pass): EngineDeps {
  return {
    tutor: async () => ({ text: 'ok', meta: { verdict: 'none', nailed: [], fix: [], highlightLines: [], next: 'stay' } as never }),
    run: async () => ({}) as never,
    grade,
    getProgress: () => prog.p,
    setProgress: (p) => (prog.p = p),
    draft: { load: () => store.v, save: (c) => (store.v = c), clear: () => (store.v = null) },
  };
}
const c = concepts.dictionaries!;

describe('drafts after a pass', () => {
  it('a new visit after a clean pass starts from the starter, so pressing Check alone does not master it', async () => {
    const prog = { p: emptyProgress() }, store = { v: null as string | null };
    const a = new Session(c, 0, 'type', deps(prog, store));
    a.start();
    a.goTo('doit');
    a.setCode('my passing code');
    await a.check();
    expect(sub(prog.p, c.id, c.lessons[0].subskill).streak).toBe(1);
    a.setCode('my passing code '); // a tweak on the pass screen
    expect(store.v).toBeNull();
    const b = new Session(c, 0, 'type', deps(prog, store));
    b.start();
    b.goTo('doit');
    expect(b.state.code).toBe(c.lessons[0].doit.starter);
  });
  it('a check that finishes after he jumped to Quick check leaves him on Quick check', async () => {
    const prog = { p: emptyProgress() }, store = { v: null as string | null };
    let done!: (g: GradeResult) => void;
    const s = new Session(c, 0, 'type', deps(prog, store, () => new Promise((r) => (done = r))));
    s.start();
    s.goTo('doit');
    const checking = s.check();
    s.goTo('quiz');
    done(pass);
    await checking;
    expect(s.state.step).toBe('quiz');
    expect(sub(prog.p, c.id, c.lessons[0].subskill).attempts).toBe(1);
  });
});
