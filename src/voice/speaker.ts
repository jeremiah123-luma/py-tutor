// Speaks streamed tutor text sentence by sentence, so audio starts before the reply is finished.
// One AudioContext, unlocked on the first tap (iOS requires a gesture).
import { speechAudio } from '../loop/api';
import { unlockAudio } from './audio';
import { pageVisible, registerSpeaker, unregisterSpeaker } from './registry';

type SpeakState = 'idle' | 'speaking';

export class Speaker {
  private ctx: AudioContext | null = null;
  private buf = '';
  private queue: Promise<AudioBuffer | null>[] = [];
  private playing = false;
  private current: AudioBufferSourceNode | null = null;
  private ctrl = new AbortController();
  private gen = 0;
  onState: (s: SpeakState) => void = () => {};
  /** Fires when the last queued sentence has finished playing. */
  onDrained: () => void = () => {};
  /** Set by the owner: false while it's paused or its screen isn't up. Checked before anything is fetched or played. */
  gate: () => boolean = () => true;
  private off = false;

  constructor() {
    registerSpeaker(this);
  }

  /** May it speak right now? Never once disabled, never while the app is in the background. */
  private allowed() {
    return !this.off && pageVisible() && this.gate();
  }

  /** For good: stop and never speak again (its talk session ended). */
  disable() {
    this.off = true;
    this.stop();
    unregisterSpeaker(this);
  }

  /** Call from a tap/click handler. */
  async unlock() {
    this.ctx = unlockAudio(); // shared context; the tap handler usually unlocked it already
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  get audioContext() {
    return this.ctx;
  }

  /** Feed streamed text; complete sentences are sent to TTS right away. */
  feed(delta: string) {
    if (!this.allowed()) return;
    this.buf += delta;
    for (;;) {
      // The shortest run of whole sentences that's at least 12 characters: a short opener ("Yes!", "Close.") rides
      // along with the next sentence instead of holding up everything behind it.
      const m = this.buf.match(/^([\s\S]*?[.!?])(\s+|$)/);
      if (!m || m[2] === '') {
        // no sentence end yet: a long run without one still goes out in pieces (TTS takes at most 1500 characters)
        if (this.buf.length > 400) {
          const cut = this.buf.lastIndexOf(' ', 400);
          this.enqueue(this.buf.slice(0, cut > 100 ? cut : 400));
          this.buf = this.buf.slice(cut > 100 ? cut : 400);
          continue;
        }
        break;
      }
      let end = m[0].length;
      while (this.buf.slice(0, end).trim().length < 12) {
        const more = this.buf.slice(end).match(/^([\s\S]*?[.!?])(\s+)/);
        if (!more) break;
        end += more[0].length;
      }
      if (this.buf.slice(0, end).trim().length < 12) break; // "e.g." alone: wait for more
      this.enqueue(this.buf.slice(0, end));
      this.buf = this.buf.slice(end);
    }
  }

  /** The stream ended: speak whatever is left. */
  flush() {
    if (!this.allowed()) {
      this.buf = '';
      return; // and no onDrained: that would open the mic and carry on
    }
    if (this.buf.trim()) this.enqueue(this.buf);
    this.buf = '';
    if (!this.playing && this.queue.length === 0) this.onDrained();
  }

  /** Speak a whole known line (scripted steps). */
  say(text: string) {
    if (!this.allowed()) return;
    this.feed(text + ' ');
    this.flush();
  }

  private enqueue(sentence: string) {
    const text = sentence.trim();
    if (!text || !this.allowed()) return;
    const gen = this.gen;
    const signal = this.ctrl.signal;
    // Fetch now (in parallel with earlier sentences), play in order.
    const p = speechAudio(text, signal)
      .then((ab) => (this.ctx ? this.ctx.decodeAudioData(ab) : null))
      .catch(() => null);
    this.queue.push(p);
    if (!this.playing) void this.pump(gen);
  }

  private async pump(gen: number) {
    this.playing = true;
    this.onState('speaking');
    while (this.queue.length && gen === this.gen) {
      const audio = await this.queue.shift()!;
      if (gen !== this.gen) break;
      if (!audio || !this.ctx) continue;
      if (!this.allowed()) {
        // paused, ended, or the app went to the background while this sentence was downloading
        this.stop();
        return;
      }
      // iOS can suspend or "interrupt" the audio (a call, Siri, the mic starting): wake it before playing.
      if (this.ctx.state !== 'running') await Promise.race([this.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
      await new Promise<void>((resolve) => {
        const src = this.ctx!.createBufferSource();
        src.buffer = audio;
        src.connect(this.ctx!.destination);
        // If iOS never reports the end (audio stalled), don't hang on "Speaking" forever.
        const safety = setTimeout(resolve, audio.duration * 1000 + 2500);
        src.onended = () => {
          clearTimeout(safety);
          resolve();
        };
        this.current = src;
        src.start();
      });
      this.current = null;
    }
    if (gen === this.gen) {
      this.playing = false;
      this.onState('idle');
      this.onDrained();
    }
  }

  /** Barge-in: stop now, drop everything queued. */
  stop() {
    this.gen++;
    this.ctrl.abort();
    this.ctrl = new AbortController();
    this.queue = [];
    this.buf = '';
    try {
      this.current?.stop();
    } catch {
      /* already stopped */
    }
    this.current = null;
    if (this.playing) {
      this.playing = false;
      this.onState('idle');
    }
  }

  get isSpeaking() {
    return this.playing;
  }

  /** Instant soft two-note "got it" cue while the tutor thinks. No network. */
  ack() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.06, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.25);
    });
  }
}
