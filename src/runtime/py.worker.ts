/// <reference lib="webworker" />
// Browser Web Worker: loads Pyodide once, then answers run/grade requests.
import { loadPyodide } from 'pyodide';
import { setupHarness, type PyRequest } from './core';
import harnessSource from './harness.py?raw';

const ready = (async () => {
  const py = await loadPyodide({ indexURL: `${self.location.origin}/pyodide/` });
  return setupHarness(py, harnessSource);
})();

self.postMessage({ type: 'booting' });
ready.then(
  () => self.postMessage({ type: 'ready' }),
  (e) => self.postMessage({ type: 'fatal', message: String(e) }),
);

self.onmessage = async (ev: MessageEvent<{ id: number; req: PyRequest }>) => {
  const { id, req } = ev.data;
  try {
    const exec = await ready;
    self.postMessage({ type: 'result', id, result: exec(req) });
  } catch (e) {
    self.postMessage({ type: 'result', id, error: String(e) });
  }
};
