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

// The microphone is opened once, inside a tap, and kept open for the whole talk session.
// iPhones may refuse a mic request that isn't part of a tap, and the home-screen app can re-ask
// permission every time the mic is closed and reopened, so we never close it between turns.
let mic: Promise<MediaStream> | null = null;

const live = (s: MediaStream) => s.getAudioTracks().some((t) => t.readyState === 'live');

/** Call synchronously from a tap/click handler (with unlockAudio). Reuses the open mic if it's still live. */
export function primeMic(): Promise<MediaStream> {
  const fresh = () =>
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  // a refusal can be retried on the next tap (only clear it if a newer request hasn't replaced it)
  const forget = (p: Promise<MediaStream>) => p.catch(() => mic === p && (mic = null));
  if (!mic) {
    const p = fresh();
    mic = p;
    forget(p);
    return p;
  }
  const p = mic.then((s) => (live(s) ? s : fresh()));
  mic = p;
  forget(p);
  return p;
}

/** The session's mic stream (opening it if a tap hasn't already). */
export function micStream(): Promise<MediaStream> {
  return mic ?? primeMic();
}

/** Turn the mic off for good (leaving talk mode). */
export function releaseMic() {
  const m = mic;
  mic = null;
  void m?.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
}
