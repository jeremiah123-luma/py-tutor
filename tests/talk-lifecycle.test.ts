// Talk mode must never keep talking to an empty room: one controller at a time, silenceAll() reaches every one,
// nothing moves on by itself while hidden or off the talk screen, and auto-advance stops after a few lines.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ tts: 0 }));

vi.mock('../src/loop/api', () => ({
  speechAudio: async () => {
    api.tts++;
    return new ArrayBuffer(8);
  },
}));

vi.mock('../src/voice/audio', () => {
  const ctx = {
    state: 'running',
    resume: async () => {},
    destination: {},
    decodeAudioData: async () => ({ duration: 0.05 }),
    createBufferSource: () => {
      const src: { buffer: unknown; onended: null | (() => void); connect: () => void; start: () => void; stop: () => void } = {
        buffer: null,
        onended: null,
        connect: () => {},
        start: () => setTimeout(() => src.onended?.(), 50),
        stop: () => {},
      };
      return src;
    },
  };
  return {
    unlockAudio: () => ctx,
    audioContext: () => ctx,
    micStream: async () => ({ getAudioTracks: () => [] }),
    primeMic: async () => ({ getAudioTracks: () => [] }),
    releaseMic: () => {},
  };
});

vi.mock('../src/voice/listener', () => ({
  Listener: class {
    ready = true;
    ev: unknown;
    constructor(ev: unknown) {
      this.ev = ev;
    }
    async init() {}
    async start() {}
    async pause() {}
    async destroy() {}
  },
}));

import { MAX_AUTO_ADVANCES, PAUSED_CAPTION, TalkController } from '../src/voice/talk';
import { Speaker } from '../src/voice/speaker';
import { endAll, liveControllers, setTalkScreenOn, silenceAll } from '../src/voice/registry';
import type { Session } from '../src/loop/engine';

/** Just enough of a Session: the explanation step that moves on by itself, one scripted line per next(). */
function fakeSession() {
  const s = {
    state: { step: 'define', busy: 'idle', turns: [] as { role: string; text: string }[] },
    events: {} as Session['events'],
    nexts: 0,
    start() {
      s.line('A list holds values in order.');
    },
    next() {
      s.nexts++;
      s.line(`Line ${s.nexts} of the walkthrough.`);
    },
    line(text: string) {
      s.state.turns.push({ role: 'tutor', text });
      s.events.onTutorLine?.(text, true);
    },
    interrupt() {},
    async say() {},
    async hint() {},
  };
  return s;
}
const asSession = (s: ReturnType<typeof fakeSession>) => s as unknown as Session;

const doc = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
const g = globalThis as { document?: unknown };

beforeEach(() => {
  vi.useFakeTimers();
  g.document = doc;
  doc.visibilityState = 'visible';
  api.tts = 0;
  setTalkScreenOn(true);
});
afterEach(async () => {
  await endAll();
  setTalkScreenOn(false);
  vi.useRealTimers();
  delete g.document;
});

async function started() {
  const s = fakeSession();
  const tc = new TalkController(asSession(s));
  await tc.begin();
  await vi.advanceTimersByTimeAsync(200); // the first line is spoken; the mic opens
  return { s, tc };
}

describe('talk controller lifecycle', () => {
  it('a new controller ends the one before it', async () => {
    const a = new TalkController(asSession(fakeSession()));
    const b = new TalkController(asSession(fakeSession()));
    expect(a.isEnded).toBe(true);
    expect(b.isEnded).toBe(false);
    expect(liveControllers()).toEqual([b]);
  });

  it('moves on by itself while someone is there', async () => {
    const { s, tc } = await started();
    expect(api.tts).toBe(1);
    expect(tc.ring).toBe('listening');
    await vi.advanceTimersByTimeAsync(2700);
    expect(s.nexts).toBe(1);
    expect(api.tts).toBe(2);
  });

  it('silenceAll stops every controller: no more speech, no auto-advance', async () => {
    const { s, tc } = await started();
    silenceAll();
    expect(tc.isPaused).toBe(true);
    expect(tc.caption).toBe(PAUSED_CAPTION);
    const before = api.tts;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.tts).toBe(before);
    expect(s.nexts).toBe(0);
  });

  it('does not move on while the app is hidden, even if no event said so', async () => {
    const { s, tc } = await started();
    doc.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(s.nexts).toBe(0);
    expect(api.tts).toBe(1);
    expect(tc.isPaused).toBe(true);
  });

  it('does not move on when the talk screen is not the one up', async () => {
    const { s, tc } = await started();
    setTalkScreenOn(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(s.nexts).toBe(0);
    expect(tc.isPaused).toBe(true);
  });

  it(`stops after ${MAX_AUTO_ADVANCES} auto-advances with nobody there, and a tap picks it up again`, async () => {
    const { s, tc } = await started();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.nexts).toBe(MAX_AUTO_ADVANCES);
    expect(tc.isPaused).toBe(true);
    expect(tc.caption).toBe(PAUSED_CAPTION);
    const before = api.tts;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.tts).toBe(before);
    await tc.tap();
    await vi.advanceTimersByTimeAsync(200);
    expect(api.tts).toBe(before + 1); // the last line again
    await vi.advanceTimersByTimeAsync(2700);
    expect(s.nexts).toBe(MAX_AUTO_ADVANCES + 1); // the count starts over after a tap
  });

  it('an ended controller ignores its session and never speaks again', async () => {
    const { s, tc } = await started();
    await tc.end();
    expect(s.events).toEqual({});
    const before = api.tts;
    tc.speaker.say('Anything at all.');
    s.next();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.tts).toBe(before);
  });

  it('a speaker says nothing while its gate is shut or the app is hidden', async () => {
    const sp = new Speaker();
    await sp.unlock();
    sp.gate = () => false;
    sp.say('Not now please.');
    sp.feed('Nor this one. ');
    sp.flush();
    expect(api.tts).toBe(0);
    sp.gate = () => true;
    doc.visibilityState = 'hidden';
    sp.say('Still hidden here.');
    expect(api.tts).toBe(0);
    doc.visibilityState = 'visible';
    sp.say('Now it can talk.');
    expect(api.tts).toBe(1);
    sp.disable();
    sp.say('Not after disable.');
    expect(api.tts).toBe(1);
  });
});
