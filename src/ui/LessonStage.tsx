import { ArrowLeft, ArrowRight, Lightbulb, MessageCircle } from 'lucide-react';
import type { Lesson, LoopStep } from '../types';
import { Button } from './primitives';
import { FilePreview, sampleFiles } from './FilePreview';

export interface LessonStageProps {
  lesson: Lesson;
  step: LoopStep;
  walkLine: number;
  onStep: (dir: 'next' | 'back') => void;
  onHint?: () => void;
  /** Written hints already used on this step; label shows 'Hint 2 of 3', then 'Ask the tutor for help'. */
  hintsUsed?: number;
}

function Voice({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[46ch] font-voice text-lg leading-[1.4] tracking-[-0.01em] text-ink">{children}</p>;
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}

export function LessonStage({ lesson, step, walkLine, onStep, onHint, hintsUsed = 0 }: LessonStageProps) {
  const hintList = step === 'talkthrough' ? lesson.talkthrough.hints : lesson.doit.hints;
  const hintLabel = hintsUsed < hintList.length ? `Hint ${hintsUsed + 1} of ${hintList.length}` : 'Ask the tutor for help';
  const total = lesson.walkthrough.length;
  const note = lesson.walkthrough.find((n) => n.line === walkLine);

  let body: React.ReactNode;
  let actions: React.ReactNode = (
    <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
      Continue
    </Button>
  );

  switch (step) {
    case 'define':
      body = (
        <>
          <Voice>{lesson.define}</Voice>
        </>
      );
      actions = (
        <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
          Show me an example
        </Button>
      );
      break;
    case 'example':
      body = (
        <>
          <Voice>Here’s a short example. Read it once top to bottom, then we’ll go through it line by line.</Voice>
          <Meta>It’s on the right. Press Play step by step to watch it run one line at a time, or Run to see what it prints.</Meta>
        </>
      );
      actions = (
        <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
          Go line by line
        </Button>
      );
      break;
    case 'walkthrough':
      body = (
        <>
          <Meta>
            <span className="tnum">
              Line {walkLine} of {total}
            </span>
          </Meta>
          <Voice>{note?.text ?? ''}</Voice>
        </>
      );
      actions = (
        <>
          <Button variant="ghost" onClick={() => onStep('back')} disabled={walkLine <= 1} icon={<ArrowLeft className="size-4" strokeWidth={2} />}>
            Back
          </Button>
          <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
            {walkLine >= total ? 'I’ve got it' : 'Next line'}
          </Button>
        </>
      );
      break;
    case 'feedback':
      body = (
        <>
          <Meta>You explained it. Now the real thing.</Meta>
          <Voice>Next you’ll write the code yourself, and the tests will check it.</Voice>
        </>
      );
      actions = (
        <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
          Write the code
        </Button>
      );
      break;
    case 'talkthrough':
      body = (
        <>
          <Meta>Your turn to explain. No code needed yet.</Meta>
          <Voice>{lesson.talkthrough.prompt}</Voice>
        </>
      );
      actions = (
        <>
          {onHint && (
            <Button data-tour="lesson-hint" variant="ghost" onClick={onHint} icon={<Lightbulb className="size-4" strokeWidth={1.75} />}>
              {hintLabel}
            </Button>
          )}
          <p className="flex items-center gap-1.5 text-sm text-ink-3">
            <MessageCircle className="size-4" strokeWidth={1.75} aria-hidden="true" /> Answer below
          </p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onStep('next')}>
            Skip to writing code
          </Button>
        </>
      );
      break;
    case 'check':
      body = (
        <>
          <Meta>All tests pass.</Meta>
          <Voice>That works. It wasn’t a clean round yet (a hint, a retry, or a miss when you talked it through), so it comes back later for one more.</Voice>
        </>
      );
      actions = (
        <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
          Next skill
        </Button>
      );
      break;
    case 'doit':
      body = (
        <>
          <Meta>Now write it. Press Check my code when you think it works.</Meta>
          <Voice>{lesson.doit.prompt}</Voice>
        </>
      );
      actions = onHint ? (
        <Button data-tour="lesson-hint" variant="ghost" onClick={onHint} icon={<Lightbulb className="size-4" strokeWidth={1.75} />}>
          {hintLabel}
        </Button>
      ) : null;
      break;
    case 'mastered':
      body = (
        <>
          <Voice>You’ve got this one. That’s two clean passes in a row.</Voice>
          <Meta>It goes in your mastered list. If it slips, it comes back for review.</Meta>
        </>
      );
      actions = (
        <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
          Next skill
        </Button>
      );
      break;
  }

  return (
    <section data-tour="lesson-stage" aria-label="Lesson" className="flex flex-col gap-4 px-5 pt-5 pb-5">
      <div key={`${step}-${walkLine}`} className="flex flex-col gap-3 animate-[stage-in_420ms_var(--ease-out)]">
        {body}
        {['example', 'walkthrough', 'doit', 'check'].includes(step) && (
          <FilePreview
            files={step === 'example' || step === 'walkthrough' ? (lesson.exampleFiles ?? sampleFiles(lesson.doit.tests)) : sampleFiles(lesson.doit.tests)}
            caption={step === 'doit' || step === 'check' ? 'Sample file (the tests use other files like it):' : 'The file this code reads:'}
          />
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}
