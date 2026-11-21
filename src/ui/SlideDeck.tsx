// The Learn step as slides: just the idea, in big words. No editor, no terminal.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, MessageCircle } from 'lucide-react';
import { Button } from './primitives';

/** Split a definition into slides: one idea (sentence) each, merging very short ones. */
export function toSlides(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    if (out.length && (out[out.length - 1].length < 45 || s.length < 30)) out[out.length - 1] += ' ' + s;
    else out.push(s);
  }
  return out.length ? out : [text];
}

// Code-looking words get set in mono so they stand out: open(), f.read(), __init__, self.name, "w", d[key] = value
const CODE = /(`[^`]+`|"[^"\s]{1,12}"|'[^'\s]{1,12}'|\b[\w.]*\w\([^)]{0,30}\)|\b\w+\[[^\]]{1,20}\](?:\s*=\s*\w+)?|\b\w+\.\w+\b|\b__\w+__\b|\bself\b|\bdel\b|\bin\b(?= operator)|\bdict\b)/g;

function rich(text: string): ReactNode[] {
  const parts = text.split(CODE);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <code key={i} className="mx-0.5 rounded-md bg-accent/15 px-1.5 py-0.5 font-code text-[0.82em] font-medium text-accent-hover">
        {p.replace(/^`|`$/g, '')}
      </code>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function SlideDeck({
  eyebrow,
  title,
  text,
  onDone,
  onAsk,
}: {
  eyebrow: string;
  title: string;
  text: string;
  onDone: () => void;
  onAsk: () => void;
}) {
  const slides = useMemo(() => toSlides(text), [text]);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const reduce = useReducedMotion();
  const last = i === slides.length - 1;
  useEffect(() => setI(0), [text]);

  const go = (d: number) => {
    if (d > 0 && last) return onDone();
    setDir(d);
    setI((n) => Math.max(0, Math.min(slides.length - 1, n + d)));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section aria-label="Lesson slides" className="relative isolate flex flex-1 flex-col overflow-hidden">
      {/* soft light + dots behind the slide */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(45% 60% at 15% 10%, rgb(129 140 248 / 0.22), transparent), radial-gradient(40% 55% at 90% 90%, rgb(244 114 182 / 0.18), transparent), radial-gradient(50% 60% at 60% 40%, rgb(167 139 250 / 0.12), transparent)',
        }}
      />
      <span className="halftone halftone-field -z-10" aria-hidden="true" />

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-10 md:px-10">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">{eyebrow}</p>
        <h2 className="mt-2 text-lg text-ink-2 md:text-xl">{title}</h2>

        <div className="relative mt-8 min-h-[12rem] md:min-h-[14rem]">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.p
              key={i}
              custom={dir}
              className="max-w-[26ch] text-[2rem] leading-[1.18] font-semibold tracking-[-0.03em] text-ink md:text-[2.75rem]"
              initial={reduce ? false : { opacity: 0, x: dir * 40, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={reduce ? undefined : { opacity: 0, x: dir * -40, filter: 'blur(6px)' }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              {rich(slides[i])}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => go(-1)} disabled={i === 0} icon={<ArrowLeft className="size-4" strokeWidth={2} />}>
            Back
          </Button>
          <Button variant="primary" size="lg" onClick={() => go(1)} iconEnd={<ArrowRight className="size-4" strokeWidth={2} />}>
            {last ? 'Show me an example' : 'Next'}
          </Button>
          <div className="ml-1 flex items-center" aria-label={`Slide ${i + 1} of ${slides.length}`}>
            {slides.map((_, k) => (
              <button
                key={k}
                onClick={() => {
                  setDir(k > i ? 1 : -1);
                  setI(k);
                }}
                aria-label={`Slide ${k + 1}`}
                aria-current={k === i ? 'step' : undefined}
                className="group grid h-8 place-items-center px-[3px]"
              >
                <span className={`block h-1.5 rounded-full transition-all duration-300 ${k === i ? 'w-6 bg-ink' : 'w-1.5 bg-line-strong group-hover:bg-ink-3'}`} />
              </button>
            ))}
          </div>
          <Button variant="ghost" className="ml-auto" onClick={onAsk} icon={<MessageCircle className="size-4" strokeWidth={1.75} />}>
            Ask a question
          </Button>
        </div>
      </div>
    </section>
  );
}
