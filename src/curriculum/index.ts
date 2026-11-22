import type { Concept, ConceptId } from '../types';
import { CONCEPT_IDS, FOCUS } from './ids';
import { basics } from './basics';
import { stringsLists } from './strings-lists';
import { branching } from './branching';
import { forLoops } from './for-loops';
import { functions } from './functions';
import { strMethods } from './str-methods';
import { whileLoops } from './while-loops';
import { dictionaries } from './dictionaries';
import { files } from './files';
import { classes } from './classes';

export const concepts: Partial<Record<ConceptId, Concept>> = {
  basics, 'strings-lists': stringsLists, branching, 'for-loops': forLoops, functions, 'str-methods': strMethods, 'while-loops': whileLoops,
  dictionaries,
  files,
  classes,
};
/**
 * The order the app walks through: the final's main topics first (as before), then the earlier course topics in
 * course order (zyBooks Modules 2 to 8) for review. Topics without lessons yet are left out.
 */
export const conceptOrder: ConceptId[] = [...FOCUS, ...CONCEPT_IDS.filter((id) => !FOCUS.includes(id))].filter((id) => (concepts[id]?.lessons.length ?? 0) > 0);
