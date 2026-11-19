// Speaks streamed tutor text sentence by sentence, so audio starts before the reply is finished.
// One AudioContext, unlocked on the first tap (iOS requires a gesture).
import { speechAudio } from '../loop/api';
import { unlockAudio } from './audio';

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
    this.buf += delta;
    for (;;) {
      const m = this.buf.match(/^([\s\S]*?[.!?])(\s+|$)/);
      // Hold back very short fragments ("e.g.", "1.") until more arrives.
      if (!m || m[1].trim().length < 12 || m[2] === '') break;
      this.enqueue(m[1]);
      this.buf = this.buf.slice(m[0].length);
    }
  }

  /** The stream ended: speak whatever is left. */
  flush() {
    if (this.buf.trim()) this.enqueue(this.buf);
    this.buf = '';
    if (!this.playing && this.queue.length === 0) this.onDrained();
  }

  /** Speak a whole known line (scripted steps). */
  say(text: string) {
    this.feed(text + ' ');
    this.flush();
  }

  private enqueue(sentence: string) {
    const text = sentence.trim();
    if (!text) return;
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
      await new Promise<void>((resolve) => {
        const src = this.ctx!.createBufferSource();
        src.buffer = audio;
        src.connect(this.ctx!.destination);
        src.onended = () => resolve();
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
