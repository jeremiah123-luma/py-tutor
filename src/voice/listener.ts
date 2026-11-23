// Hands-free listening: on-device VAD (Silero) finds where his speech starts and ends,
// then the finished utterance goes to transcription. Paused while the tutor talks so the
// car speakers can't make the tutor interrupt itself.
import { noteMicFrame } from './levels';
import { MicVAD } from '@ricky0123/vad-web';
import { transcribe } from '../loop/api';
import { micStream, primeMic, releaseMic } from './audio';

export interface ListenerEvents {
  onSpeechStart?: () => void;
  onUtterance: (text: string) => void;
  onError?: (msg: string) => void;
  onTranscribing?: (busy: boolean) => void;
  /** The utterance produced nothing usable (silence, noise, a failed upload). */
  onNothing?: () => void;
}

export class Listener {
  private vad: MicVAD | null = null;
  private active = false;
  private destroyed = false;

  private ev: ListenerEvents;
  constructor(ev: ListenerEvents) {
    this.ev = ev;
  }

  private initing: Promise<void> | null = null;

  /** Two quick taps share one load instead of building two detectors (and leaking the first). */
  init(audioContext?: AudioContext | null): Promise<void> {
    if (this.vad) return Promise.resolve();
    if (!this.initing) this.initing = this.load(audioContext).finally(() => (this.initing = null));
    return this.initing;
  }

  private async load(audioContext?: AudioContext | null) {
    this.destroyed = false;
    try {
      const vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: '/vad/',
        onnxWASMBasePath: '/vad/',
        startOnLoad: false,
        audioContext: audioContext ?? undefined,
        // One mic stream for the whole session (opened in the tap); never stopped between turns.
        getStream: () => micStream(),
        resumeStream: () => micStream(),
        pauseStream: async () => {},
        // Road noise: demand clearer speech and a real pause before ending.
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        redemptionMs: 700,
        minSpeechMs: 300,
        preSpeechPadMs: 300,
        onSpeechStart: () => this.ev.onSpeechStart?.(),
        // each slice of audio it checks also drives the talk orb (his voice level)
        onFrameProcessed: (_p: unknown, frame: Float32Array) => noteMicFrame(frame),
        onSpeechEnd: (audio: Float32Array) => void this.handle(audio),
      });
      // left while the model was loading: don't keep a detector nobody will use
      if (this.destroyed) {
        await dispose(vad);
        throw new Error('stopped');
      }
      this.vad = vad;
    } catch (e) {
      if (this.destroyed) throw e;
      const msg = String((e as Error)?.message ?? e);
      this.ev.onError?.(
        /denied|NotAllowed/i.test(msg)
          ? 'Microphone access was blocked. Allow it in Settings, then tap to try again.'
          : "I couldn't start the microphone.",
      );
      throw e;
    }
  }

  private async handle(audio: Float32Array) {
    if (!this.active) return;
    this.ev.onTranscribing?.(true);
    let used = false;
    try {
      const text = (await transcribe(encodeWav(audio, 16000))).trim();
      if (this.destroyed) {
        used = true; // the session ended while it was transcribing: nobody to tell
        return;
      }
      if (text && !/^(you|thank you\.?|\.|bye\.?)$/i.test(text)) {
        used = true;
        this.ev.onUtterance(text);
      }
    } catch {
      this.ev.onError?.("I didn't catch that. Try again?");
    } finally {
      if (!used) this.ev.onNothing?.();
      this.ev.onTranscribing?.(false);
    }
  }

  /** Open the mic. Throws (after telling him why) if the phone refused it. */
  async start() {
    if (!this.vad) throw new Error('mic not ready');
    try {
      await this.vad.start();
      if ((this.vad as unknown as { errored?: string | null }).errored) throw new Error((this.vad as unknown as { errored: string }).errored);
      this.active = true;
    } catch (e) {
      this.active = false;
      const msg = String((e as Error)?.message ?? e);
      console.warn('[talk] mic start failed:', (e as Error)?.name, msg);
      // The VAD can't recover from a failed start: drop it so the next tap builds a fresh one.
      const dead = this.vad;
      this.vad = null;
      void dispose(dead);
      this.ev.onError?.(
        /denied|NotAllowed|permission/i.test(msg)
          ? 'The microphone is blocked. Tap to try again. If it keeps failing, allow the mic for this app in Settings.'
          : 'The microphone stopped. Tap to turn it back on.',
      );
      throw e;
    }
  }

  async pause() {
    this.active = false;
    await this.vad?.pause();
  }

  get listening() {
    return this.active;
  }

  async destroy() {
    this.active = false;
    this.destroyed = true;
    if (this.vad) await dispose(this.vad);
    this.vad = null;
    releaseMic();
  }

  /** Re-open the mic from a tap (after a failure or after iOS closed it). */
  reprime() {
    void primeMic().catch(() => {});
  }

  get ready() {
    return !!this.vad;
  }
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * The VAD runs on the app's shared AudioContext, which it doesn't own, so its destroy() leaves its audio node wired
 * up (and, on older browsers, still processing). Unhook it so each Talk session doesn't leave one behind.
 */
async function dispose(vad: MicVAD) {
  let released = true;
  await vad.destroy().catch(() => (released = false));
  // destroy() throws before freeing the voice model if the mic never started; free it here instead
  if (!released) await (vad as unknown as { model?: { release?: () => Promise<void> } }).model?.release?.().catch(() => {});
  const v = vad as unknown as { _vadNode?: AudioNode | null; _mediaStreamAudioSourceNode?: AudioNode | null };
  for (const n of [v._mediaStreamAudioSourceNode, v._vadNode]) {
    try {
      n?.disconnect();
      if (n && 'port' in n) (n as AudioWorkletNode).port.close();
      if (n && 'onaudioprocess' in n) (n as ScriptProcessorNode).onaudioprocess = null;
    } catch {
      /* already gone */
    }
  }
}
