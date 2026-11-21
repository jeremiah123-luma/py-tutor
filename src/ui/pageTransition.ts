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
    // The button he pressed is in the old screen, which just went inert: start keyboard/screen-reader focus on the new one.
    if (el && (!document.activeElement || document.activeElement === document.body || !el.contains(document.activeElement))) {
      const h = el.querySelector<HTMLElement>('h1') ?? el;
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
    if (!el || reduceMotion()) return;
    const at = recentTap(1500) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
    const far = Math.hypot(Math.max(at.x, window.innerWidth - at.x), Math.max(at.y, window.innerHeight - at.y));
    const anim = el.animate(
      [{ clipPath: `circle(0px at ${at.x}px ${at.y}px)` }, { clipPath: `circle(${Math.ceil(far) + 2}px at ${at.x}px ${at.y}px)` }],
      { duration: DURATION, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    el.classList.add('page-entering');
    // While the circle grows, the new screen only takes taps inside it. A tap anywhere else (people tap right
    // away) finishes the reveal and goes straight to what was tapped, still inside the same gesture (so an
    // iPhone still lets that tap start the microphone).
    // (A touch that lands outside the clipped circle never becomes a click at all, so this listens for the
    // finger lifting, which iPhone also counts as the gesture.)
    let forwardedAt = -1e9;
    const early = (e: PointerEvent | MouseEvent) => {
      // the native click that follows a forwarded tap (it can land inside the new screen once the circle is full)
      if (e.type === 'click' && performance.now() - forwardedAt < 600) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (el.contains(e.target as Node)) return;
      anim.finish();
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (hit && el.contains(hit)) {
        forwardedAt = performance.now();
        e.preventDefault();
        e.stopPropagation();
        // an icon or ring (SVG) inside a button forwards to the button
        const target = hit.closest<HTMLElement>('button,a,label,input,select,textarea,[role=button],[role=tab],[role=radio]') ?? hit;
        if (target instanceof HTMLElement) target.click();
        else target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    };
    document.addEventListener('pointerup', early, true);
    document.addEventListener('click', early, true);
    const t = window.setTimeout(() => el.classList.remove('page-entering'), DURATION + 120);
    const stopEarly = () => {
      document.removeEventListener('pointerup', early, true);
      document.removeEventListener('click', early, true);
    };
    const t2 = window.setTimeout(stopEarly, DURATION + 50);
    return () => {
      anim.cancel();
      window.clearTimeout(t);
      window.clearTimeout(t2);
      stopEarly();
    };
  }, []);
  return ref;
}
