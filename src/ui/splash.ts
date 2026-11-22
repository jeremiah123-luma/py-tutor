// Lifts the start-up screen in index.html once the app knows what to show (signed in or not).
// It stays up long enough for its short animation to finish, so it never just flickers on a fast load.
const MIN_MS = 1500;

let done = false;
export function hideSplash() {
  if (done) return;
  done = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shownAt = (window as unknown as { __splashAt?: number }).__splashAt ?? 0;
  const wait = Math.max(0, (reduce ? 300 : MIN_MS) - (performance.now() - shownAt));
  window.setTimeout(() => {
    el.classList.add('out');
    el.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => el.remove(), 600);
  }, wait);
}
