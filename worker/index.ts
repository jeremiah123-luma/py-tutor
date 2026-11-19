// Cloudflare Worker: tutor (Claude), speech in/out (OpenAI), progress (KV).
// All keys stay here. Every /api route needs the passcode.
import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { concepts } from '../src/curriculum';
import { tutorParams, type TutorRequest } from './prompt';

type Env = {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  PASSCODE: string;
  TUTOR_MODEL?: string;
  STT_MODEL?: string;
  TTS_MODEL?: string;
  TTS_VOICE?: string;
  DAILY_TUTOR_CAP?: string;
  KV: KVNamespace;
  ASSETS?: Fetcher;
};

const app = new Hono<{ Bindings: Env }>();

const STT_VOCAB =
  'Python tutoring about dictionaries, files, and classes. Words: dict, key, value, .items(), .keys(), .values(), .get(), append, len, for, in, while, if, elif, else, print, input, int, str, open, with, as, read, readline, readlines, write, strip, split, close, "r", "w", "a", class, def, self, __init__, __str__, return, True, False, None, KeyError, FileNotFoundError, colon, square bracket, curly brace.';

const TTS_INSTRUCTIONS =
  'Voice: a warm, relaxed, encouraging tutor in his twenties sitting next to a friend. Natural conversational pace, slightly slower when reading code aloud. Friendly, never salesy or theatrical. Small natural pauses between ideas.';

app.use('/api/*', async (c, next) => {
  const pass = c.req.header('x-pass') ?? new URL(c.req.url).searchParams.get('pass');
  if (!c.env.PASSCODE || pass !== c.env.PASSCODE) return c.json({ error: 'locked' }, 401);
  await next();
});

app.get('/api/ping', (c) => c.json({ ok: true }));

async function underCap(env: Env): Promise<boolean> {
  const cap = Number(env.DAILY_TUTOR_CAP ?? '600');
  const key = `cap:${new Date().toISOString().slice(0, 10)}`;
  const n = Number((await env.KV.get(key)) ?? '0');
  if (n >= cap) return false;
  await env.KV.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

app.post('/api/tutor', async (c) => {
  const req = (await c.req.json()) as TutorRequest;
  const concept = concepts[req.concept as keyof typeof concepts];
  const lesson = concept?.lessons.find((l) => l.subskill === req.subskill);
  if (!concept || !lesson) return c.json({ error: 'unknown lesson' }, 400);
  if (!(await underCap(c.env))) {
    return c.text("We've hit today's practice limit, so I'm taking a break until tomorrow.␞{\"verdict\":\"none\",\"nailed\":[],\"fix\":[],\"highlightLines\":[],\"next\":\"stay\"}");
  }

  const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });
  const stream = client.beta.messages.stream(tutorParams(req, concept, lesson, c.env.TUTOR_MODEL) as any);

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const ev of stream as any) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            ctrl.enqueue(enc.encode(ev.delta.text));
          }
        }
        const final = await (stream as any).finalMessage();
        if (final.stop_reason === 'refusal') {
          ctrl.enqueue(enc.encode("\nLet's try that a different way. Can you say what you're stuck on?␞{\"verdict\":\"none\",\"next\":\"stay\"}"));
        }
      } catch (e) {
        console.error('tutor stream error', e);
        ctrl.enqueue(enc.encode("Sorry, I lost my train of thought for a second. Can you say that again?␞{\"verdict\":\"none\",\"next\":\"stay\"}"));
      }
      ctrl.close();
    },
    cancel() {
      (stream as any).abort?.(); // barge-in: stop paying for tokens he won't hear
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
});

app.post('/api/stt', async (c) => {
  const form = await c.req.formData();
  const audio = form.get('audio');
  if (!(audio instanceof File)) return c.json({ error: 'no audio' }, 400);
  const out = new FormData();
  out.append('file', audio, audio.name || 'speech.webm');
  out.append('model', c.env.STT_MODEL ?? 'gpt-4o-mini-transcribe');
  out.append('prompt', STT_VOCAB);
  out.append('language', 'en');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${c.env.OPENAI_API_KEY}` },
    body: out,
  });
  if (!r.ok) return c.json({ error: 'stt failed', detail: await r.text() }, 502);
  const j = (await r.json()) as { text: string };
  return c.json({ text: j.text });
});

app.post('/api/tts', async (c) => {
  const { text } = (await c.req.json()) as { text: string };
  if (!text?.trim()) return c.body(null, 204);
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${c.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: c.env.TTS_MODEL ?? 'gpt-4o-mini-tts',
      voice: c.env.TTS_VOICE ?? 'ash',
      input: text.slice(0, 1500),
      instructions: TTS_INSTRUCTIONS,
      response_format: 'mp3',
    }),
  });
  if (!r.ok || !r.body) return c.json({ error: 'tts failed', detail: await r.text() }, 502);
  return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
});

app.get('/api/progress', async (c) => {
  const v = await c.env.KV.get('progress');
  return c.json(v ? JSON.parse(v) : null);
});

app.put('/api/progress', async (c) => {
  const body = await c.req.json<{ updatedAt: number }>();
  const cur = await c.env.KV.get('progress');
  // last write wins by timestamp, so an old tab can't clobber newer progress
  if (cur && JSON.parse(cur).updatedAt > body.updatedAt) return c.json({ kept: 'server' });
  await c.env.KV.put('progress', JSON.stringify(body));
  return c.json({ ok: true });
});

app.all('*', (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

export default app;
