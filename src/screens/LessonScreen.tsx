import { ArrowLeft, Play, ListChecks, Footprints, X, Eye } from 'lucide-react';
import { SlideDeck } from '../ui/SlideDeck';
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
import { codeOnScreen, isWriting, runFilesFor } from '../loop/engine';

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
  /** Open the code on screen in the visualizer (frames and objects). */
  onVisualize?: (code: string, files?: Record<string, string>) => void;
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
  const [askOpen, setAskOpen] = useState(false);
  // The output panel only appears once there is something to show (or while he is writing code).
  const showConsole = writing || !!player || !!session.lastRun;
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

      {defining ? (
        <>
          <SlideDeck
            eyebrow={`${concept.title.replace(' and objects', '')} · Lesson ${session.lessonIndex + 1} of ${concept.lessons.length}`}
            title={lesson.title}
            text={lesson.define}
            onDone={() => p.onStep('next')}
            onAsk={() => setAskOpen(true)}
          />
          {askOpen && (
            <aside
              aria-label="Ask the tutor"
              className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-line bg-paper/95 shadow-[0_0_60px_rgb(0_0_0/0.6)] backdrop-blur-xl animate-[drawer-in_320ms_var(--ease-out)]"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <p className="font-medium">Ask the tutor</p>
                <Button variant="ghost" size="sm" onClick={() => setAskOpen(false)} icon={<X className="size-4" strokeWidth={2} />} aria-label="Close" />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <Conversation turns={session.turns.filter((t) => !t.scripted)} thinking={session.busy === 'thinking'} onSend={p.onSend} />
              </div>
            </aside>
          )}
        </>
      ) : (
      <main
        className="grid flex-1 md:min-h-0 md:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]
          [grid-template-areas:'stage'_'code'_'convo'] md:[grid-template-areas:'stage_code'_'convo_code']"
      >
        <div className="border-b border-line [grid-area:stage] md:border-r">
          <LessonStage
            lesson={lesson}
            step={session.step}
            walkLine={session.walkLine}
            onStep={p.onStep}
            onHint={p.onHint}
            hintsUsed={session.step === 'talkthrough' ? (session.freeHints?.talk ?? 0) : (session.freeHints?.doit ?? 0)}
          />
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
              {p.onVisualize && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => p.onVisualize!(code, runFilesFor(lesson))}
                  icon={<Eye className="size-4" strokeWidth={1.75} />}
                  aria-label="Visualize this code"
                >
                  <span className="hidden lg:inline">Visualize</span>
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
            <CodeEditor
              value={code}
              onChange={writing ? p.onCodeChange : undefined}
              readOnly={!writing}
              highlightLines={player ? [playerLine] : highlightBase}
              focus={walking}
              label={writing ? 'Your code' : 'Example code'}
            />
          </div>
          {showConsole && (
          <div className="border-t border-line bg-paper md:h-[17rem] animate-[stage-in_360ms_var(--ease-out)]">
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
              showInput={writing}
            />
            )}
          </div>
          )}
        </div>

        <div className="flex min-h-[24rem] flex-col [grid-area:convo] md:min-h-0 md:border-r md:border-line">
          <Conversation turns={session.turns.filter((t) => !t.scripted)} thinking={session.busy === 'thinking'} onSend={p.onSend} />
        </div>
      </main>
      )}
    </div>
  );
}
