import { X } from 'lucide-react';

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

export function TalkScreen({ state, caption, context, level = 0, onTap, onExit }: TalkScreenProps) {
  const scale = state === 'listening' ? 1 + Math.min(level, 1) * 0.08 : 1;
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
        onClick={onTap}
        aria-label={LABEL[state]}
        className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-6 outline-offset-[-8px]"
      >
        <div className="relative grid size-[min(64vw,17rem)] place-items-center" aria-hidden="true">
          <div className="halftone-radial pointer-events-none absolute -inset-[60%] animate-[spin_90s_linear_infinite]" />
          <div
            className={`absolute -inset-12 animate-[spin_14s_linear_infinite] rounded-full blur-3xl transition-opacity duration-500 ${state === 'idle' ? 'opacity-30' : 'opacity-60'}`}
            style={{ background: 'radial-gradient(50% 50% at 30% 30%, #A5B4FC, transparent), radial-gradient(50% 50% at 70% 70%, #F472B6, transparent), radial-gradient(60% 60% at 50% 50%, #A78BFA, transparent)' }}
          />
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
            <circle cx="100" cy="100" r="92" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="6" />
            {state === 'thinking' ? (
              <circle
                cx="100"
                cy="100"
                r="92"
                fill="none"
                stroke={RING.thinking}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="120 460"
                className="origin-center animate-[spin_1.4s_linear_infinite]"
              />
            ) : (
              <circle
                cx="100"
                cy="100"
                r="92"
                fill="none"
                stroke={RING[state]}
                strokeWidth={state === 'idle' ? 3 : 6}
                strokeOpacity={state === 'idle' ? 0.6 : 1}
                className={state === 'speaking' ? 'origin-center animate-[talk-pulse_1.6s_var(--ease-out)_infinite]' : ''}
                style={{ transform: `scale(${scale})`, transformOrigin: 'center', transition: 'transform 120ms var(--ease-out), stroke 240ms var(--ease-out)' }}
              />
            )}
          </svg>
          <div
            className="size-[38%] rounded-full transition-[background-color,transform] duration-[240ms] ease-out"
            style={{
              backgroundColor: state === 'idle' ? 'rgb(255 255 255 / 0.06)' : RING[state],
              opacity: state === 'idle' ? 1 : 0.16,
              transform: `scale(${scale})`,
            }}
          />
        </div>

        <div className="flex flex-col items-center gap-5 text-center">
          <p className="text-lg font-medium" style={{ color: RING[state] === 'var(--talk-sub)' ? 'var(--talk-ink)' : RING[state] }}>
            {LABEL[state]}
          </p>
          <p aria-live="polite" className="line-clamp-4 max-w-[22ch] font-voice text-[1.875rem] leading-[1.3] tracking-[-0.01em] text-[var(--talk-ink)] sm:max-w-[28ch]">
            {caption}
          </p>
        </div>
      </button>

      <footer className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-[0.9375rem] text-[var(--talk-sub)]">
        Keep the screen on and the phone in a mount. Eyes on the road. Tap anywhere to interrupt.
      </footer>
    </div>
  );
}
