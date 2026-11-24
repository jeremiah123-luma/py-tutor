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
  /** He skipped Talk it through this round. */
  skippedTalk?: boolean;
  /** The pass that brought him here was clean (first check, no hints). */
  lastClean?: boolean;
  passReason?: 'notClean' | 'notTyped' | 'skippedTalk' | 'notTalked' | 'talkHinted' | 'streakReset';
  /** Open this lesson's Quick check (only when it has questions). */
  onQuiz?: () => void;
}

const PASS_REASON = {
  notClean: 'That works. It took a hint or more than one check, so it needs a clean round (first check, no hints) to count as mastered.',
  notTyped: 'Clean pass. To master it, write it once in Type mode and pass it clean (first check, no hints).',
  skippedTalk: 'Clean pass. You skipped Talk it through, so explain it there (or write it clean once more) and it’s mastered.',
  notTalked: 'Clean pass. One more clean pass masters it: explain it in Talk it through, or write it clean again.',
  talkHinted: 'Clean pass. Talk it through needed a hint or a second try, so one more clean pass masters it.',
  streakReset: 'Clean pass. An earlier miss reset your streak, so one more clean pass masters it.',
} as const;

function Voice({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[46ch] font-voice text-lg leading-[1.4] tracking-[-0.01em] text-ink">{children}</p>;
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}

export function LessonStage({ lesson, step, walkLine, onStep, onHint, hintsUsed = 0, skippedTalk, lastClean, passReason, onQuiz }: LessonStageProps) {
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

  // After a pass: the Quick check is next, with a way straight on to the next skill.
  const afterPass = onQuiz ? (
    <>
      <Button data-tour="lesson-quiz" variant="primary" onClick={onQuiz} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
        Quick check
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onStep('next')}>
        Skip to next skill
      </Button>
    </>
  ) : (
    <Button variant="primary" onClick={() => onStep('next')} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
      Next skill
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
          <Meta>The code is <span className="md:hidden">below</span><span className="max-md:hidden">in the other panel</span>. Press Play step by step to watch it run one line at a time, or Run to see what it prints.</Meta>
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
          <Meta>{skippedTalk ? 'Talk it through skipped.' : 'You explained it. Now the real thing.'}</Meta>
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
          {/* straight to Try it: past the talk step and its feedback in one tap */}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { onStep('next'); onStep('next'); }}>
            Skip to writing code
          </Button>
        </>
      );
      break;
    case 'check':
      body = (
        <>
          <Meta>All tests pass.</Meta>
          <Voice>{PASS_REASON[passReason ?? (lastClean ? 'notTalked' : 'notClean')]}</Voice>
        </>
      );
      actions = afterPass;
      break;
    case 'doit':
      body = (
        <>
          <Meta>Now write it. Press Check when you think it works.</Meta>
          <Voice>{lesson.doit.prompt}</Voice>
          {lesson.doit.prompt.includes('input()') && <Meta>Use input() with no prompt text inside the brackets, just like zyBooks, or the tests won’t match.</Meta>}
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
          <Meta>It’s in your mastered list. The practice exam will keep checking it.</Meta>
        </>
      );
      actions = afterPass;
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
