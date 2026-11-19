import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeRunner } from './helpers';
import type { PyRunner } from '../src/runtime/runner';

let py: PyRunner;
beforeAll(async () => {
  py = nodeRunner();
  await py.whenReady();
}, 60_000);
afterAll(() => py.dispose());

describe('runtime', () => {
  it('runs dictionary code', async () => {
    const r = await py.run('d={"a":1}; d["b"]=2; print(d)');
    expect(r.stdout).toBe("{'a': 1, 'b': 2}\n");
    expect(r.error).toBeUndefined();
  });

  it('feeds input() from the given lines (prompt printed, input not echoed)', async () => {
    const r = await py.run('name = input("Name: ")\nprint("Hi", name)', ['Jeremy']);
    expect(r.stdout).toBe('Name: Hi Jeremy\n');
  });

  it('reports running out of input kindly', async () => {
    const r = await py.run('a = input()\nb = input()', ['1']);
    expect(r.error?.type).toBe('EOFError');
    expect(r.error?.line).toBe(2);
  });

  it('reads seeded files and writes new ones', async () => {
    const code = 'with open("grades.txt") as f:\n    total = sum(int(x) for x in f.read().split())\nwith open("out.txt","w") as f:\n    f.write(str(total))';
    const r = await py.run(code, [], { 'grades.txt': '90 80\n70' });
    expect(r.error).toBeUndefined();
    expect(r.files['out.txt']).toBe('240');
  });

  it('does not leak files between runs', async () => {
    await py.run('open("leak.txt","w").write("x")');
    const r = await py.run('import os\nprint(os.path.exists("leak.txt"))');
    expect(r.stdout).toBe('False\n');
  });

  it('explains a KeyError on the right line', async () => {
    const r = await py.run('d = {}\nprint(d["missing"])');
    expect(r.error).toMatchObject({ type: 'KeyError', line: 2 });
    expect(r.error?.friendly).toMatch(/get\(\)/);
  });

  it('stops an infinite loop and keeps working after', async () => {
    const t0 = Date.now();
    const r = await py.run('while True:\n    pass');
    expect(r.timedOut).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3500);
    const r2 = await py.run('print(2 + 2)');
    expect(r2.stdout).toBe('4\n');
  }, 20_000);
});

describe('grader', () => {
  const tests = [
    { name: 'counts words', stdin: ['a b a'], expectStdout: "{'a': 2, 'b': 1}" },
    { name: 'empty line', stdin: [''], expectStdout: '{}', hidden: true },
  ];
  const good = 'words = input().split()\ncounts = {}\nfor w in words:\n    if w in counts:\n        counts[w] += 1\n    else:\n        counts[w] = 1\nprint(counts)';

  it('passes a correct solution', async () => {
    const g = await py.grade(good, tests);
    expect(g.passed).toBe(true);
  });

  it('fails a wrong one with expected vs got', async () => {
    const g = await py.grade('print({})', tests);
    expect(g.passed).toBe(false);
    expect(g.results[0]).toMatchObject({ passed: false, got: '{}\n' });
  });

  it('flags constructs outside CS 100', async () => {
    const g = await py.grade('words = input().split()\nprint({w: words.count(w) for w in words})', tests);
    expect(g.bannedUsed).toContain('dict comprehension');
    expect(g.passed).toBe(false);
  });

  it('supports call checks for classes', async () => {
    const code = 'class Dog:\n    def __init__(self, name):\n        self.name = name\n    def speak(self):\n        return self.name + " says woof"';
    const g = await py.grade(code, [{ name: 'speak', check: 'assert Dog("Rex").speak() == "Rex says woof", "speak() should return the name + says woof"' }]);
    expect(g.passed).toBe(true);
    const bad = await py.grade(code.replace('" says woof"', '" woof"'), [{ name: 'speak', check: 'assert Dog("Rex").speak() == "Rex says woof", "speak() should return the name + says woof"' }]);
    expect(bad.results[0].error).toMatch(/says woof/);
  });

  it('fails only the runaway test', async () => {
    const code = 'n = int(input())\nwhile n != 0:\n    n -= 2\nprint("done")';
    const g = await py.grade(code, [
      { name: 'even', stdin: ['4'], expectStdout: 'done' },
      { name: 'odd', stdin: ['3'], expectStdout: 'done' },
    ]);
    expect(g.results.map((r) => r.passed)).toEqual([true, false]);
  }, 20_000);

  it('checks files the program writes', async () => {
    const g = await py.grade('with open("o.txt","w") as f:\n    f.write("hi\\n")', [{ name: 'writes', expectFiles: { 'o.txt': 'hi' } }]);
    expect(g.passed).toBe(true);
  });
});
