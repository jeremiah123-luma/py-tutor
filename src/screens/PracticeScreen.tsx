// Practice questions for one topic, from Home: every Quick check question in that topic, shuffled, no lesson around them.
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import type { Concept, DrillQuestion } from '../types';
import { QuizRunner } from '../ui/QuizRunner';
import { Button } from '../ui/primitives';
import { TopBar } from '../ui/TopBar';

export function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function PracticeScreen({ concept, questions, onExit }: { concept: Concept; questions: DrillQuestion[]; onExit: () => void }) {
  const first = useMemo(() => shuffled(questions), [questions]);
  const name = concept.title.replace(' and objects', '');
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-paper [transform:translateZ(0)] md:bg-paper/90 md:backdrop-blur-md">
        <TopBar
          crumbs={[name, 'Practice questions']}
          onHome={onExit}
          right={
            <Button variant="ghost" size="sm" onClick={onExit} icon={<ArrowLeft className="size-4" strokeWidth={2} />} aria-label="Back to home">
              <span className="hidden sm:inline">Home</span>
            </Button>
          }
        />
      </header>
      <main className="mx-auto max-w-2xl px-5 pt-8 pb-16 md:px-8 md:pt-12">
        <p className="text-sm text-ink-3">All {questions.length} questions from this topic, mixed up. Practice only, not graded.</p>
        <h1 className="mt-1 mb-8 font-voice text-2xl font-medium tracking-[-0.02em]">{name} practice</h1>
        <QuizRunner questions={first} doneLabel="Back to Home" onDone={onExit} reshuffle={shuffled} practice />
      </main>
    </div>
  );
}
