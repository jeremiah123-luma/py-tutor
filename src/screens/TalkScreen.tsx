import { useEffect, useRef } from 'react';
import { sfx } from '../ui/sfx';
import { X } from 'lucide-react';
import { Orb } from '../ui/Orb';

export type TalkState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface TalkScreenProps {
  state: TalkState;
  /** Last thing the tutor said (or is saying). */
  caption: string;
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

export function TalkScreen({ state, caption, context, onTap, onExit, error, passed }: TalkScreenProps) {
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
        className="flex flex-1 flex-col items-center justify-center gap-[min(2.5rem,4svh)] px-6 pb-4 outline-offset-[-8px]"
      >
        {/* the orb: frosted glass with the ribbon folding inside, moving with the conversation (Orb.tsx) */}
        <div className="relative size-[min(84vw,22rem,40svh)]" aria-hidden="true">
          <Orb state={state} />
        </div>

        <div className="flex flex-col items-center gap-5 text-center">
          <p className="text-lg font-medium" style={{ color: RING[state] === 'var(--talk-sub)' ? 'var(--talk-ink)' : RING[state] }}>
            {label}
          </p>
          <p className="line-clamp-4 max-w-[22ch] font-voice text-[clamp(1.75rem,4.5svh,1.875rem)] leading-[1.3] tracking-[-0.01em] text-[var(--talk-ink)] sm:max-w-[28ch]">
            {caption}
          </p>
        </div>
      </button>

      {/* state changes are announced; the streaming caption isn't (it would be read out word by word) */}
      <p role="status" className="sr-only">
        {label}
      </p>

      <footer className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-[var(--talk-sub)] [@media(max-height:600px)]:hidden">
        Keep the screen on and the phone in a mount. Eyes on the road. Tap anywhere to interrupt.
      </footer>
    </div>
  );
}
