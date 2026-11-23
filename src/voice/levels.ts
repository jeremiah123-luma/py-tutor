// How loud things are right now, for the talk orb: his voice (from the speech detector's frames, no second mic
// tap) and the tutor's voice (a meter between the speech audio and the speakers). Read every animation frame;
// nothing here re-renders React.
let mic = 0;
let meter: AnalyserNode | null = null;
let meterCtx: BaseAudioContext | null = null;
let buf: Float32Array<ArrayBuffer> | null = null;

/** Called by the listener with each slice of mic audio the speech detector looks at. */
export function noteMicFrame(frame: Float32Array) {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  const rms = Math.sqrt(s / Math.max(1, frame.length));
  mic = Math.min(1, rms * 9); // speech sits around 0.02 to 0.1 rms
}

/** Where the tutor's speech should connect: a meter that passes the sound straight on to the speakers. */
export function speechOut(ctx: AudioContext): AudioNode {
  if (!meter || meterCtx !== ctx) {
    meter = ctx.createAnalyser();
    meter.fftSize = 512;
    meter.smoothingTimeConstant = 0.6;
    meter.connect(ctx.destination);
    meterCtx = ctx;
    buf = new Float32Array(meter.fftSize);
  }
  return meter;
}

/** 0 to 1: the tutor's voice right now. */
export function speechLevel(): number {
  if (!meter || !buf) return 0;
  meter.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.min(1, Math.sqrt(s / buf.length) * 5);
}

/** 0 to 1: his voice right now (it decays when the detector stops sending frames). */
export function micLevel(): number {
  mic *= 0.92;
  return mic;
}
