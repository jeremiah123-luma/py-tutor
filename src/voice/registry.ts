// Every live talk controller and speaker, so one call can silence all of them. Small and eagerly loaded: the app
// shell calls silenceAll() on hide/pagehide/freeze and whenever the talk screen isn't the one on screen, even
// before the voice chunk has loaded.

export interface Silenceable {
  /** Stop speaking and listening now; stay quiet until a tap. */
  pause(): void;
  /** Shut down for good. */
  end(): Promise<void> | void;
}

export interface Hushable {
  stop(): void;
}

const controllers = new Set<Silenceable>();
const speakers = new Set<Hushable>();
let talkScreenOn = false;

export function registerController(c: Silenceable) {
  controllers.add(c);
}
export function unregisterController(c: Silenceable) {
  controllers.delete(c);
}
export function registerSpeaker(s: Hushable) {
  speakers.add(s);
}
export function unregisterSpeaker(s: Hushable) {
  speakers.delete(s);
}

/** Live controllers (tests and debugging). */
export function liveControllers(): readonly Silenceable[] {
  return [...controllers];
}

/** Pause every controller and stop every speaker. Safe to call any time, any number of times. */
export function silenceAll() {
  for (const c of [...controllers]) {
    try {
      c.pause();
    } catch {
      /* keep going: the others must still go quiet */
    }
  }
  for (const s of [...speakers]) {
    try {
      s.stop();
    } catch {
      /* ignore */
    }
  }
}

/** End every controller except `keep` (a new one ends the ones before it). */
export function endAll(keep?: Silenceable) {
  const ending: Promise<void>[] = [];
  for (const c of [...controllers]) {
    if (c === keep) continue;
    controllers.delete(c);
    try {
      const r = c.end();
      if (r) ending.push(r.catch(() => {}));
    } catch {
      /* ignore */
    }
  }
  return Promise.all(ending).then(() => {});
}

/** The app shell says whether the talk screen is the one on screen. */
export function setTalkScreenOn(on: boolean) {
  talkScreenOn = on;
  if (!on) silenceAll();
}

export function pageVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

/** Talk mode may speak (or move on by itself) only while its screen is up and the app is on screen. */
export function canSpeak() {
  return talkScreenOn && pageVisible();
}
