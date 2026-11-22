import { describe, expect, it } from 'vitest';
import { cleanProgress, mergeProgress } from '../src/loop/mergeProgress';
import { applyCharge, isCapped } from '../worker/budget';
import { gradeFeedback } from '../src/loop/feedback';
import { emptyProgress } from '../src/loop/progress';

describe('progress merge', () => {
  it('an old tab saving later keeps mastery earned on another device', () => {
    const b = emptyProgress();
    b.concepts.dictionaries.basics = { streak: 2, typedPass: true, attempts: 3, mastered: true };
    b.updatedAt = 1000;
    const a = emptyProgress();
    a.concepts.files.read = { streak: 0, typedPass: false, attempts: 1, mastered: false };
    a.updatedAt = 2000;
    const m = mergeProgress(b, a);
    expect(m.concepts.dictionaries.basics.mastered).toBe(true);
    expect(m.concepts.files.read.attempts).toBe(1);
  });
  it('junk and far-future timestamps are cleaned', () => {
    const c = cleanProgress({ junk: 1, updatedAt: 8.64e15, concepts: { files: { x: { streak: 'a', mastered: 'yes' } } } });
    expect(c.updatedAt).toBeLessThan(Date.now() + 120_000);
    expect(c.concepts.files.x).toEqual({ streak: 0, typedPass: false, attempts: 0, mastered: false });
    expect(cleanProgress(null).concepts.dictionaries).toEqual({});
  });
});

describe('extra credit', () => {
  it('a $1 bonus buys a full extra $1', () => {
    let spent = 0;
    let bonus = 1;
    for (let k = 0; k < 19; k++) {
      expect(isCapped(spent, 1, bonus, 0, 30)).toBe(false);
      ({ spentToday: spent, bonus } = applyCharge(spent, 1, bonus, 0.1));
    }
    expect(spent).toBeCloseTo(1.9);
    expect(isCapped(spent, 1, bonus, 0, 30)).toBe(false);
    ({ spentToday: spent, bonus } = applyCharge(spent, 1, bonus, 0.1));
    expect(isCapped(spent, 1, bonus, 0, 30)).toBe(true);
  });
});

describe('input() prompt text', () => {
  it('names the cause', () => {
    const fb = gradeFeedback(
      { passed: false, bannedUsed: [], results: [{ name: 'Paris', passed: false, expected: 'Paris', got: 'Enter a country: Paris' }] } as any,
      'country = input("Enter a country: ")\nprint(country)',
    );
    expect(fb.text).toMatch(/plain input\(\)/);
  });
});

describe('bug-hunt fixes', () => {
  it('caps everyone (without extra credit) once the class has used its share of the day', () => {
    // personal allowance not reached, but the class already spent today's share
    expect(isCapped(0.1, 3, 0, 5, 30, 1.2, 1.0)).toBe(true);
    expect(isCapped(0.1, 3, 0, 5, 30, 0.5, 1.0)).toBe(false);
    // approved extra credit still works
    expect(isCapped(0.1, 3, 0.5, 5, 30, 1.2, 1.0)).toBe(false);
    // the month running out always caps
    expect(isCapped(0, 3, 0.5, 30, 30, 0, 1)).toBe(true);
  });

  it('ignores lesson names that collide with built-in object properties', () => {
    const p = cleanProgress({ concepts: { files: { toString: { attempts: 2 }, __proto__: { attempts: 1 }, 'read-lines': { attempts: 1 } } }, updatedAt: 1 });
    expect(Object.keys(p.concepts.files)).toEqual(['read-lines']);
    const merged = mergeProgress(cleanProgress(null), cleanProgress({ concepts: { files: { constructor: { attempts: 3 } } }, updatedAt: 1 }));
    expect(Object.keys(merged.concepts.files)).toEqual([]);
  });
});
