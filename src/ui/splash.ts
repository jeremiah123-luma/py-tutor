// Lifts the start-up screen in index.html once the app knows what to show (signed in or not). Each version stays
// up long enough for its own animation to land, so it never just flickers on a fast load, then plays its exit:
//   draw   fades out, growing a little and blurring
//   zoom   Command Center's "zoom through": fly into the opening of the >, the app scales up underneath
//   caret  the cursor stretches into a glowing line across the screen, and the screen splits open along it
//   wink, haze, assemble, morph: see the script in index.html
const MIN_MS = { draw: 1500, zoom: 1000, caret: 1900, wink: 2000, haze: 1500, assemble: 1650, morph: 2000 } as const;
type V = keyof typeof MIN_MS;

let done = false;
export function hideSplash() {
  if (done) return;
  done = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const v = (el.getAttribute('data-v') as V) || 'draw';
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shownAt = (window as unknown as { __splashAt?: number }).__splashAt ?? 0;
  const wait = Math.max(0, (reduce ? 300 : (MIN_MS[v] ?? 1500)) - (performance.now() - shownAt));
  window.setTimeout(() => {
    el.setAttribute('aria-hidden', 'true');
    if (reduce || typeof el.animate !== 'function') {
      el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
      window.setTimeout(() => el.remove(), 260);
      return;
    }
    // wink, haze and assemble bring their own exit (the inline script in index.html)
    const own = (window as unknown as { __splashExit?: () => number }).__splashExit;
    const ms = own ? own() : v === 'zoom' ? zoom(el) : v === 'caret' ? caret(el) : draw(el);
    window.setTimeout(() => el.remove(), ms);
  }, wait);
}

function draw(el: HTMLElement) {
  el.classList.add('out');
  return 600;
}

const root = () => document.getElementById('root');

function zoom(el: HTMLElement) {
  const box = el.querySelector<HTMLElement>('.v-zoom')!;
  const svg = box.querySelector<SVGSVGElement>('svg')!;
  // the opening of the >: between the arms, left of the point (viewBox 66,60 of 200x120)
  const r = svg.getBoundingClientRect();
  svg.style.transformOrigin = `${(66 / 200) * r.width}px ${(60 / 120) * r.height}px`;
  svg.getAnimations().forEach((a) => a.finish());
  svg.animate(
    [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(18)', opacity: 1, offset: 0.85 },
      { transform: 'scale(24)', opacity: 0 },
    ],
    { duration: 700, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards' },
  );
  box.animate([{ backgroundColor: '#111111' }, { backgroundColor: 'rgba(17,17,17,0)' }], { duration: 420, delay: 300, easing: 'ease-in', fill: 'forwards' });
  root()?.animate([{ transform: 'scale(1.08)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 600, delay: 300, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
  return 760;
}

function caret(el: HTMLElement) {
  const box = el.querySelector<HTMLElement>('.v-caret')!;
  const cur = box.querySelector<HTMLElement>('.cur')!;
  const glow = box.querySelector<HTMLElement>('.glowline')!;
  const E = 'cubic-bezier(0.16, 1, 0.3, 1)';
  // the line grows out of the cursor
  const c = cur.getBoundingClientRect();
  glow.style.transformOrigin = `${c.left + c.width / 2}px 50%`;
  cur.getAnimations().forEach((a) => a.cancel());
  cur.animate([{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(0.12)', opacity: 0 }], { duration: 220, easing: E, fill: 'forwards' });
  for (const t of box.querySelectorAll<HTMLElement>('.line i, .sp-sub'))
    t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
  glow.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 380, delay: 60, easing: E, fill: 'forwards' });
  const split = { duration: 620, delay: 380, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' as const };
  box.querySelector<HTMLElement>('.top')!.animate([{ transform: 'none' }, { transform: 'translateY(-100%)' }], split);
  box.querySelector<HTMLElement>('.bot')!.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], split);
  glow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, delay: 520, easing: 'ease-out', fill: 'forwards', composite: 'replace' });
  root()?.animate([{ transform: 'scale(0.97)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 700, delay: 380, easing: E, fill: 'backwards' });
  return 1020;
}
