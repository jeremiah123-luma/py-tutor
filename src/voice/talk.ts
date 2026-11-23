// Talk-mode controller: wires a Session to the speaker and listener.
// Turn-taking: tutor speaks (mic paused) -> mic opens -> he talks -> ack chime -> tutor thinks -> speaks...
// Tap anywhere = interrupt the tutor / start listening. Scripted steps auto-advance after they're spoken.
import type { Session } from '../loop/engine';
import { Listener } from './listener';
import { Speaker } from './speaker';
import { micStream } from './audio';
import { canSpeak, endAll, registerController, unregisterController } from './registry';

export type RingState = 'idle' | 'listening' | 'thinking' | 'speaking';

const NAV = /^(next|go on|continue|okay next|keep going|got it|ok(ay)?|yes|yeah|sure)[.!]?$/i;
const REPEAT = /^(repeat|say (that|it) again|again|what\?)[.!?]?$/i;
const HINT = /\b(hint|i'?m stuck|help me)\b/i;

/**
 * The explanation steps move on by themselves after a short silence; after this many in a row with no tap and
 * nothing said, it stops and waits for a tap, so it can never read a whole topic to an empty room.
 */
export const MAX_AUTO_ADVANCES = 6;
export const PAUSED_CAPTION = 'Paused. Tap to keep going.';

export class TalkController {
  readonly speaker = new Speaker();
  private listener: Listener;
  private wake: WakeLockSentinel | null = null;
  private stopped = false;
  ring: RingState = 'idle';
  caption = '';
  heard = '';
  error = '';
  private subs = new Set<() => void>();
  /** Set by the app: move on to the next skill (he said "next" after passing). */
  onNextSkill: () => void = () => {};
  private begunAt = -Infinity;

  private session: Session;
  /** Explanation steps moved on by themselves since he last tapped or said something. */
  private autoAdvances = 0;
  /** The handlers this controller put on its session (cleared on end, only if they're still ours). */
  private bound: Session['events'] | null = null;

  constructor(session: Session) {
    // Only one talk session at a time: a new one ends any that came before (a leftover would keep talking with
    // nobody able to reach it).
    void endAll(this);
    registerController(this);
    this.session = session;
    this.listener = new Listener({
      // Nothing usable came back (silence, a cough, a failed upload): listen again instead of sitting on "Thinking".
      onNothing: () => {
        if (!this.stopped && !this.paused && this.ring === 'thinking' && this.session.state.busy === 'idle') void this.listenNext();
      },
      onUtterance: (t) => void this.onUtterance(t),
      // He started talking: never auto-advance over him.
      onSpeechStart: () => {
        if (this.advanceTimer) clearTimeout(this.advanceTimer);
        this.advanceTimer = null;
      },
      onError: (m) => this.update({ error: m }),
      onTranscribing: (b) => b && this.update({ ring: 'thinking' }),
    });
    this.speaker.onState = (s) => {
      if (s === 'speaking') void this.listener.pause();
      this.update({ ring: s === 'speaking' ? 'speaking' : this.ring });
    };
    this.speaker.onDrained = () => void this.afterSpeech();
    this.speaker.gate = () => this.live;
    this.bind(session);
  }

  /** Allowed to speak and move on: not paused or ended, its screen is up and the app is on screen. */
  private get live() {
    return !this.stopped && !this.paused && canSpeak();
  }

  private bind(session: Session) {
    this.bound = session.events = {
      onTutorText: (d) => {
        if (this.stopped || this.paused) return;
        this.speaker.feed(d);
        this.caption += d;
        this.emit();
      },
      onTutorLine: (text, scripted) => {
        if (this.stopped || this.paused) return;
        if (scripted) {
          this.caption = text;
          this.speaker.say(text);
        } else {
          this.caption = text;
          this.speaker.flush();
        }
        this.emit();
      },
    };
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  private emit() {
    this.subs.forEach((f) => f());
  }
  private update(p: Partial<Pick<TalkController, 'ring' | 'caption' | 'heard' | 'error'>>) {
    Object.assign(this, p);
    this.emit();
  }

  private micReady: Promise<boolean> = Promise.resolve(false);

  /**
   * Next skill, still in Talk mode: keep the open mic and listener (reopening it can re-ask permission on an
   * iPhone home-screen app) and start the new lesson right away.
   */
  async adopt(session: Session) {
    if (this.stopped) return;
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.speaker.stop();
    this.session.interrupt();
    this.session.events = {};
    void this.listener.pause();
    this.session = session;
    this.paused = false; // he moved on himself (a tap or "next")
    this.autoAdvances = 0;
    this.bind(session);
    this.caption = '';
    this.heard = '';
    this.begunAt = performance.now();
    this.update({ ring: 'thinking', error: '' });
    session.start();
  }

  /** Must be called from a tap. Starts talking right away; the mic model loads in parallel. */
  async begin() {
    if (this.stopped) return;
    this.begunAt = performance.now();
    this.autoAdvances = 0;
    await this.speaker.unlock(); // can stall on iPhone; Done may be tapped meanwhile
    if (this.stopped || this.paused) return;
    this.update({ ring: 'thinking' });
    void this.keepAwake();
    this.micReady = this.initMic();
    if (this.session.state.turns.length === 0) this.session.start();
    else this.speaker.say(this.session.state.turns.at(-1)!.text);
  }

  /** The app went to the background (another app, the lock button, the app switcher). */
  private paused = false;
  /**
   * Stop talking and listening right away and stay quiet until a tap. Without this, the explanation steps kept
   * moving on by themselves and the mic kept answering whatever it heard while the app wasn't even on screen.
   */
  pause(caption = PAUSED_CAPTION) {
    if (this.stopped || this.paused) return;
    this.paused = true;
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.speaker.stop();
    this.session.interrupt();
    void this.listener.pause();
    this.update({ ring: 'idle', error: '', caption });
  }
  get isPaused() {
    return this.paused;
  }
  get isEnded() {
    return this.stopped;
  }

  /** Whole screen is this button. */
  async tap() {
    // a double tap to start shouldn't cut off the first line it just started
    if (performance.now() - this.begunAt < 700) return;
    if (this.stopped) return;
    this.autoAdvances = 0; // he's here
    if (this.paused) {
      // pick up where it stopped: say the last line again, then the usual flow carries on
      this.paused = false;
      this.begunAt = performance.now();
      await this.speaker.unlock();
      if (this.stopped || this.paused) return;
      const last = [...this.session.state.turns].reverse().find((t) => t.role === 'tutor');
      this.caption = last?.text ?? '';
      if (last) this.speaker.say(last.text);
      else await this.listenNext();
      this.emit();
      return;
    }
    if (this.ring === 'speaking' || this.ring === 'thinking') {
      this.speaker.stop();
      this.session.interrupt();
      await this.openMic();
      return;
    }
    if (this.ring === 'idle') {
      if (!this.speaker.audioContext) return this.begin();
      await this.speaker.unlock();
      // The mic failed earlier (or iOS dropped it): build a fresh listener from this tap.
      if (!this.listener.ready) this.micReady = this.initMic(); // also after micEnded
      await this.listenNext();
    }
  }

  private async afterSpeech() {
    if (this.stopped || this.paused) return;
    await this.listenNext();
  }

  /** Open the mic for his turn; on the explanation steps the lesson moves on by itself if he says nothing. */
  private async listenNext() {
    if (this.stopped || this.paused) return;
    const step = this.session.state.step;
    // Scripted explanation steps flow on by themselves; he can say "repeat" or ask anything.
    if ((step === 'define' || step === 'example' || step === 'walkthrough') && this.session.state.busy === 'idle') {
      await this.openMic(2600); // a short window to ask a question before moving on
      return;
    }
    await this.openMic();
  }

  private advanceTimer: ReturnType<typeof setTimeout> | null = null;

  private initMic() {
    return this.listener.init(this.speaker.audioContext).then(
      () => true,
      () => false,
    );
  }

  private async openMic(autoAdvanceMs?: number) {
    if (this.stopped || this.paused) return;
    if (!(await this.micReady)) {
      if (!this.stopped && !this.paused) this.update({ ring: 'idle' });
      return;
    }
    if (this.stopped || this.paused) return; // paused or ended while the mic model loaded
    try {
      await this.listener.start();
    } catch {
      // The listener already said what went wrong; a tap tries again.
      if (!this.stopped) this.update({ ring: 'idle' });
      return;
    }
    if (this.stopped || this.paused) {
      // paused or ended while the mic was starting: close it again, and no timer
      void this.listener.pause();
      return;
    }
    this.update({ ring: 'listening', error: '', heard: '' }); // a new turn: last turn's words go
    void micStream()
      .then((s) => s.getAudioTracks().forEach((t) => t.addEventListener('ended', this.micEnded, { once: true })))
      .catch(() => {});
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    if (autoAdvanceMs) {
      this.advanceTimer = setTimeout(() => {
        this.advanceTimer = null;
        if (this.stopped || this.paused || this.ring !== 'listening' || this.session.state.busy !== 'idle') return;
        // not on screen (background, or another screen is up): never move on to an empty room
        if (!canSpeak()) return this.pause();
        if (this.autoAdvances >= MAX_AUTO_ADVANCES) return this.pause(); // nobody's there: wait for a tap
        this.autoAdvances++;
        void this.listener.pause();
        this.session.next();
      }, autoAdvanceMs);
    }
  }

  /** iOS turned the mic off (backgrounded, a call, Siri). Say so; a tap opens a fresh one. */
  private micEnded = () => {
    if (this.stopped) return;
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    void this.listener.destroy();
    this.micReady = Promise.resolve(false);
    this.update({ ring: 'idle', error: 'The microphone turned off. Tap to turn it back on.' });
  };

  private async onUtterance(text: string) {
    if (this.paused || this.stopped) return; // heard just as the app went to the background
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    await this.listener.pause();
    if (this.paused || this.stopped) return; // paused or ended during that await: don't send it on
    this.autoAdvances = 0; // he said something
    this.update({ heard: text, ring: 'thinking' });
    const s = this.session;
    // Quick check is tap-only (it isn't read aloud yet), so in talk mode it counts as done: "next" moves on
    if (NAV.test(text) && (s.state.step === 'check' || s.state.step === 'mastered' || s.state.step === 'quiz')) {
      this.onNextSkill();
      return;
    }
    if (NAV.test(text) && ['define', 'example', 'walkthrough', 'feedback'].includes(s.state.step)) {
      s.next();
      return;
    }
    if (REPEAT.test(text)) {
      const last = [...s.state.turns].reverse().find((t) => t.role === 'tutor');
      if (last) this.speaker.say(last.text);
      return;
    }
    this.caption = '';
    if (HINT.test(text) && (s.state.step === 'talkthrough' || s.state.step === 'doit')) await s.hint();
    else await s.say(text);
  }

  private async keepAwake() {
    try {
      this.wake = (await (navigator as any).wakeLock?.request('screen')) ?? null;
      document.addEventListener('visibilitychange', this.reacquire);
    } catch {
      /* not supported: the screen note covers it */
    }
  }
  private reacquire = async () => {
    if (document.visibilityState === 'visible' && !this.stopped) {
      // back from the background: iOS may have killed the mic without an "ended" event reaching us
      if (this.ring === 'listening') {
        const alive = await micStream()
          .then((s) => s.getAudioTracks().some((t) => t.readyState === 'live'))
          .catch(() => false);
        if (!alive) this.micEnded();
      }
      try {
        this.wake = (await (navigator as any).wakeLock?.request('screen')) ?? null;
      } catch {
        /* ignore */
      }
    }
  };

  async end() {
    if (this.stopped) return;
    this.stopped = true;
    unregisterController(this);
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.speaker.disable();
    this.session.interrupt();
    if (this.session.events === this.bound) this.session.events = {}; // nothing the session says reaches us now
    this.bound = null;
    await this.listener.destroy();
    document.removeEventListener('visibilitychange', this.reacquire);
    await this.wake?.release().catch(() => {});
    this.update({ ring: 'idle' });
  }
}
