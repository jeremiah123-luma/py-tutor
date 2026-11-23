// The final's date as a coin: an outlined pill that turns in space, a new part of the date on each face
// (SAT, DEC, 19, then the days left, which it rests on longest). Reduced motion: it just shows the days left.
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

const HOLD = [1300, 1300, 1300, 3800]; // ms each face rests
const FLIP = 800;
const CYCLE = HOLD.reduce((a, b) => a + b, 0) + FLIP * HOLD.length;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function DateCoin({ days, size = 26, label }: { days: number; size?: number; label: string }) {
  const body = useRef<HTMLSpanElement>(null);
  const a = useRef<HTMLSpanElement>(null);
  const b = useRef<HTMLSpanElement>(null);
  const faces = useMemo(() => ['SAT', 'DEC', '19', days === 0 ? 'TODAY' : `${days} DAY${days === 1 ? '' : 'S'}`], [days]);
  const thick = Math.max(3, size * 0.12);
  const widthOf = (s: string) => Math.round(size * (0.62 + 0.42 * s.length));
  const widest = Math.max(...faces.map(widthOf));

  useEffect(() => {
    const cb = body.current;
    const A = a.current;
    const B = b.current;
    if (!cb || !A || !B) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      A.textContent = faces[3];
      cb.style.width = `${widthOf(faces[3])}px`;
      cb.style.transform = 'rotateZ(-6deg)';
      return;
    }
    let raf = 0;
    let shown = -1;
    let widened = false;
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = document.visibilityState === 'visible' ? requestAnimationFrame(tick) : 0;
      const t = now - t0;
      const cyc = Math.floor(t / CYCLE);
      let u = t - cyc * CYCLE;
      let i = 0;
      while (u >= HOLD[i] + FLIP) u -= HOLD[i++] + FLIP;
      const k = cyc * HOLD.length + i; // half-turns so far; even = front face showing
      if (k !== shown) {
        shown = k;
        widened = false;
        (k % 2 ? B : A).textContent = faces[i];
        (k % 2 ? A : B).textContent = faces[(i + 1) % faces.length];
        cb.style.width = `${widthOf(faces[i])}px`;
      }
      if (u > HOLD[i] && !widened) {
        widened = true; // the coin stretches to fit the next word while it turns
        cb.style.width = `${widthOf(faces[(i + 1) % faces.length])}px`;
      }
      const f = u < HOLD[i] ? 0 : ease((u - HOLD[i]) / FLIP);
      const s = now / 1000;
      cb.style.transform = `rotateZ(${(-8 + Math.sin(s * 0.9) * 4).toFixed(2)}deg) rotateX(${(Math.sin(s * 1.3) * 13).toFixed(2)}deg) rotateY(${((k + f) * 180).toFixed(1)}deg)`;
    };
    const wake = () => {
      if (document.visibilityState === 'visible' && !raf) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', wake);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces, size]);

  return (
    <span
      role="img"
      aria-label={label}
      className="coin"
      style={{ '--coin-h': `${size}px`, '--coin-fs': `${Math.round(size * 0.44)}px`, width: widest } as CSSProperties}
    >
      <span ref={body} className="coin-body" style={{ width: widthOf(faces[3]) }}>
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} className="coin-rim" style={{ transform: `translateZ(${((i / 6 - 0.5) * thick).toFixed(2)}px)` }} />
        ))}
        <span ref={a} className="coin-face" style={{ transform: `translateZ(${(thick / 2 + 0.6).toFixed(2)}px)` }}>
          {faces[3]}
        </span>
        <span ref={b} className="coin-face" style={{ transform: `rotateY(180deg) translateZ(${(thick / 2 + 0.6).toFixed(2)}px)` }} />
      </span>
    </span>
  );
}
