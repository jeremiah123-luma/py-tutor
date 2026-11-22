// Exam Drill: 16 short questions + 2 coding problems, mixed across concepts, like the midterms.
import type { Concept, ConceptId, DrillQuestion, Problem } from '../types';

export interface Drill {
  short: DrillQuestion[];
  coding: { concept: ConceptId; problem: Problem }[];
  minutes: number;
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * Deterministic when given a seeded rand (tests); Math.random otherwise. `concepts` are the final's main topics;
 * `review` is a pool of questions from earlier topics, and 3 of them take the place of 3 main-topic questions
 * (the final is cumulative, but leans on the main three).
 */
export function buildDrill(bank: DrillQuestion[], concepts: Concept[], rand: () => number = Math.random, review: DrillQuestion[] = []): Drill {
  const ids = concepts.map((c) => c.id);
  const byConcept = ids.map((id) => shuffle(bank.filter((q) => q.concept === id), rand));
  const short: DrillQuestion[] = [];
  const fromReview = Math.min(3, review.length);
  const main = 16 - fromReview;
  // round-robin so every concept is represented evenly
  for (let i = 0; short.length < main && byConcept.some((l) => l.length > i); i++) {
    for (const list of byConcept) if (list[i] && short.length < main) short.push(list[i]);
  }
  // one each from different earlier topics where possible
  const seen = new Set<string>();
  for (const q of shuffle(review, rand)) {
    if (short.length >= 16) break;
    if (seen.has(q.concept) && seen.size < new Set(review.map((r) => r.concept)).size) continue;
    seen.add(q.concept);
    short.push(q);
  }
  const twoConcepts = shuffle(concepts.filter((c) => c.lessons.length > 0), rand).slice(0, 2);
  const coding = twoConcepts.map((c) => {
    const lessons = c.lessons.slice(-3); // the harder, later lessons
    const l = lessons[Math.floor(rand() * lessons.length)];
    return { concept: c.id, problem: l.doit };
  });
  return { short: shuffle(short, rand), coding, minutes: 90 };
}

export function checkShort(q: DrillQuestion, answer: string | number): boolean {
  if (q.kind === 'predict') {
    // Forgiving about typing, strict about Python: ignore trailing spaces, blank lines at the ends,
    // and ' vs " (Python prints dicts with ', people often type ").
    const norm = (s: string) =>
      s.replace(/\r/g, '').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '').replace(/"/g, "'");
    return norm(String(answer)) === norm(String(q.answer));
  }
  return Number(answer) === Number(q.answer);
}
