import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, CornerDownRight } from 'lucide-react';
import type { TutorTurn } from '../types';
import { Spinner } from './primitives';

export function FeedbackBlock({ nailed = [], fix = [] }: { nailed?: string[]; fix?: string[] }) {
  if (!nailed.length && !fix.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {nailed.length > 0 && (
        <div className="rounded-xl bg-nail-bg px-3.5 py-3 animate-[pop-in_420ms_var(--ease-out)_both]">
          <p className="mb-1.5 text-sm font-medium text-ok">What you nailed</p>
          <ul className="flex flex-col gap-1">
            {nailed.map((n) => (
              <li key={n} className="flex gap-2 text-[0.9375rem] text-ink">
                <Check className="mt-1 size-4 shrink-0 text-ok" strokeWidth={2} aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      {fix.length > 0 && (
        <div className="rounded-xl bg-fix-bg animate-[pop-in_420ms_var(--ease-out)_120ms_both] px-3.5 py-3">
          <p className="mb-1.5 text-sm font-medium text-fix">What to fix</p>
          <ul className="flex flex-col gap-1">
            {fix.map((f) => (
              <li key={f} className="flex gap-2 text-[0.9375rem] text-ink">
                <CornerDownRight className="mt-1 size-4 shrink-0 text-fix" strokeWidth={2} aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface ConversationProps {
  turns: TutorTurn[];
  thinking?: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
}

export function Conversation({ turns, thinking, onSend, placeholder = 'Ask anything, or explain your thinking…' }: ConversationProps) {
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, thinking]);
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };
  return (
    <section aria-label="Conversation with your tutor" className="flex min-h-0 flex-1 flex-col">
      <ol className="flex flex-1 flex-col gap-5 px-5 py-4 md:min-h-0 md:overflow-y-auto" aria-live="polite">
        {turns.map((turn, i) =>
          turn.role === 'tutor' ? (
            <li key={i} className="max-w-[60ch]">
              <p className="text-[0.9375rem] leading-relaxed text-ink">{turn.text}</p>
              <FeedbackBlock nailed={turn.nailed} fix={turn.fix} />
            </li>
          ) : (
            <li key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2.5 text-[0.9375rem] text-ink">
              {turn.text}
            </li>
          ),
        )}
        {thinking && (
          <li className="flex items-center gap-2 text-sm text-ink-3">
            <Spinner /> Thinking
          </li>
        )}
        <div ref={end} />
      </ol>
      <form
        className="sticky bottom-0 border-t border-line bg-paper p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-1.5 pl-3.5 focus-within:border-accent">
          <label className="sr-only" htmlFor="composer">
            Message your tutor
          </label>
          <textarea
            id="composer"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[0.9375rem] outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="press grid size-9 shrink-0 place-items-center rounded-md bg-ink text-paper disabled:bg-surface-2 disabled:text-ink-3"
          >
            <ArrowUp className="size-4.5" strokeWidth={2} />
          </button>
        </div>
      </form>
    </section>
  );
}
