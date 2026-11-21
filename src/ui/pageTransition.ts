// Page transitions: the next screen opens out of the point you tapped.
//
// Right before the screen changes, the current page is copied into a still overlay. The new screen renders
// underneath, and a soft-edged hole grows in the overlay from the tap point, so the new page spreads out from your
// finger. As it grows, the old page pushes away from the hole (a slight zoom out from the tap point, like a lens),
// the distortion wave rides the edge of the hole with its chromatic fringe, and the new page's headings land with a
// brief colour split that settles. About 0.9 s. Reduced motion: an instant swap.
import { distortionWave, recentTap } from './wave';

const DURATION = 900;
let busy = false;

const reduceMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** A still copy of the page as it looks right now, fixed over the viewport. */
function ghostOf(root: HTMLElement): HTMLElement {
  const ghost = document.createElement('div');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.dataset.pageGhost = '';
  ghost.className = 'page-ghost';
  const inner = root.cloneNode(true) as HTMLElement;
  inner.removeAttribute('id');
  for (const el of inner.querySelectorAll('[id], [data-tour], [data-intro]')) {
    el.removeAttribute('id');
    el.removeAttribute('data-tour');
  }
  // canvases don't copy their pixels; leave them out rather than show blank boxes
  for (const c of inner.querySelectorAll('canvas')) c.remove();
  inner.style.transform = `translateY(${-window.scrollY}px)`;
  inner.style.minHeight = `${document.documentElement.scrollHeight}px`;
  ghost.appendChild(inner);
  // keep what was typed in inputs and editors visible in the copy
  const src = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  const dst = inner.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  src.forEach((s, i) => {
    if (dst[i] && s.type !== 'password') dst[i].value = s.value;
  });
  return ghost;
}

/**
 * Change screens with the transition. `run` makes the change (set state); it may be async (the copy stays up
 * until it finishes). `origin` defaults to the last tap.
 */
export async function pageTransition(run: () => void | Promise<void>, origin?: { x: number; y: number } | null) {
  const root = document.getElementById('root');
  if (!root || busy || reduceMotion()) {
    await run();
    return;
  }
  busy = true;
  const at = origin ?? recentTap(1500) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  const ghost = ghostOf(root);
  const far = Math.hypot(Math.max(at.x, window.innerWidth - at.x), Math.max(at.y, window.innerHeight - at.y));
  ghost.style.setProperty('--px', `${at.x}px`);
  ghost.style.setProperty('--py', `${at.y}px`);
  ghost.style.setProperty('--r', '0px');
  ghost.style.transformOrigin = `${at.x}px ${at.y}px`;
  document.body.appendChild(ghost);
  try {
    await run();
    window.scrollTo(0, 0);
    await frame();
    await frame();
    // the new page's headings land with a colour split that settles
    root.classList.add('page-entering');
    // the wave rides the edge of the opening hole
    const stage = document.createElement('div');
    stage.className = 'page-wave-stage';
    document.body.appendChild(stage);
    void distortionWave(stage, { origin: at, tone: 'iridescent', tilt: false, duration: DURATION + 150 }).then(() => stage.remove());
    // the hole grows from the tap; the old page pushes away from it
    const grow = ghost.animate([{ '--r': '0px' } as Keyframe, { '--r': `${far + 160}px` } as Keyframe], {
      duration: DURATION,
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
      fill: 'forwards',
    });
    ghost.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.045)', opacity: 1, offset: 0.75 },
        { transform: 'scale(1.06)', opacity: 0 },
      ],
      { duration: DURATION, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' },
    );
    await grow.finished.catch(() => {});
    window.setTimeout(() => root.classList.remove('page-entering'), 500);
  } finally {
    ghost.remove();
    busy = false;
  }
}
