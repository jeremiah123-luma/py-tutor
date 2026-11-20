// The visualizer's trace: frames, objects, references, calls/returns, files, input, errors, runaway loops.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeRunner } from './helpers';
import type { PyRunner } from '../src/runtime/runner';
import type { VizObject, VizStep } from '../src/types';
import { layoutRows } from '../src/ui/VizDiagram';
import { concepts } from '../src/curriculum';
import { runFilesFor } from '../src/loop/engine';

let py: PyRunner;
beforeAll(async () => {
  py = nodeRunner();
  await py.whenReady();
}, 60_000);
afterAll(() => py.dispose());

const glob = (s: VizStep) => Object.fromEntries(s.frames[0].vars);
const obj = (s: VizStep, ref: unknown) => new Map(s.heap).get((ref as ['ref', number])[1]) as VizObject;

describe('visualizer', () => {
  it('draws globals, a dict holding a list, and the final state', async () => {
    const r = await py.visualize('grades = {"amy": [90, 80]}\nx = 5\nalias = grades\n');
    expect(r.error).toBeUndefined();
    const end = r.steps.at(-1)!;
    expect(end.event).toBe('done');
    expect(end.line).toBeNull();
    const g = glob(end);
    expect(g.x).toEqual(['int', '5']);
    expect(g.alias).toEqual(g.grades); // both arrows point to the same dict
    const d = obj(end, g.grades);
    expect(d.kind).toBe('dict');
    if (d.kind === 'dict') expect(obj(end, d.pairs[0][1])).toMatchObject({ kind: 'list', items: [['int', '90'], ['int', '80']] });
  });

  it('shows the arrows: just-ran line and next line', async () => {
    const r = await py.visualize('a = 1\nb = 2\nc = 3\n');
    expect(r.steps.map((s) => [s.prevLine, s.line])).toEqual([[null, 1], [1, 2], [2, 3], [3, null]]);
  });

  it('a call gets its own frame and a return value', async () => {
    const r = await py.visualize('def double(n):\n    return n * 2\n\ny = double(4)\n');
    const call = r.steps.find((s) => s.event === 'call')!;
    expect(call.frames.map((f) => f.name)).toEqual(['Global frame', 'double']);
    expect(Object.fromEntries(call.frames[1].vars).n).toEqual(['int', '4']);
    const ret = r.steps.find((s) => s.event === 'return')!;
    expect(ret.frames[1].returnValue).toEqual(['int', '8']);
    expect(glob(r.steps.at(-1)!).y).toEqual(['int', '8']);
  });

  it('objects of a class show their attributes; the class shows its methods', async () => {
    const r = await py.visualize('class Dog:\n    def __init__(self, name):\n        self.name = name\n\nrex = Dog("Rex")\n');
    const end = r.steps.at(-1)!;
    const g = glob(end);
    expect(obj(end, g.rex)).toMatchObject({ kind: 'instance', label: 'Dog instance', attrs: [['name', ['str', "'Rex'"]]] });
    expect(obj(end, g.Dog)).toMatchObject({ kind: 'class' });
    const cls = obj(end, g.Dog);
    if (cls.kind === 'class') expect(cls.attrs.map((a) => a[0])).toContain('__init__');
    // self inside __init__ points at the same object as rex afterwards
    const inInit = r.steps.find((s) => s.frames.at(-1)?.name === '__init__' && s.event === 'return')!;
    expect(Object.fromEntries(inInit.frames[1].vars).self[0]).toBe('ref');
  });

  it('reads files and input like a real run', async () => {
    const r = await py.visualize('f = open("a.txt")\nline = f.readline().strip()\nf.close()\nn = input("N: ")\nprint(line, n)\n', ['7'], { 'a.txt': 'hello\n' });
    expect(r.error).toBeUndefined();
    expect(r.stdout).toBe('N: 7\nhello 7\n');
    const end = r.steps.at(-1)!;
    expect(obj(end, glob(end).f)).toMatchObject({ kind: 'file', name: 'a.txt', closed: true });
  });

  it('shows the output so far at each step', async () => {
    const r = await py.visualize('print("a")\nprint("b")\n');
    expect(r.steps.map((s) => s.out)).toEqual(['', 'a\n', 'a\nb\n']);
  });

  it('errors end on an error step with the message', async () => {
    const r = await py.visualize('d = {}\nprint(d["x"])\n');
    expect(r.error?.type).toBe('KeyError');
    expect(r.steps.at(-1)!.event).toBe('error');
    expect(r.steps.at(-1)!.exception).toContain('KeyError');
  });

  it('a syntax error has no steps, just the error', async () => {
    const r = await py.visualize('a = [1\n');
    expect(r.steps).toHaveLength(0);
    expect(r.error?.type).toBe('SyntaxError');
  });

  it('a loop that never ends is cut off, and Python still works after', async () => {
    const r = await py.visualize('n = 0\nwhile True:\n    n += 1\n');
    expect(r.stopped).toBe(true);
    expect(r.steps.length).toBe(r.maxSteps);
    expect((await py.run('print(1)')).stdout).toBe('1\n');
  });

  it('a list that contains itself does not hang', async () => {
    const r = await py.visualize('a = [1]\na.append(a)\n');
    const end = r.steps.at(-1)!;
    expect(obj(end, glob(end).a)).toMatchObject({ kind: 'list', items: [['int', '1'], ['ref', expect.any(Number)]] });
  });

  it('objects are laid out in rows following references', async () => {
    const r = await py.visualize('inner = [1]\nouter = {"k": inner}\nlone = (1, 2)\n');
    const rows = layoutRows(r.steps.at(-1)!);
    expect(rows.flat().length).toBe(3);
    expect(rows.length).toBe(3); // inner, outer, lone each referenced from a frame first
  });

  it('every lesson example can be visualized', async () => {
    for (const c of Object.values(concepts)) {
      for (const l of c!.lessons) {
        const r = await py.visualize(l.example, [], runFilesFor(l) ?? {});
        expect(r.error, `${c!.id}: ${l.title}`).toBeUndefined();
        expect(r.steps.at(-1)!.event, l.title).toBe('done');
      }
    }
  }, 120_000);
});
