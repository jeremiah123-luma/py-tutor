// Page transitions: each new screen opens in a soft-edged circle from the point that was tapped, and its main
// heading lands with a small colour split that settles. About half a second. Reduced motion: no animation.
// Everything that moves is a transform or opacity, so it stays smooth on a phone while the new screen loads.
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
    const inner = el.querySelector<HTMLElement>(':scope > [data-screen-inner]');
    const rim = el.querySelector<HTMLElement>(':scope > [data-screen-rim]');
    if (!inner) return;
    const W = window.innerWidth, H = window.innerHeight;
    const at = recentTap(1500) ?? { x: W / 2, y: H * 0.35 };
    const R = Math.ceil(Math.hypot(Math.max(at.x, W - at.x), Math.max(at.y, H - at.y))) + 24;
    // Only transforms and opacity move, so the graphics chip runs it whatever the page's code is doing (a
    // clip-path circle is redrawn by Safari on the main thread every frame, and stuttered while the new screen
    // was still being built). The screen sits in a round window centred on the tap; the window scales up from
    // nothing while the screen inside scales down by exactly as much, so the page holds still and the circle grows.
    const shape: Partial<CSSStyleDeclaration> = {
      position: 'fixed', left: `${at.x - R}px`, top: `${at.y - R}px`, width: `${2 * R}px`, height: `${2 * R}px`,
      minHeight: '0', borderRadius: '50%', overflow: 'hidden', transformOrigin: '50% 50%', zIndex: '2',
    };
    Object.assign(el.style, shape);
    Object.assign(inner.style, { position: 'absolute', left: `${R - at.x}px`, top: `${R - at.y}px`, width: `${W}px`, minHeight: `${H}px`, transformOrigin: `${at.x}px ${at.y}px` });
    if (rim) rim.hidden = false;
    // cubic-bezier(0.22, 1, 0.36, 1), sampled so the two scales stay exact inverses all the way through
    const ease = (x: number) => {
      const f = (t: number, a: number, b: number) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; if (f(t, 0.22, 0.36) < x) lo = t; else hi = t; }
      return f(t, 1, 1);
    };
    const S0 = 0.04, N = 30;
    const outerK: Keyframe[] = [], innerK: Keyframe[] = [], rimK: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, s = S0 + (1 - S0) * ease(u);
      outerK.push({ transform: `scale(${s.toFixed(5)})`, offset: u });
      innerK.push({ transform: `scale(${(1 / s).toFixed(5)})`, offset: u });
      rimK.push({ opacity: u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3, offset: u });
    }
    const opts: KeyframeAnimationOptions = { duration: DURATION, easing: 'linear' };
    const anims = [el.animate(outerK, opts), inner.animate(innerK, opts)];
    if (rim) anims.push(rim.animate(rimK, opts));
    const anim = anims[0];
    const settle = () => {
      for (const k of Object.keys(shape)) el.style.removeProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()));
      for (const k of ['position', 'left', 'top', 'width', 'min-height', 'transform-origin']) inner.style.removeProperty(k);
      if (rim) rim.hidden = true;
    };
    anim.finished.then(settle, settle);
    const finishAll = () => anims.forEach((a) => a.finish());
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
      finishAll();
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
      anims.forEach((a) => a.cancel());
      settle();
      window.clearTimeout(t);
      window.clearTimeout(t2);
      stopEarly();
    };
  }, []);
  return ref;
}
