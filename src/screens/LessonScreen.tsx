import { ArrowLeft, Play, ListChecks } from 'lucide-react';
import type { Concept, Mode, SessionState } from '../types';
import { CodeEditor } from '../ui/CodeEditor';
import { Console } from '../ui/Console';
import { Conversation } from '../ui/Conversation';
import { LessonStage } from '../ui/LessonStage';
import { StepTrack } from '../ui/StepTrack';
import { Button, ModeToggle } from '../ui/primitives';
import { TopBar } from '../ui/TopBar';

export interface LessonScreenProps {
  session: SessionState;
  concept: Concept;
  mode: Mode;
  programInput: string;
  onProgramInputChange: (v: string) => void;
  onCodeChange: (code: string) => void;
  onRun: () => void;
  onCheck: () => void;
  onSend: (text: string) => void;
  onStep: (dir: 'next' | 'back') => void;
  onHint?: () => void;
  onModeChange: (m: Mode) => void;
  onBack: () => void;
}

export function LessonScreen(p: LessonScreenProps) {
  const { session, concept } = p;
  const lesson = concept.lessons[session.lessonIndex];
  const writing = session.step === 'doit' || session.step === 'check';
  const walking = session.step === 'walkthrough';
  const lastTutor = [...session.turns].reverse().find((t) => t.role === 'tutor');
  const highlight = walking ? [session.walkLine] : writing ? (lastTutor?.highlightLines ?? []) : [];
  const code = writing ? session.code : lesson.example;
  const defining = session.step === 'define';

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:min-h-0">
      <header>
        <TopBar
          crumbs={[concept.title.replace(' and objects', ''), lesson.title]}
          onHome={p.onBack}
          right={
            <>
              <Button variant="ghost" size="sm" onClick={p.onBack} icon={<ArrowLeft className="size-4" strokeWidth={2} />} aria-label="Back to home">
                <span className="hidden sm:inline">Home</span>
              </Button>
              <ModeToggle mode={p.mode} onChange={p.onModeChange} />
            </>
          }
        />
        <div className="hidden border-b border-line px-2 md:px-3 lg:block">
          <StepTrack step={session.step} />
        </div>
        <div className="border-b border-line px-5 py-3 lg:hidden">
          <StepTrack step={session.step} compact />
        </div>
      </header>

      <main
        className="grid flex-1 md:min-h-0 md:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]
          [grid-template-areas:'stage'_'code'_'convo'] md:[grid-template-areas:'stage_code'_'convo_code']"
      >
        <div className="border-b border-line [grid-area:stage] md:border-r">
          <LessonStage lesson={lesson} step={session.step} walkLine={session.walkLine} onStep={p.onStep} onHint={p.onHint} />
        </div>

        <div className="flex min-h-0 flex-col border-b border-line bg-surface [grid-area:code] md:border-b-0">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <p className="text-sm font-medium text-ink-2">{writing ? 'Your code' : 'Example'}</p>
            <div className={`ml-auto flex items-center gap-2 ${defining ? 'invisible' : ''}`}>
              <Button
                size="sm"
                variant={writing ? 'secondary' : 'primary'}
                onClick={p.onRun}
                loading={session.busy === 'running'}
                icon={<Play className="size-3.5" strokeWidth={2} />}
              >
                Run
              </Button>
              {writing && (
                <Button size="sm" variant="primary" onClick={p.onCheck} icon={<ListChecks className="size-4" strokeWidth={2} />}>
                  Check my code
                </Button>
              )}
            </div>
          </div>
          <div className="min-h-[13rem] flex-1 overflow-auto md:min-h-0">
            {defining ? (
              <div className="grid h-full min-h-[13rem] place-items-center p-8">
                <p className="max-w-[30ch] text-center text-[0.9375rem] text-ink-3">
                  Code shows up here once you’ve got the idea. Read the definition first.
                </p>
              </div>
            ) : (
            <CodeEditor
              value={code}
              onChange={writing ? p.onCodeChange : undefined}
              readOnly={!writing}
              highlightLines={highlight}
              focus={walking}
              label={writing ? 'Your code' : 'Example code'}
            />
            )}
          </div>
          <div className="border-t border-line bg-paper md:h-[17rem]">
            <Console
              key={session.lastGrade ? 'graded' : 'run'}
              run={session.lastRun}
              grade={session.lastGrade}
              programInput={p.programInput}
              onProgramInputChange={p.onProgramInputChange}
              running={session.busy === 'running'}
            />
          </div>
        </div>

        <div className="flex min-h-[24rem] flex-col [grid-area:convo] md:min-h-0 md:border-r md:border-line">
          <Conversation turns={session.turns.filter((t) => !t.scripted)} thinking={session.busy === 'thinking'} onSend={p.onSend} />
        </div>
      </main>
    </div>
  );
}
