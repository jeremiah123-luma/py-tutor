// Page transitions: each new screen opens in a circle from the point that was tapped.
//
// Kept light on purpose so it stays smooth on a phone: the new screen's own wrapper animates a clip-path circle
// (no copy of the old page, no mask, no WebGL), and its main heading lands with a small colour split that settles.
// About 0.45 s. Reduced motion: no animation.
import { useLayoutEffect, useRef } from 'react';
import { recentTap } from './wave';

const DURATION = 500;

const reduceMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Attach to a screen's outer element: on mount it opens out of the last tap. */
export function useScreenReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    // The screen we're leaving stays mounted for a moment underneath (AnimatePresence). Pin it exactly where it
    // was on screen, so scrolling the new page to the top can't make it jump, and the new page opens over it.
    for (const old of document.querySelectorAll<HTMLElement>('[data-screen]')) {
      if (old === el) continue;
      const r = old.getBoundingClientRect();
      Object.assign(old.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, zIndex: '0', pointerEvents: 'none' });
      old.setAttribute('aria-hidden', 'true');
      old.setAttribute('inert', '');
    }
    window.scrollTo(0, 0); // every screen starts at the top
    if (!el || reduceMotion()) return;
    const at = recentTap(1500) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
    const far = Math.hypot(Math.max(at.x, window.innerWidth - at.x), Math.max(at.y, window.innerHeight - at.y));
    const anim = el.animate(
      [{ clipPath: `circle(0px at ${at.x}px ${at.y}px)` }, { clipPath: `circle(${Math.ceil(far) + 2}px at ${at.x}px ${at.y}px)` }],
      { duration: DURATION, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    el.classList.add('page-entering');
    const t = window.setTimeout(() => el.classList.remove('page-entering'), DURATION + 120);
    return () => {
      anim.cancel();
      window.clearTimeout(t);
    };
  }, []);
  return ref;
}
