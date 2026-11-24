// "Delete my account", full screen. This is a Python class, so deleting is a Python statement:
// holding the prompt types `del account` one letter at a time (letting go backspaces it); when the line is
// complete it runs. Only after the server says the account is deleted does the page break down into Python's own
// brackets, which decay and fall away, leaving the error you'd really get: the name no longer exists.
// For a short while the account can be brought back from this device (`account = restore()`), which plays it all
// backwards. Nothing here deletes by accident: a stray tap types one letter and takes it back.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const WORD = 'del account';
const HOLD_S = 2.4; // how long the hold takes
const BURN_S = 4.2;
const BACK_S = 2.6;
const SQ = 1.12; // the opening is a little wider than tall
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** The opening's outline: one function of angle and time, used by the mask and the drawing so they always agree. */
const edgeR = (th: number, t: number, R: number) =>
  R *
  (1 +
    0.1 * Math.sin(3 * th + 1.3 + 0.4 * t) +
    0.06 * Math.sin(7 * th - 2.1 - 0.7 * t) +
    0.035 * Math.sin(13 * th + 0.5 + 1.3 * t) +
    0.02 * Math.sin(29 * th - 2.2 * t) +
    0.011 * Math.sin(47 * th + 2.9 * t) +
    0.007 * Math.sin(71 * th - 3.7 * t));

type Phase = 'idle' | 'running' | 'burn' | 'gone' | 'restoring' | 'unburn';

export interface DeleteAccountProps {
  name: string;
  username: string;
  mastered: number;
  /** Deletes the account on the server. Resolves (with when the restore window closes) only once it is really deleted. */
  onDelete: () => Promise<number>;
  /** Brings it back and signs in again. Rejects when it's too late. */
  onRestore: () => Promise<void>;
  /** Closed without deleting. */
  onCancel: () => void;
  /** Leaving after the account is gone (to the sign-in screen), or after it was restored (back into the app). */
  onLeave: (restored: boolean) => void;
}

export function DeleteAccount({ name, username, mastered, onDelete, onRestore, onCancel, onLeave }: DeleteAccountProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState('');

  const root = useRef<HTMLDivElement>(null);
  const layerA = useRef<HTMLDivElement>(null);
  const layerB = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const kw = useRef<HTMLSpanElement>(null);
  const rest = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  // the animation's own state lives outside React: it changes every frame
  const sim = useRef({ phase: 'idle' as Phase, p: 0, holding: false, t: 0, tb: 0, R: 0, stars: 0 });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cb = useRef({ onDelete, onRestore, onCancel, onLeave });
  cb.current = { onDelete, onRestore, onCancel, onLeave };
  const go = (p: Phase) => {
    sim.current.phase = p;
    sim.current.tb = 0;
    setPhase(p);
  };

  // A real modal: the app behind can't be reached, focus starts on the safe button, and it goes back on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    const t = setTimeout(() => cancelBtn.current?.focus({ preventScroll: true }), 60);
    return () => {
      clearTimeout(t);
      app?.removeAttribute('inert');
      try {
        prev?.focus?.({ preventScroll: true });
      } catch {
        /* gone */
      }
    };
  }, []);

  // Escape closes it, but only while nothing has been deleted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phaseRef.current === 'idle') {
        e.preventDefault();
        cb.current.onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // the restore countdown
  useEffect(() => {
    if (phase !== 'gone') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // The frame loop: the hold, the opening growing or closing, the mask, and the characters.
  useEffect(() => {
    const el = root.current;
    const B = layerB.current;
    const cv = canvas.current;
    const g = cv?.getContext('2d');
    if (!el || !B || !cv || !g) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = sim.current;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let ox = 0;
    let oy = 0;
    let Rmax = 1;
    const size = () => {
      const r = el.getBoundingClientRect();
      W = r.width;
      H = r.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const b = btn.current?.getBoundingClientRect();
      ox = b ? b.left + b.width / 2 - r.left : W / 2;
      oy = b ? b.top + b.height / 2 - r.top : H / 2;
      let m = 0;
      for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) m = Math.max(m, Math.hypot(cx - ox, (cy - oy) * SQ));
      Rmax = m / 0.76 + 20;
    };
    size();
    window.addEventListener('resize', size);

    let shown = -1;
    const label = () => {
      const n = Math.round(s.p * WORD.length);
      if (n === shown) return;
      shown = n;
      const typed = WORD.slice(0, n);
      if (kw.current) kw.current.textContent = typed.slice(0, 3);
      if (rest.current) rest.current.textContent = typed.slice(3);
      if (ghost.current) ghost.current.textContent = n ? WORD.slice(n) : 'hold to run';
    };

    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const R = s.R;
      if (R <= 0.5 && s.stars <= 0) return;
      const cw = 8;
      const ch = 12;
      const RAMP = ['·', ':', '=', '(', '[', '{', '0', '8'];
      const HOT = '{}[]():=01';
      const tk = Math.floor(s.t * 11);
      const k = clamp(R / 70, 0, 1);
      g.font = '600 10px "Geist Mono Variable", ui-monospace, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const rows = Math.ceil(H / ch);
      const cols = Math.ceil(W / cw);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw + cw / 2;
          const y = r * ch + ch / 2;
          const dx = x - ox;
          const dy = (y - oy) * SQ;
          const len = Math.hypot(dx, dy);
          if (len > R * 1.26 + 40) continue; // well outside: nothing to draw
          const hh = hash(c, r);
          const deep = len < R * 0.74 - 420; // well inside: only the few left blinking
          if (deep && (s.stars <= 0 || hh <= 0.965)) continue;
          const d = deep ? -999 : len - edgeR(Math.atan2(dy, dx), s.t, R);
          let heat: number;
          let fall = 0;
          if (d > 0) heat = Math.exp(-d / 11) * k; // just ahead of the edge: the page starting to break up
          else {
            heat = Math.exp(d / (52 + 40 * hh)) * k; // behind it: decaying, and sinking like ash
            fall = Math.pow(-d, 1.15) * 0.16 * (0.5 + hh);
          }
          if (s.stars > 0 && d < 0 && hh > 0.965) heat = Math.max(heat, s.stars * (0.3 + 0.3 * Math.sin(s.t * 3 + hh * 40)));
          heat *= 0.75 + 0.25 * hash(c + tk, r);
          if (heat < 0.07) continue;
          const front = Math.abs(d) < 7;
          const chr = front || heat > 0.8 ? HOT[Math.floor(hash(c + tk, r * 1.7 + tk) * HOT.length)] : RAMP[Math.min(7, Math.floor(heat * 9))];
          if (front) {
            g.globalAlpha = 1;
            g.fillStyle = hh > 0.6 ? '#F5F5F5' : '#A78BFA';
            g.fillRect(c * cw + 0.5, r * ch + 0.5, cw - 1, ch - 1);
            g.fillStyle = '#14092B';
            g.fillText(chr, x, y + 0.5);
          } else {
            g.globalAlpha = Math.min(1, heat * 1.5);
            g.fillStyle = heat < 0.3 ? '#5B4B9A' : heat < 0.55 ? '#A78BFA' : heat < 0.8 ? '#F9A8D4' : '#fff';
            g.fillText(chr, x, y + fall);
          }
        }
      }
      g.globalAlpha = 1;
    };

    let raf = 0;
    let last = performance.now();
    const tick = (nowMs: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
      last = nowMs;
      s.t += dt;
      const burn = reduce ? 0.01 : BURN_S;
      const back = reduce ? 0.01 : BACK_S;
      if (s.phase === 'idle') {
        s.p = clamp(s.p + (s.holding ? dt / HOLD_S : -dt / 0.5), 0, 1);
        s.R = 0;
        if (s.p >= 1) {
          // the line is complete: run it. The page only changes once the server has really deleted the account.
          s.holding = false;
          go('running');
          setError('');
          setAnnounce('Deleting your account.');
          cb.current.onDelete().then(
            (u) => {
              setUntil(u);
              setNow(Date.now());
              setAnnounce('Your account is gone.');
              go('burn');
            },
            (e: unknown) => {
              s.p = 0;
              // a dropped connection reads as a plain sentence, not the browser's "Failed to fetch"
              setError(e instanceof Error && e.message && !(e instanceof TypeError) ? `${e.message} Nothing was deleted.` : 'Couldn’t reach the server. Nothing was deleted.');
              setAnnounce('Nothing was deleted.');
              go('idle');
            },
          );
        }
      } else if (s.phase === 'burn') {
        s.tb += dt;
        const u = clamp(s.tb / burn, 0, 1);
        s.R = 10 + (Rmax - 10) * Math.pow(u, 1.75);
        s.stars = 1;
        if (u >= 1) go('gone');
      } else if (s.phase === 'gone' || s.phase === 'restoring') {
        s.tb += dt;
        s.R = Rmax;
        s.stars = Math.max(0.22, 1 - s.tb / 5);
      } else if (s.phase === 'unburn') {
        s.tb += dt;
        const u = clamp(s.tb / back, 0, 1);
        s.R = Rmax * (1 - Math.pow(u, 0.62));
        s.stars = Math.max(0, s.stars - dt * 0.8);
        if (u >= 1) {
          s.R = 0;
          cancelAnimationFrame(raf);
          cb.current.onLeave(true);
          return;
        }
      }
      label();
      if (fill.current) fill.current.style.transform = `scaleX(${s.p.toFixed(4)})`;
      if (s.R <= 0.5) B.style.clipPath = 'circle(0px at 50% 50%)';
      else if (s.R >= Rmax * 0.999) B.style.clipPath = 'none';
      else {
        let pts = '';
        for (let i = 0; i < 360; i++) {
          const th = (i / 360) * Math.PI * 2;
          const r = edgeR(th, s.t, s.R);
          pts += `${i ? ',' : ''}${(ox + Math.cos(th) * r).toFixed(1)}px ${(oy + (Math.sin(th) * r) / SQ).toFixed(1)}px`;
        }
        B.style.clipPath = `polygon(${pts})`;
      }
      draw();
    };
    raf = requestAnimationFrame(tick);
    // letting go anywhere, switching tabs, or losing focus always counts as letting go
    const release = () => {
      s.holding = false;
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = () => {
    if (sim.current.phase === 'idle') sim.current.holding = true;
  };
  const release = () => {
    sim.current.holding = false;
  };
  const restore = () => {
    if (phaseRef.current !== 'gone') return;
    go('restoring');
    setError('');
    cb.current.onRestore().then(
      () => {
        setAnnounce('Your account is back.');
        go('unburn');
      },
      (e: unknown) => {
        setUntil(0); // too late (or it failed): the offer goes away
        setError(e instanceof Error && e.message ? e.message : 'That didn’t go through.');
        go('gone');
      },
    );
  };

  const left = Math.max(0, Math.floor((until - now) / 1000));
  const canRestore = left > 0;
  const gone = phase === 'gone' || phase === 'restoring';
  const before = phase === 'idle' || phase === 'running';

  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-label="Delete your account" data-delete-account="" data-phase={phase} className="fixed inset-0 z-[120] overflow-hidden bg-[#111] text-ink select-none">
      {/* before: the question and the prompt */}
      <div ref={layerA} inert={!before} className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-[8vh] text-center">
        <p className="mb-2 text-[0.8125rem] text-ink-3">
          {name}, @{username}
        </p>
        <h2 className="font-voice text-[clamp(1.625rem,5.4vw,2.125rem)] leading-[1.1] font-semibold tracking-[-0.04em]">Delete your account?</h2>
        <p className="mt-2 max-w-[34ch] text-[0.9375rem] text-ink-2">
          {mastered > 0 ? `Your ${mastered} mastered lesson${mastered === 1 ? '' : 's'} and all saved progress go with it.` : 'Your sign-in and all saved progress go with it.'}
        </p>
        <button
          ref={btn}
          type="button"
          aria-label="Hold to delete your account"
          aria-busy={phase === 'running'}
          disabled={phase !== 'idle'}
          className="relative mt-6 h-12 w-[min(17rem,86vw)] touch-none overflow-hidden rounded-xl border border-line-strong bg-code-bg px-4 text-left font-code text-[0.9375rem] font-medium outline-none focus-visible:border-accent disabled:cursor-default"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            press();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onKeyDown={(e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.repeat) press();
          }}
          onKeyUp={release}
          onBlur={release}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span ref={fill} aria-hidden="true" className="absolute inset-0 origin-left" style={{ transform: 'scaleX(0)', background: 'linear-gradient(90deg, rgb(167 139 250 / 0.16), rgb(244 114 182 / 0.28))' }} />
          <span aria-hidden="true" className="relative whitespace-pre">
            <span className="text-accent">{'>>> '}</span>
            <span ref={kw} className="text-accent-hover" />
            <span ref={rest} />
            <span className="del-caret" />
            <span ref={ghost} className="text-[#555]">
              hold to run
            </span>
          </span>
        </button>
        <p className="mt-3 min-h-5 text-xs text-ink-3">{phase === 'running' ? 'Running…' : 'Hold to type it. Let go to take it back.'}</p>
        {error && before && (
          <p role="alert" className="mt-2 max-w-[36ch] font-code text-[0.8125rem] text-err">
            {error}
          </p>
        )}
        <button
          ref={cancelBtn}
          type="button"
          onClick={() => phaseRef.current === 'idle' && onCancel()}
          disabled={phase !== 'idle'}
          className="press mt-6 h-11 rounded-lg border border-line-strong bg-surface-2 px-5 text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
        >
          Keep my account
        </button>
      </div>

      {/* after: what Python would really say */}
      <div ref={layerB} inert={!gone} style={{ clipPath: 'circle(0px at 50% 50%)' }} className="absolute inset-0 z-[1] flex flex-col items-center justify-center bg-[#070708] px-6 pb-[8vh] text-center">
        <div className="mb-5 w-[min(23rem,92vw)] rounded-xl border border-line bg-[#101012] px-4 py-3 text-left font-code text-[0.8125rem] leading-relaxed">
          <div>
            <span className="text-accent">{'>>> '}</span>account
          </div>
          <div className="text-err">NameError: name 'account' is not defined</div>
        </div>
        <h2 className="font-voice text-[clamp(1.625rem,5.4vw,2.125rem)] leading-[1.1] font-semibold tracking-[-0.04em]">Your account is gone.</h2>
        <button
          type="button"
          onClick={() => onLeave(false)}
          disabled={phase === 'restoring'}
          className="press mt-6 h-11 w-[min(17rem,86vw)] rounded-xl bg-ink text-sm font-semibold text-[#111] outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          Sign in
        </button>
        {canRestore && (
          <>
            <button
              type="button"
              onClick={restore}
              disabled={phase === 'restoring'}
              aria-label="Restore my account"
              className="press mt-4 rounded-md px-3 py-2 font-code text-[0.8125rem] text-accent-hover outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            >
              {phase === 'restoring' ? '>>> restoring…' : '>>> account = restore()'}
            </button>
            <p className="tnum mt-1 text-xs text-ink-3">
              Changed your mind? You can restore it for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}, on this device only.
            </p>
          </>
        )}
        {error && gone && (
          <p role="alert" className="mt-3 max-w-[36ch] font-code text-[0.8125rem] text-err">
            {error}
          </p>
        )}
      </div>

      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] h-full w-full" />
      <p className="sr-only" aria-live="assertive">
        {announce}
      </p>
    </div>,
    document.body,
  );
}
