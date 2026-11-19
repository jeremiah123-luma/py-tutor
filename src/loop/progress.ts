// Mastery model + persistence (IndexedDB first, mirrored to the Worker).
import { get, set } from 'idb-keyval';
import type { ConceptId, LoopStep, Progress, SubskillProgress } from '../types';
import { pullProgress, pushProgress } from './api';

const KEY = 'progress-v1';

export function emptyProgress(): Progress {
  return { concepts: { dictionaries: {}, files: {}, classes: {} }, updatedAt: 0 };
}

export function sub(p: Progress, c: ConceptId, s: string): SubskillProgress {
  return p.concepts[c][s] ?? { streak: 0, typedPass: false, attempts: 0, mastered: false };
}

/**
 * Record one graded attempt.
 * clean = passed on the first try of this round without hints.
 * Mastered = 2 clean passes in a row, at least one typed.
 */
export function record(
  p: Progress,
  c: ConceptId,
  s: string,
  r: { passed: boolean; clean: boolean; typed: boolean },
): Progress {
  const cur = sub(p, c, s);
  const streak = r.passed && r.clean ? cur.streak + 1 : r.passed ? cur.streak : 0;
  const typedPass = cur.typedPass || (r.passed && r.typed);
  const next: SubskillProgress = {
    streak,
    typedPass,
    attempts: cur.attempts + 1,
    mastered: cur.mastered || (streak >= 2 && typedPass),
  };
  return { ...p, concepts: { ...p.concepts, [c]: { ...p.concepts[c], [s]: next } }, updatedAt: Date.now() };
}

export function withLast(p: Progress, concept: ConceptId, subskill: string, step: LoopStep): Progress {
  return { ...p, last: { concept, subskill, step }, updatedAt: Date.now() };
}

export async function loadProgress(): Promise<Progress> {
  let local: Progress | undefined;
  try {
    local = await get<Progress>(KEY);
  } catch {
    /* IndexedDB blocked */
  }
  const remote = await pullProgress();
  const best = [local, remote].filter(Boolean).sort((a, b) => b!.updatedAt - a!.updatedAt)[0];
  return best ?? emptyProgress();
}

export async function saveProgress(p: Progress) {
  try {
    await set(KEY, p);
  } catch {
    /* ignore */
  }
  void pushProgress(p);
}

/** Subskills that were attempted but not mastered come back first. */
export function reviewQueue(p: Progress): { concept: ConceptId; subskill: string }[] {
  const out: { concept: ConceptId; subskill: string }[] = [];
  for (const c of Object.keys(p.concepts) as ConceptId[]) {
    for (const [s, v] of Object.entries(p.concepts[c])) if (v.attempts > 0 && !v.mastered) out.push({ concept: c, subskill: s });
  }
  return out;
}
