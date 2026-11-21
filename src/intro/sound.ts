// Music and sound effects for the intro, synthesized live with Web Audio: no files to download, nothing to license.
// Browsers (and iPhones especially) only allow sound after a tap, so nothing plays until the person turns it on.
//
// Music: a soft synth loop at 96 BPM. Pad chords (Cmaj9, Am9, Fmaj7, G6add9) through a low-pass, a round sub kick,
// a quiet shaker, and a plucked arpeggio that comes in after the first bar.
// Effects: the >_ bar swell, the unfold shimmer, key clicks as the wordmark types, card ticks on the topic wheel,
// whooshes for slabs wiping up, a soft thump for hard cuts, a swish when lines split away, and a rising chime for
// "Get started".

type Ctx = BaseAudioContext;

const BPM = 96;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
// MIDI notes per chord (pad voicing) and arpeggio pattern per bar
const CHORDS = [
  [48, 55, 59, 62, 64], // Cmaj9
  [45, 52, 55, 59, 60], // Am9
  [41, 48, 52, 55, 57], // Fmaj7
  [43, 50, 52, 55, 57], // G6add9
];
const ARP = [
  [72, 76, 79, 83, 79, 76, 74, 76],
  [69, 72, 76, 79, 76, 72, 71, 72],
  [65, 69, 72, 76, 72, 69, 67, 69],
  [67, 71, 74, 76, 74, 71, 69, 71],
];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * iPhone: Web Audio follows the ring/silent switch, so with the switch on silent nothing is heard. A playing
 * <audio> element (even silence) moves the page into the media audio session, which ignores the switch, the same
 * way videos do. Safari 17+ also lets a page ask for that directly (navigator.audioSession).
 */
function silentWavUrl(): string {
  const sr = 8000;
  const n = sr; // one second of silence, looped
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
let keepAlive: HTMLAudioElement | null = null;
function enterMediaAudioSession() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* not supported */
  }
  try {
    if (!keepAlive) {
      keepAlive = new Audio(silentWavUrl());
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
      keepAlive.preload = 'auto';
    }
    void keepAlive.play().catch(() => {});
  } catch {
    /* no <audio>: Web Audio still works when the switch isn't on silent */
  }
}
function releaseMediaAudioSession() {
  try {
    keepAlive?.pause();
  } catch {
    /* ignore */
  }
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: Ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 1.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export class IntroSound {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private timer = 0;
  private nextBar = 0;
  private bar = 0;
  on = false;

  /** For rendering offline (previews and checks): drive the engine with any context, starting at time 0. */
  private offline = false;
  attach(ctx: BaseAudioContext) {
    this.offline = true;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1.1;
    this.sfxBus.connect(this.master);
    this.on = true;
  }
  /** Offline: lay down the music for a stretch of time in one go. */
  renderMusic(seconds: number) {
    for (let b = 0, t = 0.05; t < seconds; b++, t += BAR) this.scheduleBar(t, b);
  }
  /** Offline: fire an effect at a given time. */
  at(seconds: number, fn: (s: IntroSound) => void) {
    this.clock = seconds;
    try {
      fn(this);
    } finally {
      this.clock = null;
    }
  }
  private clock: number | null = null;
  private now() {
    return this.clock ?? this.ctx!.currentTime;
  }

  /** Must be called inside a tap. Returns false if the browser has no Web Audio. */
  enable(): boolean {
    try {
      enterMediaAudioSession(); // inside the tap, before anything else
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        const ctx = this.ctx as AudioContext;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 4;
        this.master.connect(comp).connect(ctx.destination);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 0.55;
        this.musicBus.connect(this.master);
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.value = 1.1;
        this.sfxBus.connect(this.master);
      }
      const ctx = this.ctx as AudioContext;
      void ctx.resume();
      // iOS: play one silent sample inside the tap so the context really unlocks
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start();
      this.on = true;
      this.master!.gain.cancelScheduledValues(ctx.currentTime);
      this.master!.gain.setTargetAtTime(1.6, ctx.currentTime, 0.4);
      this.startMusic();
      return true;
    } catch {
      return false;
    }
  }

  disable() {
    if (!this.ctx || !this.master) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    window.clearInterval(this.timer);
    this.timer = 0;
    releaseMediaAudioSession();
  }

  /** Pause and resume follow the intro's tap-to-pause. */
  pause() {
    if (this.ctx && this.on && 'suspend' in this.ctx) void (this.ctx as AudioContext).suspend();
  }
  resume() {
    if (this.ctx && this.on && 'resume' in this.ctx) void (this.ctx as AudioContext).resume();
  }

  /** Fade everything out (the intro is closing). */
  end(fadeSeconds = 1.2) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + fadeSeconds);
    window.clearInterval(this.timer);
    this.timer = 0;
    const ctx = this.ctx as AudioContext;
    window.setTimeout(() => void ctx.close?.().catch(() => {}), (fadeSeconds + 0.3) * 1000);
    this.ctx = null;
    this.on = false;
    window.setTimeout(releaseMediaAudioSession, (fadeSeconds + 0.2) * 1000);
  }

  /* ---------- music ---------- */

  private startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextBar = this.ctx.currentTime + 0.08;
    const schedule = () => {
      const ctx = this.ctx;
      if (!ctx) return;
      while (this.nextBar < ctx.currentTime + 0.6) {
        this.scheduleBar(this.nextBar, this.bar);
        this.nextBar += BAR;
        this.bar++;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 150);
  }

  private scheduleBar(t: number, n: number) {
    const ctx = this.ctx!;
    const bus = this.musicBus!;
    const chord = CHORDS[n % 4];
    // pad: detuned saws through a slow low-pass swell
    const padGain = ctx.createGain();
    // each chord fades in over the tail of the last one, so the pad never dips between bars
    padGain.gain.setValueAtTime(0, t);
    padGain.gain.linearRampToValueAtTime(0.13, t + 0.35);
    padGain.gain.setValueAtTime(0.13, t + BAR);
    padGain.gain.linearRampToValueAtTime(0, t + BAR + 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1500, t + BAR / 2);
    lp.frequency.linearRampToValueAtTime(800, t + BAR);
    lp.Q.value = 0.7;
    padGain.connect(lp).connect(bus);
    for (const m of chord) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.18;
        o.connect(g).connect(padGain);
        o.start(t);
        o.stop(t + BAR + 0.75);
      }
    }
    // sub bass on the root
    this.tone(hz(chord[0] - 12), t, BAR + 0.05, 'sine', 0.24, bus, 0.03, 0.12);
    // kick on 1 and 3, a ghost on the "and" of 4
    for (const b of [0, 2, 3.5]) this.kick(t + b * BEAT, b === 3.5 ? 0.35 : 0.7);
    // shaker on 8ths
    for (let i = 0; i < 8; i++) this.hat(t + i * (BEAT / 2), i % 2 ? 0.05 : 0.025);
    // pluck arpeggio from bar 2
    if (n >= 1) {
      const arp = ARP[n % 4];
      arp.forEach((m, i) => this.pluck(hz(m), t + i * (BEAT / 2), 0.07));
    }
  }

  /* ---------- building blocks ---------- */

  private tone(f: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, attack = 0.005, release = 0.15) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private pluck(f: number, t: number, vol: number, dest: AudioNode = this.musicBus!) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(lp).connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.5);
  }

  private kick(t: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.musicBus!);
    o.start(t);
    o.stop(t + 0.35);
  }

  private hat(t: number, vol: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g).connect(this.musicBus!);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }

  /** Filtered noise sweep: whoosh (up) or swish (down). */
  private sweep(from: number, to: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const t = this.now();
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(this.sfxBus!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  private ok() {
    return !!this.ctx && this.on && (this.offline || this.ctx.state === 'running');
  }

  /* ---------- effects ---------- */

  /** The bar grows. */
  swell() {
    if (!this.ok()) return;
    const t = this.now();
    const o = this.tone(hz(60), t, 0.55, 'sine', 0.16, this.sfxBus!, 0.25, 0.25);
    o.frequency.setValueAtTime(hz(55), t);
    o.frequency.exponentialRampToValueAtTime(hz(67), t + 0.5);
  }
  /** The >_ fans open. */
  shimmer() {
    if (!this.ok()) return;
    const t = this.now();
    [79, 83, 86, 91].forEach((m, i) => this.pluck(hz(m), t + i * 0.045, 0.06, this.sfxBus!));
  }
  /** Outline flash. */
  pop() {
    if (!this.ok()) return;
    const t = this.now();
    this.tone(hz(84), t, 0.12, 'square', 0.03, this.sfxBus!, 0.002, 0.1);
    this.tone(hz(96), t + 0.01, 0.1, 'sine', 0.05, this.sfxBus!, 0.002, 0.09);
  }
  /** One key of the wordmark typing. */
  key() {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now();
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200 + Math.random() * 1400;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    s.connect(bp).connect(g).connect(this.sfxBus!);
    s.start(t, Math.random());
    s.stop(t + 0.04);
  }
  /** A selection block jumps. */
  blip(i: number) {
    if (!this.ok()) return;
    this.pluck(hz([76, 79, 83, 84, 86, 88, 91][i % 7]), this.now(), 0.05, this.sfxBus!);
  }
  /** The topic card flips. */
  tick(i: number) {
    if (!this.ok()) return;
    const t = this.now();
    this.pluck(hz([72, 76, 79][i % 3]), t, 0.09, this.sfxBus!);
    this.pluck(hz([84, 88, 91][i % 3]), t + 0.05, 0.05, this.sfxBus!);
  }
  /** A slab wipes up. */
  whoosh() {
    if (this.ok()) this.sweep(300, 2400, 0.55, 0.32);
  }
  /** A hard cut. */
  thump() {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + 0.22);
  }
  /** Lines split away. */
  swish() {
    if (this.ok()) this.sweep(3000, 500, 0.4, 0.22);
  }
  /** The app windows drift apart. */
  scatter() {
    if (!this.ok()) return;
    this.sweep(200, 1200, 0.9, 0.18);
    const t = this.now();
    [67, 71, 74].forEach((m, i) => this.pluck(hz(m), t + 0.15 + i * 0.09, 0.04, this.sfxBus!));
  }
  /** "Get started": a rising chime under the wave. */
  chime() {
    if (!this.ok()) return;
    const t = this.now();
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.pluck(hz(m), t + i * 0.06, 0.08, this.sfxBus!));
    this.sweep(400, 4000, 1.1, 0.16);
  }
}

/** Sound is opt-in; remember the choice for next time (the next visit still needs a tap to start). */
const KEY = 'py-tutor.intro.sound';
export function soundWanted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
export function rememberSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
