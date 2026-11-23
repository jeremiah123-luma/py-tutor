// While he's talking: a soft aurora along the bottom edge of the screen, the way voice assistants show they're
// hearing you. Brightest right at the edge and fading upward; taller and brighter the louder he speaks; its
// colours (py-tutor's violet, pink, sky, and the mint of "Listening") drift slowly from side to side. It fades in
// when the mic opens and out when his turn is over.
// Each colour is a soft ellipse centred on the bottom edge (only its top half shows), so there are no hard sides;
// only transforms and opacity change per frame, so it stays smooth on a phone.
import { useEffect, useRef } from 'react';
import { micLevel } from '../voice/levels';

const BLOBS = [
  { color: '139 92 246', x: -26, w: 78, speed: 0.07, phase: 0 }, //   violet
  { color: '236 72 153', x: 20, w: 70, speed: 0.06, phase: 1.7 }, //  pink
  { color: '96 165 250', x: -4, w: 92, speed: 0.05, phase: 3.1 }, //  sky
  { color: '74 222 128', x: 34, w: 56, speed: 0.08, phase: 4.4 }, //  mint
];

export function ListeningGlow({ on }: { on: boolean }) {
  const blobs = useRef<(HTMLDivElement | null)[]>([]);
  const edge = useRef<HTMLDivElement>(null);
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let amp = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const level = onRef.current ? micLevel() : 0;
      amp += (level - amp) * (level > amp ? 0.3 : 0.05);
      blobs.current.forEach((el, i) => {
        if (!el) return;
        const b = BLOBS[i];
        const sway = reduce ? 0 : Math.sin(t * b.speed * 6.28 + b.phase) * 14;
        const breathe = reduce ? 1 : 1 + Math.sin(t * b.speed * 11 + b.phase) * 0.1;
        const rise = (0.45 + amp * 0.7) * breathe; // how tall the glow stands
        el.style.transform = `translate3d(${(b.x + sway).toFixed(2)}vw, 0, 0) scale(1, ${rise.toFixed(3)})`;
      });
      if (edge.current) edge.current.style.opacity = (0.45 + amp * 0.55).toFixed(3);
      raf = document.visibilityState === 'visible' ? requestAnimationFrame(tick) : 0;
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
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[26svh] overflow-hidden transition-opacity duration-500 ease-out"
      style={{ opacity: on ? 1 : 0 }}
    >
      {BLOBS.map((b, i) => (
        <div
          key={i}
          ref={(el) => {
            blobs.current[i] = el;
          }}
          className="absolute left-1/2 rounded-full will-change-transform"
          style={{
            width: `${b.w}vw`,
            marginLeft: `${-b.w / 2}vw`,
            height: '56svh',
            bottom: '-28svh', // centred on the bottom edge: only the top half shows
            background: `radial-gradient(closest-side, rgb(${b.color} / 0.95), rgb(${b.color} / 0.5) 35%, rgb(${b.color} / 0.12) 70%, transparent)`,
          }}
        />
      ))}
      {/* the bright line of light right at the edge */}
      <div
        ref={edge}
        className="absolute inset-x-0 bottom-0 h-16"
        style={{
          background:
            'linear-gradient(to top, rgb(255 255 255 / 0.35), transparent 70%), linear-gradient(90deg, rgb(139 92 246 / 0.9), rgb(96 165 250 / 0.9), rgb(74 222 128 / 0.8), rgb(236 72 153 / 0.9), rgb(139 92 246 / 0.9))',
          maskImage: 'linear-gradient(to top, #000, transparent)',
          WebkitMaskImage: 'linear-gradient(to top, #000, transparent)',
        }}
      />
    </div>
  );
}
