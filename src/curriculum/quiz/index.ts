// Quick check: a few exam-style questions after each lesson's Try it. Free (graded here, no AI), not part of mastery.
import type { ConceptId, DrillQuestion } from '../../types';
import { classesQuiz } from './classes';
import { dictionariesQuiz } from './dictionaries';
import { filesQuiz } from './files';

export const quizzes: Record<ConceptId, Record<string, DrillQuestion[]>> = {
  dictionaries: dictionariesQuiz,
  files: filesQuiz,
  classes: classesQuiz,
};

export function quizFor(concept: ConceptId, subskill: string): DrillQuestion[] {
  return quizzes[concept]?.[subskill] ?? [];
}
