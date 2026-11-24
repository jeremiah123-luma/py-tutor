// Mastery model + persistence (IndexedDB first, mirrored to the Worker).
import { get, set } from 'idb-keyval';
import type { ConceptId, LoopStep, Progress, QuizScore, SubskillProgress } from '../types';
import { pullProgress, pushProgress } from './api';
import { cleanProgress, mergeProgress, sameProgress } from './mergeProgress';
import { betterQuiz } from './quizScore';
import { emptyConcepts } from '../curriculum/ids';
export { betterQuiz, isPerfect } from './quizScore';

const KEY = 'progress-v1';
let who = '';
/** Progress on this device is kept per account, so two people sharing a laptop don't mix. */
export function setProgressUser(id: string) {
  who = id;
}
const localKey = () => (who ? `${KEY}:${who}` : KEY);

export function emptyProgress(): Progress {
  return { concepts: emptyConcepts<SubskillProgress>(), updatedAt: 0 };
}

export function sub(p: Progress, c: ConceptId, s: string): SubskillProgress {
  return p.concepts[c]?.[s] ?? { streak: 0, typedPass: false, attempts: 0, mastered: false };
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

export function quizScore(p: Progress, c: ConceptId, s: string): QuizScore | undefined {
  const q = p.quiz?.[c];
  return q && Object.hasOwn(q, s) ? q[s] : undefined;
}

/** Save one finished Quick check, keeping the best. */
export function recordQuiz(p: Progress, c: ConceptId, s: string, right: number, of: number): Progress {
  const best = betterQuiz(quizScore(p, c, s), { best: right, of });
  return { ...p, quiz: { ...p.quiz, [c]: { ...p.quiz?.[c], [s]: best! } }, updatedAt: Date.now() };
}

export function withLast(p: Progress, concept: ConceptId, subskill: string, step: LoopStep, line = 0): Progress {
  const prev = p.spots?.[concept];
  // the Learn slide he was on is kept while he's still on Learn in the same lesson
  const slide = prev && prev.subskill === subskill && prev.step === 'define' && step === 'define' ? prev.slide : 0;
  const at = Date.now();
  return { ...p, last: { concept, subskill, step }, spots: { ...p.spots, [concept]: { subskill, step, slide, line, at } }, updatedAt: at };
}

/** Remember which Learn slide he is on. */
export function withSlide(p: Progress, concept: ConceptId, subskill: string, slide: number): Progress {
  const prev = p.spots?.[concept];
  if (!prev || prev.subskill !== subskill || prev.step !== 'define' || prev.slide === slide) return p;
  const at = Date.now();
  return { ...p, spots: { ...p.spots, [concept]: { ...prev, slide, at } }, updatedAt: at };
}

/** Where to pick a lesson back up, if he stopped part-way through this exact lesson. */
export function spotFor(p: Progress, concept: ConceptId, subskill: string) {
  const s = p.spots?.[concept];
  return s && s.subskill === subskill ? s : undefined;
}

export async function loadProgress(): Promise<Progress> {
  let local: Progress | undefined;
  try {
    local = await get<Progress>(localKey());
  } catch {
    /* IndexedDB blocked */
  }
  const remote = await pullProgress();
  // Merge, never pick one: this device may have earned things the account copy doesn't have yet (offline, or a
  // session that expired), and the account may have things from another device.
  const r = remote ? cleanProgress(remote) : null;
  const merged = mergeProgress(local ? cleanProgress(local) : emptyProgress(), r ?? emptyProgress());
  if (local && (!r || !sameProgress(merged, r))) void pushProgress(merged);
  return merged;
}

// Uploads wait for a short pause (clicking through steps saves several times a second, and the server's store
// takes about one write a second per account). The newest copy always wins, and leaving the page sends it at once.
let pending: Progress | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
function flush(): Promise<void> {
  clearTimeout(timer);
  if (!pending) return Promise.resolve();
  const p = pending;
  pending = null;
  return pushProgress(p);
}
/** Send any waiting progress now (before signing out, so it lands in the right account). */
export const flushProgress = () => flush();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => void (document.visibilityState === 'hidden' && flush()));
}

export async function saveProgress(p: Progress) {
  try {
    await set(localKey(), p);
  } catch {
    /* ignore */
  }
  pending = p;
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), 1200);
}

/** Subskills that were attempted but not mastered come back first. */
export function reviewQueue(p: Progress): { concept: ConceptId; subskill: string }[] {
  const out: { concept: ConceptId; subskill: string }[] = [];
  for (const c of Object.keys(p.concepts) as ConceptId[]) {
    for (const [s, v] of Object.entries(p.concepts[c])) if (v.attempts > 0 && !v.mastered) out.push({ concept: c, subskill: s });
  }
  return out;
}
