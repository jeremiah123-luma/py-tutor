import { Worker } from 'node:worker_threads';
import { PyRunner, type WorkerLike } from '../src/runtime/runner';

export function nodeRunner(limitMs?: number) {
  return new PyRunner(() => {
    const w = new Worker(new URL('./node-py-worker.mjs', import.meta.url));
    const like: WorkerLike = {
      onmessage: null,
      postMessage: (m) => w.postMessage(m),
      terminate: () => void w.terminate(),
    };
    w.on('message', (data) => like.onmessage?.({ data }));
    return like;
  }, limitMs);
}
