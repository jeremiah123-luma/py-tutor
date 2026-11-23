import { useEffect, useRef } from 'react';
import { sfx } from '../ui/sfx';
import { X } from 'lucide-react';
import { OrbVideo } from '../ui/OrbVideo';
import { ListeningGlow } from '../ui/ListeningGlow';

export type TalkState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface TalkScreenProps {
  state: TalkState;
  /** Last thing the tutor said (or is saying). */
  caption: string;
  /** What it heard him say (shown word by word while it thinks). */
  heard?: string;
  /** Short context, e.g. "Dictionaries · Line by line". */
  context?: string;
  /** Live mic level 0–1 while listening (drives the ring). */
  level?: number;
  /** Tap anywhere: start, interrupt, or hand the turn over. */
  onTap: () => void;
  onExit: () => void;
  /** The caption is an error (mic blocked, network); the button says how to recover. */
  error?: boolean;
  /** He passed this skill: a tap (or saying "next") moves on. */
  passed?: boolean;
}

const LABEL: Record<TalkState, string> = {
  idle: 'Tap anywhere to start',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking · tap to interrupt',
};

const RING: Record<TalkState, string> = {
  idle: 'var(--talk-sub)',
  listening: 'var(--talk-listen)',
  thinking: 'var(--talk-ink)',
  speaking: 'var(--talk-speak)',
};

export function TalkScreen({ state, caption, heard, context, onTap, onExit, error, passed }: TalkScreenProps) {
  const label =
    error && state === 'idle'
      ? 'Tap to try again'
      : passed && (state === 'listening' || state === 'idle')
        ? 'Passed · tap or say “next”'
        : LABEL[state];
  // Earcons like a voice assistant: rising when the mic opens, falling when your turn is sent.
  const prevState = useRef(state);
  useEffect(() => {
    const was = prevState.current;
    prevState.current = state;
    if (was === state) return;
    if (state === 'listening') sfx.listen();
    else if (was === 'listening' && state === 'thinking') sfx.heard();
  }, [state]);
  return (
    <div
      className="relative flex min-h-dvh flex-col bg-[var(--talk-bg)] text-[var(--talk-ink)] select-none"
      style={{ colorScheme: 'dark' }}
    >
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <p className="glass-dark truncate rounded-full px-4 py-2 text-[1.0625rem] text-[var(--talk-sub)]">{context}</p>
        <button
          onClick={onExit}
          className="press glass-dark inline-flex h-14 shrink-0 items-center gap-2 rounded-full px-5 text-[1.0625rem] font-medium text-[var(--talk-ink)] hover:border-white/30"
        >
          <X className="size-5" strokeWidth={2} aria-hidden="true" /> Done
        </button>
      </header>

      <button
        onClick={() => {
          if (state === 'speaking' || state === 'thinking') sfx.interrupt();
          onTap();
        }}
        aria-label={`${label}. ${caption}`}
        className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[min(2.5rem,4svh)] px-6 pb-4 outline-offset-[-8px]"
      >
        {/* the orb, rendered in Blender: frosted glass with a ribbon of light folding inside (OrbVideo.tsx) */}
        <div className="relative size-[min(80vw,21rem,38svh)]" aria-hidden="true">
          <OrbVideo state={state} />
        </div>

        <div className="flex flex-col items-center gap-5 text-center">
          <p className="text-lg font-medium" style={{ color: RING[state] === 'var(--talk-sub)' ? 'var(--talk-ink)' : RING[state] }}>
            {label}
          </p>
          {state === 'thinking' && heard ? (
            // what it heard him say, word by word, while it works out an answer
            <p key={heard} className="line-clamp-4 max-w-[24ch] font-voice text-[clamp(1.5rem,4svh,1.75rem)] leading-[1.3] tracking-[-0.01em] text-[var(--talk-ink)] sm:max-w-[30ch]">
              {heard.split(/\s+/).map((w, i) => (
                <span key={i} className="inline-block animate-[word-in_420ms_var(--ease-out)_both] whitespace-pre" style={{ animationDelay: `${Math.min(i, 30) * 45}ms` }}>
                  {w}{' '}
                </span>
              ))}
            </p>
          ) : (
            // the tutor's line; while he answers it stays up, quieter, so he can glance at the question
            <p
              className={`line-clamp-4 max-w-[22ch] font-voice text-[clamp(1.75rem,4.5svh,1.875rem)] leading-[1.3] tracking-[-0.01em] text-[var(--talk-ink)] transition-opacity duration-300 sm:max-w-[28ch] ${state === 'listening' || state === 'thinking' ? 'opacity-55' : ''}`}
            >
              {caption}
            </p>
          )}
        </div>
      </button>

      {/* state changes are announced; the streaming caption isn't (it would be read out word by word) */}
      <p role="status" className="sr-only">
        {label}
      </p>

      <ListeningGlow on={state === 'listening'} />

      <footer className={`relative z-10 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-[var(--talk-sub)] [@media(max-height:600px)]:hidden transition-opacity duration-300 ${state === 'listening' ? 'opacity-0' : ''}`}>
        Keep the screen on and the phone in a mount. Eyes on the road. Tap anywhere to interrupt.
      </footer>
    </div>
  );
}
