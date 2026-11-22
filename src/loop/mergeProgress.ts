// Merging progress from two devices (or an old tab and a new one). Used by the Worker on every save and by the
// app when it loads, so nothing earned anywhere is ever lost: mastery and the typed pass are kept if either side
// has them, and the side with more attempts on a lesson has the newer streak.
import type { Progress, QuizScore, SubskillProgress } from '../types';
import { betterQuiz } from './quizScore';
import { CONCEPT_IDS, emptyConcepts } from '../curriculum/ids';

const CONCEPTS = CONCEPT_IDS;
const LOOP_STEPS = new Set(['define', 'example', 'walkthrough', 'talkthrough', 'feedback', 'doit', 'check', 'mastered', 'quiz']);

function cleanSub(v: unknown): SubskillProgress | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1e6, Math.floor(x))) : 0);
  return { streak: n(o.streak), typedPass: o.typedPass === true, attempts: n(o.attempts), mastered: o.mastered === true };
}

/** Accept only the shape the app writes; anything else becomes empty progress instead of a crash later. */
export function cleanProgress(v: unknown): Progress {
  const out: Progress = { concepts: emptyConcepts<SubskillProgress>(), updatedAt: 0 };
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, any>;
  const at = Number(o.updatedAt);
  out.updatedAt = Number.isFinite(at) ? Math.min(Math.max(0, at), Date.now() + 60_000) : 0; // a clock running ahead can't win forever
  for (const c of CONCEPTS) {
    const subs = o.concepts?.[c];
    if (!subs || typeof subs !== 'object') continue;
    for (const [k, sv] of Object.entries(subs).slice(0, 50)) {
      const s = cleanSub(sv);
      // names like toString or __proto__ would collide with built-in object properties
      if (s && /^[\w-]{1,40}$/.test(k) && !(k in Object.prototype)) out.concepts[c][k] = s;
    }
  }
  for (const c of CONCEPTS) {
    const qs = o.quiz?.[c];
    if (!qs || typeof qs !== 'object') continue;
    for (const [k, qv] of Object.entries(qs).slice(0, 50)) {
      const q = qv as Record<string, unknown> | null;
      const of = Number(q?.of), best = Number(q?.best);
      if (!/^[\w-]{1,40}$/.test(k) || k in Object.prototype) continue;
      if (!Number.isInteger(of) || !Number.isInteger(best) || of < 1 || of > 50 || best < 0 || best > of) continue;
      (out.quiz ??= {})[c] = { ...out.quiz[c], [k]: { best, of } satisfies QuizScore };
    }
  }
  const l = o.last;
  if (l && CONCEPTS.includes(l.concept) && typeof l.subskill === 'string' && l.subskill.length <= 40 && LOOP_STEPS.has(l.step))
    out.last = { concept: l.concept, subskill: l.subskill, step: l.step };
  return out;
}

function mergeSub(a: SubskillProgress | undefined, b: SubskillProgress | undefined): SubskillProgress {
  if (!a) return b!;
  if (!b) return a;
  const newer = b.attempts > a.attempts || (b.attempts === a.attempts && b.streak > a.streak) ? b : a;
  return {
    streak: newer.streak,
    typedPass: a.typedPass || b.typedPass,
    attempts: Math.max(a.attempts, b.attempts),
    mastered: a.mastered || b.mastered,
  };
}

const own = <T,>(o: Record<string, T> | undefined, k: string) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

export function mergeProgress(a: Progress, b: Progress): Progress {
  const out: Progress = { concepts: emptyConcepts<SubskillProgress>(), updatedAt: Math.max(a.updatedAt, b.updatedAt) };
  for (const c of CONCEPTS) {
    const keys = new Set([...Object.keys(a.concepts[c] ?? {}), ...Object.keys(b.concepts[c] ?? {})]);
    for (const k of keys) out.concepts[c][k] = mergeSub(own(a.concepts[c], k), own(b.concepts[c], k));
  }
  for (const c of CONCEPTS) {
    const qa = a.quiz?.[c], qb = b.quiz?.[c];
    const keys = new Set([...Object.keys(qa ?? {}), ...Object.keys(qb ?? {})]);
    for (const k of keys) {
      const best = betterQuiz(own(qa, k), own(qb, k));
      if (best) (out.quiz ??= {})[c] = { ...out.quiz[c], [k]: best };
    }
  }
  const last = (b.updatedAt >= a.updatedAt ? b.last : a.last) ?? a.last ?? b.last;
  if (last) out.last = last;
  return out;
}

export const sameProgress = (a: Progress, b: Progress) =>
  JSON.stringify(a.concepts) === JSON.stringify(b.concepts) && JSON.stringify(a.quiz ?? {}) === JSON.stringify(b.quiz ?? {});
