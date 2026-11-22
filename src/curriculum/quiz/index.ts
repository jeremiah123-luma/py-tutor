// Quick check: a few exam-style questions after each lesson's Try it. Free (graded here, no AI), not part of mastery.
import type { ConceptId, DrillQuestion } from '../../types';
import { basicsQuiz } from './basics';
import { stringsListsQuiz } from './strings-lists';
import { branchingQuiz } from './branching';
import { forLoopsQuiz } from './for-loops';
import { functionsQuiz } from './functions';
import { strMethodsQuiz } from './str-methods';
import { whileLoopsQuiz } from './while-loops';
import { classesQuiz } from './classes';
import { dictionariesQuiz } from './dictionaries';
import { filesQuiz } from './files';

export const quizzes: Partial<Record<ConceptId, Record<string, DrillQuestion[]>>> = {
  basics: basicsQuiz, 'strings-lists': stringsListsQuiz, branching: branchingQuiz, 'for-loops': forLoopsQuiz, functions: functionsQuiz, 'str-methods': strMethodsQuiz, 'while-loops': whileLoopsQuiz,
  dictionaries: dictionariesQuiz,
  files: filesQuiz,
  classes: classesQuiz,
};

export function quizFor(concept: ConceptId, subskill: string): DrillQuestion[] {
  return quizzes[concept]?.[subskill] ?? [];
}
