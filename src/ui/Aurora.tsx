import type { ReactNode } from 'react';

/**
 * A living pastel gradient: soft blobs that drift, breathe, and slowly shift hue behind hero content.
 * Pure CSS animation (GPU transforms only), paused for reduced-motion users by the global rule.
 */
const BLOBS = [
  { c: '#A5B4FC', x: '10%', y: '15%', s: '46vmax', d: '11s', a: 'aurora-a', h: '13s' },
  { c: '#C4B5FD', x: '32%', y: '-15%', s: '40vmax', d: '13s', a: 'aurora-b', h: '17s' },
  { c: '#F9A8D4', x: '62%', y: '45%', s: '48vmax', d: '12s', a: 'aurora-c', h: '15s' },
  { c: '#A78BFA', x: '88%', y: '70%', s: '40vmax', d: '10s', a: 'aurora-a', h: '19s' },
  { c: '#FBCFE8', x: '80%', y: '-10%', s: '42vmax', d: '14s', a: 'aurora-b', h: '12s' },
  { c: '#93C5FD', x: '45%', y: '85%', s: '34vmax', d: '9s', a: 'aurora-c', h: '21s' },
];

export function Aurora({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <section className={`aurora-live relative isolate overflow-hidden text-[#111] ${className}`}>
      <div className="aurora-field absolute inset-0 -z-10" aria-hidden="true">
        {BLOBS.map((b, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: b.x,
              top: b.y,
              width: b.s,
              height: b.s,
              marginLeft: `calc(${b.s} / -2)`,
              marginTop: `calc(${b.s} / -2)`,
              background: `radial-gradient(closest-side, ${b.c}, transparent)`,
              animation: `${b.a} ${b.d} ease-in-out infinite alternate, blob-hue ${b.h} ease-in-out infinite alternate`,
              animationDelay: `${-i * 3}s`,
            }}
          />
        ))}
      </div>
      {/* halftone ramp: printed-dot fade from the gradient into the dark page */}
      <div className="halftone-ramp pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3" aria-hidden="true" />
      {/* fine grain so the gradient doesn't band */}
      <div className="aurora-grain pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      {/* fade into the page at the bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-b from-transparent to-[#111]/25" aria-hidden="true" />
      {children}
    </section>
  );
}
