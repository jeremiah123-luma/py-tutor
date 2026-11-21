// Cloudflare Worker: accounts, tutor (Claude), speech in/out (OpenAI), progress (KV).
// All keys stay here. Every /api route except sign-in needs a signed-in account.
import Anthropic from '@anthropic-ai/sdk';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { concepts } from '../src/curriculum';
import { USERNAME_RE, Store, b64u, checkPassword, hashPassword, normUsername, randomId, type CreditRequest, type User } from './accounts';
import { PRICES, claudeCost, nyDate, type ClaudeUsage } from './budget';
import { tutorParams, type TutorRequest } from './prompt';

type Env = {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  /** Code that makes an admin account (the old passcode). Sign-up itself is open. */
  ADMIN_CODE: string;
  /** Monthly AI budget for the class, USD. */
  MONTHLY_BUDGET_USD?: string;
  /** Where "Ask for more" emails go. */
  ADMIN_EMAIL?: string;
  TUTOR_MODEL?: string;
  STT_MODEL?: string;
  TTS_MODEL?: string;
  TTS_VOICE?: string;
  KV: KVNamespace;
  ASSETS?: Fetcher;
};

type Vars = { user: User; store: Store };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const STT_VOCAB =
  'Python tutoring about dictionaries, files, and classes. Words: dict, key, value, .items(), .keys(), .values(), .get(), append, len, for, in, while, if, elif, else, print, input, int, str, open, with, as, read, readline, readlines, write, strip, split, close, "r", "w", "a", class, def, self, __init__, __str__, return, True, False, None, KeyError, FileNotFoundError, colon, square bracket, curly brace.';

const TTS_INSTRUCTIONS =
  'Voice: a warm, relaxed, encouraging tutor in his twenties sitting next to a friend. Natural conversational pace, slightly slower when reading code aloud. Friendly, never salesy or theatrical. Small natural pauses between ideas.';

const budget = (c: C) => Number(c.env.MONTHLY_BUDGET_USD ?? '30');
const SID = 'sid';

function startSession(c: C, token: string) {
  const https = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SID, token, { httpOnly: true, secure: https, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 60 });
}

const publicUser = (u: User) => ({ id: u.id, name: u.name, username: u.username, admin: u.admin, passkeys: u.passkeys.length });

function rp(c: C) {
  const url = new URL(c.req.url);
  return { rpID: url.hostname, origin: url.origin, rpName: 'py-tutor' };
}

app.use('/api/*', async (c, next) => {
  c.set('store', new Store(c.env.KV));
  await next();
});

// ---------- sign up / sign in (no session needed) ----------

async function tooManyTries(store: Store, key: string, limit = 10) {
  return Number((await store.raw().get(`fail:${key}`)) ?? '0') >= limit;
}
async function noteFail(store: Store, key: string) {
  const n = Number((await store.raw().get(`fail:${key}`)) ?? '0');
  await store.raw().put(`fail:${key}`, String(n + 1), { expirationTtl: 15 * 60 });
}

app.post('/api/auth/signup', async (c) => {
  const store = c.get('store');
  const b = await c.req.json<{ name?: string; username?: string; password?: string; code?: string }>().catch(() => ({}) as any);
  const name = String(b.name ?? '').trim().slice(0, 40);
  const username = normUsername(String(b.username ?? ''));
  const password = String(b.password ?? '');
  const code = String(b.code ?? '').trim();
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  // Sign-up is open (no class code). At most 40 new accounts per IP every 15 minutes: enough for a whole class
  // on one campus Wi-Fi address, low enough that nobody can farm accounts.
  if (await tooManyTries(store, `signup:${ip}`, 40)) return c.json({ error: 'Too many new accounts from here. Wait 15 minutes and try again.' }, 429);
  const admin = !!c.env.ADMIN_CODE && code === c.env.ADMIN_CODE; // admin accounts are made through the API only
  if (!name) return c.json({ error: 'Enter your name.', field: 'name' }, 400);
  if (!USERNAME_RE.test(username))
    return c.json({ error: 'Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.', field: 'username' }, 400);
  if (password.length < 8) return c.json({ error: 'Use at least 8 characters for your password.', field: 'password' }, 400);
  if (await store.userByName(username)) return c.json({ error: 'That username is taken. Try another.', field: 'username' }, 409);
  const user: User = { id: randomId(12), username, name, admin, createdAt: Date.now(), pw: await hashPassword(password), passkeys: [], bonus: 0 };
  await store.createUser(user);
  await noteFail(store, `signup:${ip}`);
  startSession(c, await store.newSession(user.id));
  return c.json({ user: publicUser(user) });
});

app.post('/api/auth/login', async (c) => {
  const store = c.get('store');
  const b = await c.req.json<{ username?: string; password?: string }>().catch(() => ({}) as any);
  const username = normUsername(String(b.username ?? ''));
  // Per username and network, so typing someone else's username wrong can't lock them out everywhere.
  const failKey = `login:${username}:${c.req.header('cf-connecting-ip') ?? 'local'}`;
  if (await tooManyTries(store, failKey)) return c.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429);
  const user = username ? await store.userByName(username) : null;
  if (!user || !(await checkPassword(user, String(b.password ?? '')))) {
    await noteFail(store, failKey);
    return c.json({ error: 'That username and password don’t match.' }, 401);
  }
  await store.raw().delete(`fail:${failKey}`);
  startSession(c, await store.newSession(user.id));
  return c.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', async (c) => {
  const t = getCookie(c, SID);
  if (t) await c.get('store').endSession(t);
  deleteCookie(c, SID, { path: '/' });
  return c.json({ ok: true });
});

app.post('/api/passkey/login/options', async (c) => {
  const { rpID } = rp(c);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  const id = randomId();
  await c.get('store').raw().put(`chal:${id}`, options.challenge, { expirationTtl: 300 });
  return c.json({ id, options });
});

app.post('/api/passkey/login/verify', async (c) => {
  const store = c.get('store');
  const { id, response } = await c.req.json<{ id: string; response: any }>();
  const challenge = await store.raw().get(`chal:${id}`);
  if (!challenge) return c.json({ error: 'That took too long. Try again.' }, 400);
  await store.raw().delete(`chal:${id}`);
  const uid = await store.raw().get(`cred:${response?.id}`);
  const user = uid ? await store.user(uid) : null;
  const pk = user?.passkeys.find((p) => p.id === response?.id);
  if (!user || !pk) return c.json({ error: 'This passkey isn’t linked to an account here. Sign in with your password.' }, 401);
  const { rpID, origin } = rp(c);
  try {
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: pk.id, publicKey: b64u.to(pk.publicKey), counter: pk.counter, transports: pk.transports as any },
    });
    if (!v.verified) throw new Error('not verified');
    pk.counter = v.authenticationInfo.newCounter;
    await store.saveUser(user);
  } catch (e) {
    console.warn('passkey login failed', e);
    return c.json({ error: 'The passkey didn’t check out. Sign in with your password.' }, 401);
  }
  startSession(c, await store.newSession(user.id));
  return c.json({ user: publicUser(user) });
});

// ---------- everything below needs a signed-in account ----------

app.use('/api/*', async (c, next) => {
  const user = await c.get('store').sessionUser(getCookie(c, SID));
  if (!user) return c.json({ error: 'locked' }, 401);
  c.set('user', user);
  await next();
});

app.get('/api/me', async (c) => {
  const u = c.get('user');
  return c.json({ user: publicUser(u), usage: await c.get('store').usage(u, budget(c)) });
});

app.post('/api/passkey/register/options', async (c) => {
  const u = c.get('user');
  const { rpID, rpName } = rp(c);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: u.username,
    userDisplayName: u.name,
    userID: new TextEncoder().encode(u.id),
    attestationType: 'none',
    excludeCredentials: u.passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  await c.get('store').raw().put(`chal:reg:${u.id}`, options.challenge, { expirationTtl: 300 });
  return c.json(options);
});

app.post('/api/passkey/register/verify', async (c) => {
  const store = c.get('store');
  const u = c.get('user');
  const response = await c.req.json<any>();
  const challenge = await store.raw().get(`chal:reg:${u.id}`);
  if (!challenge) return c.json({ error: 'That took too long. Try again.' }, 400);
  await store.raw().delete(`chal:reg:${u.id}`);
  const { rpID, origin } = rp(c);
  try {
    const v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID });
    if (!v.verified) throw new Error('not verified');
    const cred = v.registrationInfo.credential;
    const fresh = (await store.user(u.id)) ?? u;
    fresh.passkeys = [
      ...fresh.passkeys.filter((p) => p.id !== cred.id),
      { id: cred.id, publicKey: b64u.from(cred.publicKey), counter: cred.counter, transports: cred.transports },
    ];
    await store.saveUser(fresh);
    await store.raw().put(`cred:${cred.id}`, u.id);
    return c.json({ user: publicUser(fresh) });
  } catch (e) {
    console.warn('passkey register failed', e);
    return c.json({ error: 'The passkey couldn’t be saved. Try again.' }, 400);
  }
});

// ---------- AI routes: each checks the cap, then records what it cost ----------

async function capCheck(c: C) {
  const u = c.get('user');
  const usage = await c.get('store').usage(u, budget(c));
  return usage.capped ? c.json({ error: 'cap', usage }, 402) : null;
}

app.post('/api/tutor', async (c) => {
  const req = (await c.req.json()) as TutorRequest;
  const concept = concepts[req.concept as keyof typeof concepts];
  const lesson = concept?.lessons.find((l) => l.subskill === req.subskill);
  if (!concept || !lesson) return c.json({ error: 'unknown lesson' }, 400);
  const capped = await capCheck(c);
  if (capped) return capped;
  const user = c.get('user');
  const store = c.get('store');
  req.learnerName = user.name.split(/\s+/)[0];

  const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });
  const stream = client.beta.messages.stream(tutorParams(req, concept, lesson, c.env.TUTOR_MODEL) as any);
  const usage: ClaudeUsage = {};
  let charged = false;
  const chargeOnce = () => {
    if (charged) return;
    charged = true;
    c.executionCtx.waitUntil(store.charge(user, claudeCost(usage), budget(c)));
  };

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const ev of stream as any) {
          if (ev.type === 'message_start') Object.assign(usage, ev.message?.usage ?? {});
          if (ev.type === 'message_delta' && ev.usage) Object.assign(usage, Object.fromEntries(Object.entries(ev.usage).filter(([, v]) => v != null)));
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') ctrl.enqueue(enc.encode(ev.delta.text));
        }
        const final = await (stream as any).finalMessage();
        if (final.usage) Object.assign(usage, final.usage);
        if (final.stop_reason === 'refusal') {
          ctrl.enqueue(enc.encode("\nLet's try that a different way. Can you say what you're stuck on?␞{\"verdict\":\"none\",\"next\":\"stay\"}"));
        }
      } catch (e) {
        console.error('tutor stream error', e);
        ctrl.enqueue(enc.encode("Sorry, I lost my train of thought for a second. Can you say that again?␞{\"verdict\":\"none\",\"next\":\"stay\"}"));
      }
      chargeOnce();
      ctrl.close();
    },
    cancel() {
      (stream as any).abort?.(); // barge-in: stop paying for tokens nobody will hear
      chargeOnce();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
});

app.post('/api/stt', async (c) => {
  const capped = await capCheck(c);
  if (capped) return capped;
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
  c.executionCtx.waitUntil(c.get('store').charge(c.get('user'), PRICES.sttPerCall, budget(c)));
  const j = (await r.json()) as { text: string };
  return c.json({ text: j.text });
});

app.post('/api/tts', async (c) => {
  const { text } = (await c.req.json()) as { text: string };
  if (!text?.trim()) return c.body(null, 204);
  const capped = await capCheck(c);
  if (capped) return capped;
  const input = text.slice(0, 1500);
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${c.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: c.env.TTS_MODEL ?? 'gpt-4o-mini-tts',
      voice: c.env.TTS_VOICE ?? 'ash',
      input,
      instructions: TTS_INSTRUCTIONS,
      response_format: 'mp3',
    }),
  });
  if (!r.ok || !r.body) return c.json({ error: 'tts failed', detail: await r.text() }, 502);
  c.executionCtx.waitUntil(c.get('store').charge(c.get('user'), input.length * PRICES.ttsPerChar, budget(c)));
  return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
});

// ---------- "Ask for more" ----------

app.post('/api/credits/request', async (c) => {
  const store = c.get('store');
  const u = c.get('user');
  const usage = await store.usage(u, budget(c));
  const reqs = await store.requests();
  const today = nyDate();
  let r = reqs.find((x) => x.userId === u.id && x.date === today && x.status === 'pending');
  if (!r) {
    r = { id: randomId(9), userId: u.id, name: u.name, username: u.username, at: Date.now(), date: today, spentToday: usage.spentToday, allowance: usage.allowance, status: 'pending' };
    await store.saveRequests([...reqs, r]);
  }
  const to = c.env.ADMIN_EMAIL ?? '';
  const subject = `py-tutor: ${u.name} is asking for more credits`;
  const body = `${u.name} is asking for more credits.\n\nUsername: ${u.username}\nUsed today: $${usage.spentToday.toFixed(2)} of $${usage.allowance.toFixed(2)}\n\nReview it on the Class usage page in py-tutor.`;
  return c.json({ ok: true, to, subject, body, mailto: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` });
});

// ---------- admin ----------

app.use('/api/admin/*', async (c, next) => {
  if (!c.get('user').admin) return c.json({ error: 'admins only' }, 403);
  await next();
});

app.get('/api/admin/overview', async (c) => {
  const store = c.get('store');
  const date = nyDate();
  const allowance = await store.allowance(budget(c), date);
  const users = [];
  for (const id of await store.userIds()) {
    const u = await store.user(id);
    if (!u) continue;
    users.push({
      ...publicUser(u),
      bonus: u.bonus,
      spentToday: await store.spentToday(id, date),
      lastSeen: await store.raw().get(`seen:${id}`),
      createdAt: u.createdAt,
    });
  }
  return c.json({ date, budget: budget(c), monthSpent: await store.monthSpent(date), allowance, users, requests: (await store.requests()).reverse() });
});

app.post('/api/admin/requests/:id', async (c) => {
  const store = c.get('store');
  const { action, amount } = await c.req.json<{ action: 'approve' | 'decline'; amount?: number }>();
  const reqs = await store.requests();
  const r = reqs.find((x) => x.id === c.req.param('id'));
  if (!r) return c.json({ error: 'not found' }, 404);
  if (action === 'approve') {
    const u = await store.user(r.userId);
    if (!u) return c.json({ error: 'user gone' }, 404);
    const grant = Math.min(5, Math.max(0.05, Number(amount) || r.allowance || 0.25));
    u.bonus = (u.bonus ?? 0) + grant;
    await store.saveUser(u);
    r.granted = grant;
  }
  r.status = action === 'approve' ? 'approved' : 'declined';
  await store.saveRequests(reqs as CreditRequest[]);
  return c.json({ ok: true, request: r });
});

// ---------- progress, per account ----------

app.get('/api/progress', async (c) => {
  const u = c.get('user');
  const store = c.get('store');
  let v = await store.raw().get(`progress:${u.id}`);
  if (!v && u.admin) v = await store.raw().get('progress'); // carry over progress from before accounts
  return c.json(v ? JSON.parse(v) : null);
});

app.put('/api/progress', async (c) => {
  const u = c.get('user');
  const body = await c.req.json<{ updatedAt: number }>();
  const key = `progress:${u.id}`;
  const cur = await c.env.KV.get(key);
  // last write wins by timestamp, so an old tab can't clobber newer progress
  if (cur && JSON.parse(cur).updatedAt > body.updatedAt) return c.json({ kept: 'server' });
  await c.env.KV.put(key, JSON.stringify(body));
  return c.json({ ok: true });
});

app.all('*', (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

export default app;
