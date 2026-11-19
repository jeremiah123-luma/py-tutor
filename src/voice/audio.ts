// One shared AudioContext, created and unlocked synchronously inside a tap (iOS requires the gesture).
// Kept tiny and eagerly loaded so the tap handler never waits on the lazy voice chunk.
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  return ctx;
}

/** Call synchronously from a tap/click handler. */
export function unlockAudio(): AudioContext {
  if (!ctx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctx();
  }
  if (ctx.state !== 'running') void ctx.resume();
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0);
  return ctx;
}
