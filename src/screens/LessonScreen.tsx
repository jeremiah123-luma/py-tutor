import { ArrowLeft, Play, ListChecks, Footprints } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { TraceStep } from '../types';
import { StepPlayer } from '../ui/StepPlayer';
import type { Concept, Mode, SessionState } from '../types';
import { CodeEditor } from '../ui/CodeEditor';
import { Console } from '../ui/Console';
import { Conversation } from '../ui/Conversation';
import { LessonStage } from '../ui/LessonStage';
import { StepTrack, type JumpTarget } from '../ui/StepTrack';
import { Button, ModeToggle } from '../ui/primitives';
import { TopBar } from '../ui/TopBar';
import { codeOnScreen, isWriting } from '../loop/engine';

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
  onJump?: (t: JumpTarget) => void;
  /** Trace the example for the step-through player (null if it can't be played). */
  onTrace?: () => Promise<TraceStep[] | null>;
}

export function LessonScreen(p: LessonScreenProps) {
  const { session, concept } = p;
  const lesson = concept.lessons[session.lessonIndex];
  const writing = isWriting(session.step);
  const walking = session.step === 'walkthrough';
  const lastTutor = [...session.turns].reverse().find((t) => t.role === 'tutor');
  const highlightBase = walking ? [session.walkLine] : writing ? (lastTutor?.highlightLines ?? []) : [];
  const code = codeOnScreen(lesson, session);
  const defining = session.step === 'define';
  const [player, setPlayer] = useState<TraceStep[] | null>(null);
  const [playerLine, setPlayerLine] = useState(0);
  const [tracing, setTracing] = useState(false);
  const canPlay = !writing && !defining && !!p.onTrace;
  // Leaving the example (or switching lessons) closes the player.
  useEffect(() => {
    if (!canPlay) setPlayer(null);
  }, [canPlay, session.lessonIndex]);
  const onPlayerLine = useCallback((l: number) => setPlayerLine(l), []);
  const startPlayer = async () => {
    if (!p.onTrace) return;
    setTracing(true);
    const steps = await p.onTrace();
    setTracing(false);
    setPlayer(steps);
  };

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
        <div className="border-b border-line px-2 md:px-3">
          <StepTrack step={session.step} onJump={p.onJump} />
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
              {canPlay && (
                <Button size="sm" variant="secondary" onClick={() => void startPlayer()} loading={tracing} icon={<Footprints className="size-4" strokeWidth={1.75} />}>
                  Play step by step
                </Button>
              )}
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
              <div className="relative grid h-full min-h-[13rem] place-items-center overflow-hidden p-8">
                <span className="halftone halftone-field" aria-hidden="true" />
                <p className="relative max-w-[30ch] rounded-lg bg-surface px-4 py-3 text-center text-[0.9375rem] text-ink-2">
                  Code shows up here once you’ve got the idea. Read the definition first.
                </p>
              </div>
            ) : (
            <CodeEditor
              value={code}
              onChange={writing ? p.onCodeChange : undefined}
              readOnly={!writing}
              highlightLines={player ? [playerLine] : highlightBase}
              focus={walking}
              label={writing ? 'Your code' : 'Example code'}
            />
            )}
          </div>
          <div className="border-t border-line bg-paper md:h-[17rem]">
            {player ? (
              <StepPlayer steps={player} notes={lesson.walkthrough} onLine={onPlayerLine} onClose={() => setPlayer(null)} />
            ) : (
            <Console
              key={session.lastGrade ? 'graded' : 'run'}
              run={session.lastRun}
              grade={session.lastGrade}
              programInput={p.programInput}
              onProgramInputChange={p.onProgramInputChange}
              running={session.busy === 'running'}
            />
            )}
          </div>
        </div>

        <div className="flex min-h-[24rem] flex-col [grid-area:convo] md:min-h-0 md:border-r md:border-line">
          <Conversation turns={session.turns.filter((t) => !t.scripted)} thinking={session.busy === 'thinking'} onSend={p.onSend} />
        </div>
      </main>
    </div>
  );
}
