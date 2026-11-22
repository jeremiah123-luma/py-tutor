// Every topic, in the order the course teaches it (zyBooks Modules 2 to 11). Shared by the app and the Worker, so
// no browser imports here. The final covers all of them but leans on the last three (FOCUS), which Home puts first.
export const CONCEPT_IDS = [
  'basics',
  'strings-lists',
  'branching',
  'for-loops',
  'functions',
  'str-methods',
  'while-loops',
  'files',
  'dictionaries',
  'classes',
] as const;

export type ConceptId = (typeof CONCEPT_IDS)[number];

/** The final's main topics: first on Home, and where Continue and the practice exam focus. */
export const FOCUS: readonly ConceptId[] = ['dictionaries', 'files', 'classes'];

export const isConceptId = (v: unknown): v is ConceptId => typeof v === 'string' && (CONCEPT_IDS as readonly string[]).includes(v);

/** A progress record with an empty entry for every topic. */
export const emptyConcepts = <T,>(): Record<ConceptId, Record<string, T>> =>
  Object.fromEntries(CONCEPT_IDS.map((c) => [c, {}])) as Record<ConceptId, Record<string, T>>;
