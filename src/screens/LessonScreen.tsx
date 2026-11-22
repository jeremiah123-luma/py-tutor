import { ArrowLeft, Play, ListChecks, Footprints, X, Eye, MessageCircleQuestion } from 'lucide-react';
import { SlideDeck } from '../ui/SlideDeck';
import { useCallback, useEffect, useRef, useState } from 'react';
import { distortionWave, recentTap } from '../ui/wave';
import { sfx } from '../ui/sfx';
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
import { codeOnScreen, isWriting, runFilesFor, showsOwnCode } from '../loop/engine';

export interface LessonScreenProps {
  /** Open with the Ask the tutor panel showing (a question asked from Home). */
  startAsk?: boolean;
  session: SessionState;
  concept: Concept;
  mode: Mode;
  programInput: string;
  onProgramInputChange: (v: string) => void;
  onCodeChange: (code: string) => void;
  onRun: () => void;
  onCheck: () => void;
  /** Ask the tutor (AI, uses today's AI help) to explain the last failed check. */
  onExplainCheck?: () => void;
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
  const canPlay = !showsOwnCode(session.step) && !defining && !!p.onTrace;
  // A question asked from Home opens here with the Ask the tutor panel already showing it.
  const [askOpen, setAskOpen] = useState(!!p.startAsk);
  const mounted = useRef(false);
  // Any step change (or switching lessons) closes the player, so its line never fights the walkthrough's.
  useEffect(() => {
    setPlayer(null);
    if (mounted.current) setAskOpen(false); // the Ask the tutor drawer belongs to the step he opened it on
    mounted.current = true;
  }, [session.step, session.lessonIndex]);
  const ownCode = showsOwnCode(session.step);
  const onPlayerLine = useCallback((l: number) => setPlayerLine(l), []);
  // Escape closes the Ask the tutor panel
  useEffect(() => {
    if (!askOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAskOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [askOpen]);
  // a soft pop when the tutor's answer lands
  const wasThinking = useRef(false);
  useEffect(() => {
    if (session.busy === 'thinking') wasThinking.current = true;
    else if (wasThinking.current && session.busy === 'idle') {
      wasThinking.current = false;
      if (session.turns.at(-1)?.role === 'tutor') sfx.reply();
    }
  }, [session.busy, session.turns]);
  // A passing check sends a green wave through the code from the button you pressed; mastering the skill
  // makes it the iridescent one.
  const codeRef = useRef<HTMLDivElement>(null);
  const seenGrade = useRef(session.lastGrade);
  const stepNow = useRef(session.step);
  stepNow.current = session.step;
  useEffect(() => {
    const g = session.lastGrade;
    if (g === seenGrade.current) return;
    seenGrade.current = g;
    if (!g?.passed) return;
    const origin = recentTap();
    // a frame later, so a check that also masters the skill has already moved the step on
    const id = requestAnimationFrame(() =>
      void distortionWave(codeRef.current, { origin, tone: stepNow.current === 'mastered' ? 'iridescent' : 'success' }),
    );
    return () => cancelAnimationFrame(id);
  }, [session.lastGrade]);
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
        <div data-tour="lesson-steps" className="border-b border-line px-2 md:px-3">
          <StepTrack step={session.step} onJump={p.onJump} seen={session.seen} />
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
        className="grid flex-1 grid-cols-[minmax(0,1fr)] md:min-h-0 md:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]
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
            skippedTalk={session.skippedTalk}
            lastClean={session.lastClean}
            passReason={session.passReason}
          />
        </div>

        <div ref={codeRef} className="flex min-h-0 min-w-0 flex-col border-b border-line bg-surface [grid-area:code] md:border-b-0">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <p className="text-sm font-medium whitespace-nowrap text-ink-2">{ownCode ? 'Your code' : 'Example'}</p>
            <div className={`ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2 ${defining ? 'invisible' : ''}`}>
              {canPlay && (
                <Button size="sm" variant="secondary" onClick={() => void startPlayer()} loading={tracing} icon={<Footprints className="size-4" strokeWidth={1.75} />}>
                  Play step by step
                </Button>
              )}
              {p.onVisualize && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => p.onVisualize!(code, runFilesFor(lesson, session.step))}
                  icon={<Eye className="size-4" strokeWidth={1.75} />}
                  aria-label="Visualize this code"
                >
                  <span className="hidden lg:inline">Visualize</span>
                </Button>
              )}
              <Button
                data-tour="lesson-run"
                size="sm"
                variant={writing ? 'secondary' : 'primary'}
                onClick={p.onRun}
                loading={session.busy === 'running'}
                icon={<Play className="size-3.5" strokeWidth={2} />}
              >
                Run
              </Button>
              {writing && p.onExplainCheck && session.lastGrade && !session.lastGrade.passed && !session.gradeExplained && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={p.onExplainCheck}
                  disabled={session.busy !== 'idle'}
                  icon={<MessageCircleQuestion className="size-4" strokeWidth={1.75} />}
                  aria-label="Ask the tutor about this"
                  title="Ask the tutor about this (uses AI help)"
                >
                  <span className="hidden sm:inline">Ask the tutor about this</span>
                </Button>
              )}
              {writing && (
                <Button data-tour="lesson-check" size="sm" variant="primary" onClick={p.onCheck} aria-label="Check my code" icon={<ListChecks className="size-4" strokeWidth={2} />}>
                  Check<span className="max-[420px]:hidden">&nbsp;my code</span>
                </Button>
              )}
            </div>
          </div>
          <div data-tour="lesson-editor" className="min-h-[13rem] flex-1 overflow-auto md:min-h-0">
            <CodeEditor
              value={code}
              onChange={writing ? p.onCodeChange : undefined}
              readOnly={!writing}
              highlightLines={player ? [playerLine] : highlightBase}
              focus={walking}
              label={ownCode ? 'Your code' : 'Example code'}
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
