import { describe, expect, it } from 'vitest';
import { gradeFeedback } from '../src/loop/feedback';

const g = (results: any[], bannedUsed: string[] = []) => ({ passed: results.every((r) => r.passed) && !bannedUsed.length, results, bannedUsed });

describe('free Check my code feedback', () => {
  it('a pass says so', () => {
    expect(gradeFeedback(g([{ name: 'a', passed: true, hidden: false }])).text).toMatch(/All 1 tests pass/);
  });
  it('points to the first differing line', () => {
    const fb = gradeFeedback(g([{ name: 'sample', passed: false, hidden: false, expected: 'a 1\nb 2\n', got: 'a 1\nb 3\n' }]));
    expect(fb.fix[0]).toContain('line 2');
    expect(fb.fix[0]).toContain('b 3');
  });
  it('names the error', () => {
    const fb = gradeFeedback(g([{ name: 'sample', passed: false, hidden: false, error: 'Traceback...\nKeyError: \'x\'' }]));
    expect(fb.fix[0]).toContain("KeyError: 'x'");
  });
  it('hidden failures suggest other inputs, without leaking the test', () => {
    const fb = gradeFeedback(g([{ name: 'sample', passed: true, hidden: false }, { name: 'empty', passed: false, hidden: true, expected: 'x', got: 'y' }]));
    expect(fb.fix[0]).toMatch(/hidden test/);
    expect(fb.nailed[0]).toBe('1 of 2 tests pass.');
  });
  it('flags constructs the final does not allow', () => {
    expect(gradeFeedback(g([{ name: 'a', passed: true, hidden: false }], ['lambda'])).fix[0]).toContain('lambda');
  });
  it('spacing-only differences are called out', () => {
    expect(gradeFeedback(g([{ name: 's', passed: false, hidden: false, expected: 'a b', got: 'a  b' }])).fix[0]).toMatch(/spaces/);
  });
});
