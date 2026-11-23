// Lifts the start-up screen in index.html once the app knows what to show (signed in or not). It stays up until the
// word has assembled (so it never just flickers on a fast load), then plays its exit: the pieces fly off to the left,
// blurring, and the app shows through. The exit itself lives with the rest of the animation, in index.html.
const MIN_MS = 1300;

let done = false;
let gone: () => void = () => {};
const goneP = new Promise<void>((r) => (gone = r));
/** Resolves once the start-up screen has finished its exit and is off the page (right away if it isn't showing). */
export function whenSplashGone(): Promise<void> {
  return document.getElementById('splash') ? goneP : Promise.resolve();
}

export function hideSplash() {
  if (done) return;
  done = true;
  const el = document.getElementById('splash');
  if (!el) return gone();
  const w = window as unknown as { __splashAt?: number; __splashExit?: () => number };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wait = Math.max(0, (reduce ? 300 : MIN_MS) - (performance.now() - (w.__splashAt ?? 0)));
  window.setTimeout(() => {
    el.setAttribute('aria-hidden', 'true');
    let ms = 260;
    if (!reduce && w.__splashExit) ms = w.__splashExit();
    else el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    window.setTimeout(() => {
      el.remove();
      gone();
    }, ms);
  }, wait);
}
