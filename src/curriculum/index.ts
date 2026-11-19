import type { Concept, ConceptId } from '../types';
import { dictionaries } from './dictionaries';
import { files } from './files';
import { classes } from './classes';

export const concepts: Partial<Record<ConceptId, Concept>> = { dictionaries, files, classes };
export const conceptOrder: ConceptId[] = ['dictionaries', 'files', 'classes'];
