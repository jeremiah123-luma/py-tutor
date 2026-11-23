// The talk orb, rendered in Blender (frosted glass with a glowing ribbon folding inside; scripts/orb_scene.py).
// Three seamless loops, one per mood, cross-fade as the conversation moves:
//   idle / listening  the calm loop      thinking  the faster, tighter loop      speaking  the livelier loop
// On top of the video, a light live layer keeps it responsive: the orb swells a little and its halo brightens
// with his voice (listening) or the tutor's (speaking). The video's square edge is masked into a soft circle,
// so it melts into the talk screen's background. Reduced motion: the first frame, still.
import { useEffect, useRef } from 'react';
import type { TalkState } from '../screens/TalkScreen';
import { micLevel, speechLevel } from '../voice/levels';

const LOOPS = ['idle', 'thinking', 'speaking'] as const;
type Loop = (typeof LOOPS)[number];
const loopFor = (s: TalkState): Loop => (s === 'thinking' ? 'thinking' : s === 'speaking' ? 'speaking' : 'idle');

export function OrbVideo({ state }: { state: TalkState }) {
  const wrap = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const vids = useRef<Partial<Record<Loop, HTMLVideoElement | null>>>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const active = loopFor(state);

  // only the visible loop plays (the others pause, to save battery)
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const k of LOOPS) {
      const v = vids.current[k];
      if (!v) continue;
      if (k === active && !reduce) void v.play().catch(() => {});
      else if (k !== active) window.setTimeout(() => v.pause(), 450); // after the cross-fade
    }
  }, [active]);

  // the live layer: a small swell and a brighter halo with the voice that's talking right now
  useEffect(() => {
    let raf = 0;
    let amp = 0;
    const tick = () => {
      const s = stateRef.current;
      const level = s === 'listening' ? micLevel() : s === 'speaking' ? speechLevel() : 0;
      amp += (level - amp) * (level > amp ? 0.35 : 0.08);
      if (wrap.current) wrap.current.style.transform = `scale(${(1 + amp * 0.06).toFixed(4)})`;
      if (halo.current) halo.current.style.opacity = (0.35 + amp * 0.65).toFixed(3);
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
    <div className="relative size-full" aria-hidden="true">
      {/* a soft halo in the ribbon's colours, behind the glass; it brightens with the voice */}
      <div
        ref={halo}
        className="absolute inset-[14%] rounded-full opacity-35 blur-2xl transition-opacity duration-150"
        style={{ background: 'radial-gradient(circle, rgb(167 139 250 / 0.55), rgb(244 114 182 / 0.25) 55%, transparent 72%)' }}
      />
      <div ref={wrap} className="absolute inset-0 will-change-transform">
        {LOOPS.map((k) => (
          <video
            key={k}
            ref={(el) => {
              vids.current[k] = el;
            }}
            src={`/orb/${k}.mp4`}
            poster={`/orb/${k}.jpg`}
            muted
            loop
            playsInline
            preload={k === 'idle' ? 'auto' : 'metadata'}
            disablePictureInPicture
            className="absolute inset-0 size-full object-contain transition-opacity duration-[450ms] ease-out"
            style={{
              opacity: k === active ? 1 : 0,
              // the frame is square: fade its edges into a circle so it melts into the background
              maskImage: 'radial-gradient(closest-side, #000 86%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(closest-side, #000 86%, transparent 100%)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
