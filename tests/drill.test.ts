// Every drill answer must be right before Jeremy sees it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeRunner } from './helpers';
import { drill } from '../src/curriculum/drill';
import type { PyRunner } from '../src/runtime/runner';

let py: PyRunner;
beforeAll(async () => {
  py = nodeRunner();
  await py.whenReady();
}, 60_000);
afterAll(() => py.dispose());

const trim = (s: string) => s.replace(/\n+$/, '');

describe('exam drill', () => {
  it('has unique ids and about 10 questions per concept', () => {
    expect(new Set(drill.map((q) => q.id)).size).toBe(drill.length);
    for (const c of ['dictionaries', 'files', 'classes'] as const) {
      expect(drill.filter((q) => q.concept === c).length).toBeGreaterThanOrEqual(8);
    }
  });

  for (const q of drill) {
    if (q.kind === 'predict') {
      it(`${q.id}: answer matches the real output`, async () => {
        expect(typeof q.answer).toBe('string');
        expect(q.code).toBeTruthy();
        const r = await py.run(q.code!, [], q.files);
        expect(r.error, JSON.stringify(r.error)).toBeUndefined();
        expect(trim(r.stdout)).toBe(trim(q.answer as string));
      });
    } else {
      it(`${q.id}: answer is a valid choice`, () => {
        expect(Number.isInteger(q.answer)).toBe(true);
        expect(q.choices?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(q.answer as number).toBeGreaterThanOrEqual(0);
        expect(q.answer as number).toBeLessThan(q.choices!.length);
      });
    }
  }
});

import { buildDrill, checkShort } from '../src/loop/drill';
import { concepts as allConcepts } from '../src/curriculum';
import { drill as bank } from '../src/curriculum/drill';
describe('drill builder', () => {
  it('builds 16 short + 2 coding, every concept represented', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const d = buildDrill(bank, Object.values(allConcepts) as any, rand);
    expect(d.short.length).toBe(16);
    expect(new Set(d.short.map((q) => q.id)).size).toBe(16);
    expect(d.coding.length).toBe(2);
    for (const c of ['dictionaries', 'files', 'classes']) expect(d.short.filter((q) => q.concept === c).length).toBeGreaterThanOrEqual(5);
  });
  it('checks predict answers ignoring trailing whitespace', () => {
    const q = bank.find((x) => x.kind === 'predict')!;
    expect(checkShort(q, String(q.answer) + '\n  ')).toBe(true);
    expect(checkShort(q, 'nope')).toBe(false);
  });
});

describe('checkShort is forgiving about typing', () => {
  it('accepts double quotes for a printed dict, trailing spaces, and blank edge lines', async () => {
    const { checkShort } = await import('../src/loop/drill');
    const q = { id: 'x', concept: 'dictionaries', kind: 'predict', prompt: '', answer: "{'a': 1}\n2", explain: '' } as const;
    expect(checkShort(q as never, '{"a": 1}\n2')).toBe(true);
    expect(checkShort(q as never, "\n{'a': 1}  \n2\n\n")).toBe(true);
    expect(checkShort(q as never, "{'a': 2}\n2")).toBe(false);
  });
});
