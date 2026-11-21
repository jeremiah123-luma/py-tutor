// Small interface sounds, synthesized with Web Audio (no files). One shared Sound setting (on by default, the same
// one the intro uses) turns them all off. Like the phone's own UI sounds, these follow the silent switch on iPhone.
//
//   tutorial:  open (soft two-note chime), step (light tick), back (lower tick), done (rising chord), skip (falling pair)
//   tutor:     send (soft rising whoosh-blip), reply (gentle pop when the answer lands)
//   talk mode: listen (rising two-tone, like a voice assistant opening the mic), heard (falling two-tone when your
//              turn is sent), interrupt (short muted tap)
import { soundWanted } from '../intro/sound';

let ctx: AudioContext | null = null;
let out: GainNode | null = null;

function audio(): AudioContext | null {
  if (!soundWanted()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(ctx.destination);
    }
    if (ctx.state !== 'running') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call inside any tap so later sounds (that happen after async work) are allowed to play. */
export function unlockSfx() {
  const c = audio();
  if (!c) return;
  try {
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate);
    s.connect(c.destination);
    s.start();
  } catch {
    /* ignore */
  }
}

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function note(m: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine', glideTo?: number) {
  const c = audio();
  if (!c || !out) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz(m), t);
  if (glideTo !== undefined) o.frequency.exponentialRampToValueAtTime(hz(glideTo), t + dur * 0.8);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(at: number, dur: number, vol: number, from: number, to: number) {
  const c = audio();
  if (!c || !out) return;
  const t = c.currentTime + at;
  const len = Math.ceil(c.sampleRate * dur);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = b;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  /* tutorial */
  tourOpen() {
    note(76, 0, 0.35, 0.12, 'triangle');
    note(83, 0.09, 0.45, 0.1, 'triangle');
  },
  tourStep() {
    note(88, 0, 0.12, 0.08, 'triangle');
    noise(0, 0.08, 0.05, 3000, 6000);
  },
  tourBack() {
    note(81, 0, 0.12, 0.07, 'triangle');
  },
  tourDone() {
    [72, 76, 79, 84].forEach((m, i) => note(m, i * 0.06, 0.5, 0.09, 'triangle'));
  },
  tourSkip() {
    note(79, 0, 0.14, 0.07, 'triangle');
    note(74, 0.07, 0.2, 0.06, 'triangle');
  },
  /* the tutor */
  send() {
    noise(0, 0.18, 0.08, 800, 3200);
    note(84, 0.03, 0.12, 0.06, 'sine', 91);
  },
  reply() {
    note(79, 0, 0.16, 0.07, 'sine');
    note(86, 0.06, 0.22, 0.05, 'sine');
  },
  /* talk mode */
  listen() {
    note(76, 0, 0.11, 0.1, 'sine');
    note(83, 0.1, 0.16, 0.1, 'sine');
  },
  heard() {
    note(83, 0, 0.11, 0.09, 'sine');
    note(76, 0.1, 0.16, 0.09, 'sine');
  },
  interrupt() {
    note(67, 0, 0.08, 0.08, 'triangle');
  },
};
