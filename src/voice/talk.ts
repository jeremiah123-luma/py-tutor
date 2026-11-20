// Talk-mode controller: wires a Session to the speaker and listener.
// Turn-taking: tutor speaks (mic paused) -> mic opens -> he talks -> ack chime -> tutor thinks -> speaks...
// Tap anywhere = interrupt the tutor / start listening. Scripted steps auto-advance after they're spoken.
import type { Session } from '../loop/engine';
import { Listener } from './listener';
import { Speaker } from './speaker';

export type RingState = 'idle' | 'listening' | 'thinking' | 'speaking';

const NAV = /^(next|go on|continue|okay next|keep going|got it|ok(ay)?|yes|yeah|sure)[.!]?$/i;
const REPEAT = /^(repeat|say (that|it) again|again|what\?)[.!?]?$/i;
const HINT = /\b(hint|i'?m stuck|help me)\b/i;

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

  private session: Session;

  constructor(session: Session) {
    this.session = session;
    this.listener = new Listener({
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
    session.events = {
      onTutorText: (d) => {
        this.speaker.feed(d);
        this.caption += d;
        this.emit();
      },
      onTutorLine: (text, scripted) => {
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

  /** Must be called from a tap. Starts talking right away; the mic model loads in parallel. */
  async begin() {
    this.stopped = false;
    await this.speaker.unlock();
    this.update({ ring: 'thinking' });
    void this.keepAwake();
    this.micReady = this.initMic();
    if (this.session.state.turns.length === 0) this.session.start();
    else this.speaker.say(this.session.state.turns.at(-1)!.text);
  }

  /** Whole screen is this button. */
  async tap() {
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
      if (!this.listener.ready) this.micReady = this.initMic();
      await this.openMic();
    }
  }

  private async afterSpeech() {
    if (this.stopped) return;
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
    if (this.stopped) return;
    if (!(await this.micReady)) {
      this.update({ ring: 'idle' });
      return;
    }
    try {
      await this.listener.start();
    } catch {
      // The listener already said what went wrong; a tap tries again.
      this.update({ ring: 'idle' });
      return;
    }
    this.update({ ring: 'listening', error: '' });
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    if (autoAdvanceMs) {
      this.advanceTimer = setTimeout(() => {
        if (this.ring === 'listening' && this.session.state.busy === 'idle') {
          void this.listener.pause();
          this.session.next();
        }
      }, autoAdvanceMs);
    }
  }

  private async onUtterance(text: string) {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    await this.listener.pause();
    this.update({ heard: text, ring: 'thinking' });
    this.speaker.ack();
    const s = this.session;
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
      try {
        this.wake = (await (navigator as any).wakeLock?.request('screen')) ?? null;
      } catch {
        /* ignore */
      }
    }
  };

  async end() {
    this.stopped = true;
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.speaker.stop();
    this.session.interrupt();
    await this.listener.destroy();
    document.removeEventListener('visibilitychange', this.reacquire);
    await this.wake?.release().catch(() => {});
    this.update({ ring: 'idle' });
  }
}
