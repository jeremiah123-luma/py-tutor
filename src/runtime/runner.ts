// Main-thread runner: owns a live worker plus a pre-warmed spare.
// A run that exceeds the time limit kills its worker; the spare takes over instantly.
import type { GradeResult, RunResult, TestCase } from '../types';
import type { PyRequest, PyResponse } from './core';

export interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
  onmessage: ((ev: { data: any }) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

interface Slot {
  w: WorkerLike;
  ready: Promise<void>;
  pending: Map<number, (r: { result?: PyResponse; error?: string }) => void>;
}

export const RUN_LIMIT_MS = 3000;

export class PyRunner {
  private live: Slot;
  private spare: Slot;
  private nextId = 1;

  private factory: WorkerFactory;
  private limitMs: number;

  constructor(factory: WorkerFactory, limitMs = RUN_LIMIT_MS) {
    this.factory = factory;
    this.limitMs = limitMs;
    this.live = this.spawn();
    this.spare = this.spawn();
  }

  private spawn(): Slot {
    const w = this.factory();
    const pending = new Map<number, (r: { result?: PyResponse; error?: string }) => void>();
    let resolveReady!: () => void;
    let rejectReady!: (e: Error) => void;
    const ready = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') resolveReady();
      else if (m.type === 'fatal') rejectReady(new Error(m.message));
      else if (m.type === 'result') {
        pending.get(m.id)?.(m);
        pending.delete(m.id);
      }
    };
    return { w, ready, pending };
  }

  /** Resolves once Python is loaded in the live worker. */
  whenReady() {
    return this.live.ready;
  }

  private async send(req: PyRequest, limitMs: number): Promise<PyResponse | 'timeout'> {
    const slot = this.live;
    await slot.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        slot.pending.delete(id);
        slot.w.terminate();
        // promote the spare, warm a new one
        this.live = this.spare;
        this.spare = this.spawn();
        resolve('timeout');
      }, limitMs);
      slot.pending.set(id, (m) => {
        clearTimeout(timer);
        if (m.error) reject(new Error(m.error));
        else resolve(m.result!);
      });
      slot.w.postMessage({ id, req });
    });
  }

  async run(code: string, stdin?: string[], files?: Record<string, string>, trace = false): Promise<RunResult> {
    const r = await this.send({ kind: 'run', code, stdin, files, trace }, this.limitMs);
    if (r === 'timeout') {
      return {
        stdout: '',
        stderr: '',
        timedOut: true,
        files: {},
        ms: this.limitMs,
        error: {
          type: 'Timeout',
          message: `Stopped after ${this.limitMs / 1000} seconds`,
          friendly:
            "Your program ran too long, so I stopped it. Usually that's a loop that never ends. Check that the loop's condition can become False.",
        },
      };
    }
    return r as RunResult;
  }

  /** One request per test, so one runaway loop fails only its own test. */
  async grade(code: string, tests: TestCase[], extraAllowed?: string[]): Promise<GradeResult> {
    const results: GradeResult['results'] = [];
    let bannedUsed: string[] | null = null;
    for (const t of tests) {
      const r = await this.send({ kind: 'grade', code, tests: [t], extraAllowed }, this.limitMs);
      if (r === 'timeout') {
        results.push({ name: t.name, passed: false, hidden: !!t.hidden, error: 'Timed out: a loop probably never ends.' });
        continue;
      }
      const g = r as GradeResult;
      results.push(g.results[0]);
      bannedUsed ??= g.bannedUsed;
    }
    const banned = bannedUsed ?? [];
    return { passed: results.every((x) => x.passed) && banned.length === 0, results, bannedUsed: banned };
  }

  dispose() {
    this.live.w.terminate();
    this.spare.w.terminate();
  }
}

export function browserRunner() {
  return new PyRunner(
    () => new Worker(new URL('./py.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  );
}
