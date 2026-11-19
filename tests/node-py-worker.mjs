// Node worker_threads twin of src/runtime/py.worker.ts, for tests.
import { parentPort } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { loadPyodide } from 'pyodide';

const source = readFileSync(new URL('../src/runtime/harness.py', import.meta.url), 'utf8');
const ready = (async () => {
  const py = await loadPyodide();
  await py.runPythonAsync(source);
  const handle = py.globals.get('handle');
  return (req) => {
    const t0 = performance.now();
    const raw = JSON.parse(handle(JSON.stringify(req)));
    return req.kind === 'run' ? { ...raw, timedOut: false, ms: Math.round(performance.now() - t0) } : raw;
  };
})();
ready.then(() => parentPort.postMessage({ type: 'ready' }), (e) => parentPort.postMessage({ type: 'fatal', message: String(e) }));
parentPort.on('message', async ({ id, req }) => {
  try { parentPort.postMessage({ type: 'result', id, result: (await ready)(req) }); }
  catch (e) { parentPort.postMessage({ type: 'result', id, error: String(e) }); }
});
