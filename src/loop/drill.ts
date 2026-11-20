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

/** Deterministic when given a seeded rand (tests); Math.random otherwise. */
export function buildDrill(bank: DrillQuestion[], concepts: Concept[], rand: () => number = Math.random): Drill {
  const ids = concepts.map((c) => c.id);
  const byConcept = ids.map((id) => shuffle(bank.filter((q) => q.concept === id), rand));
  const short: DrillQuestion[] = [];
  // round-robin so every concept is represented evenly
  for (let i = 0; short.length < 16 && byConcept.some((l) => l.length > i); i++) {
    for (const list of byConcept) if (list[i] && short.length < 16) short.push(list[i]);
  }
  const twoConcepts = shuffle(concepts, rand).slice(0, 2);
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
