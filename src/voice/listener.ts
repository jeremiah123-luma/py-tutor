// Hands-free listening: on-device VAD (Silero) finds where his speech starts and ends,
// then the finished utterance goes to transcription. Paused while the tutor talks so the
// car speakers can't make the tutor interrupt itself.
import { MicVAD } from '@ricky0123/vad-web';
import { transcribe } from '../loop/api';

export interface ListenerEvents {
  onSpeechStart?: () => void;
  onUtterance: (text: string) => void;
  onError?: (msg: string) => void;
  onTranscribing?: (busy: boolean) => void;
}

export class Listener {
  private vad: MicVAD | null = null;
  private active = false;

  private ev: ListenerEvents;
  constructor(ev: ListenerEvents) {
    this.ev = ev;
  }

  async init(audioContext?: AudioContext | null) {
    if (this.vad) return;
    try {
      this.vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: '/vad/',
        onnxWASMBasePath: '/vad/',
        startOnLoad: false,
        audioContext: audioContext ?? undefined,
        getStream: () =>
          navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          }),
        // Road noise: demand clearer speech and a real pause before ending.
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        redemptionMs: 700,
        minSpeechMs: 300,
        preSpeechPadMs: 300,
        onSpeechStart: () => this.ev.onSpeechStart?.(),
        onSpeechEnd: (audio: Float32Array) => void this.handle(audio),
      });
    } catch (e) {
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
    try {
      const text = (await transcribe(encodeWav(audio, 16000))).trim();
      if (text && !/^(you|thank you\.?|\.|bye\.?)$/i.test(text)) this.ev.onUtterance(text);
    } catch {
      this.ev.onError?.("I didn't catch that. Try again?");
    } finally {
      this.ev.onTranscribing?.(false);
    }
  }

  async start() {
    this.active = true;
    await this.vad?.start();
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
    await this.vad?.destroy();
    this.vad = null;
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
