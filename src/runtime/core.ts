// Environment-neutral Pyodide wrapper: used by the browser worker and by Node tests.
import type { PyodideInterface } from 'pyodide';
import type { GradeResult, RunResult, TestCase } from '../types';

export type PyRequest =
  | { kind: 'run'; code: string; stdin?: string[]; files?: Record<string, string> }
  | { kind: 'grade'; code: string; tests: TestCase[]; extraAllowed?: string[] };

export type PyResponse = RunResult | GradeResult;

export async function setupHarness(py: PyodideInterface, source: string) {
  await py.runPythonAsync(source);
  const handle = py.globals.get('handle') as (s: string) => string;
  return (req: PyRequest): PyResponse => {
    const t0 = performance.now();
    const raw = JSON.parse(handle(JSON.stringify(req)));
    if (req.kind === 'run') {
      return { ...raw, timedOut: false, ms: Math.round(performance.now() - t0) } as RunResult;
    }
    return raw as GradeResult;
  };
}
