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
import { usernameFromEmail, verifyGoogleToken } from './google';
import { concepts } from '../src/curriculum';
import { USERNAME_RE, Store, b64u, checkPassword, hashPassword, normUsername, randomId, type User } from './accounts';
import { PRICES, claudeCost, nyDate, type ClaudeUsage } from './budget';
import { Ledger } from './ledger';
import { cleanTutorRequest, tutorParams } from './prompt';
import { cleanProgress, mergeProgress } from '../src/loop/mergeProgress';

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
  /** Google sign-in client id (public). Without it, Sign in with Google is hidden. */
  GOOGLE_CLIENT_ID?: string;
  KV: KVNamespace;
  LEDGER: DurableObjectNamespace<Ledger>;
  ASSETS?: Fetcher;
  /** Cloudflare rate limiters (atomic, unlike counters in KV). Optional so tests without them still run. */
  LOGIN_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  SIGNUP_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
};

type Vars = { user: User; store: Store };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

/** The site's home. The old workers.dev address sends every request to the same path here, so shared links keep working. */
const CANONICAL_HOST = 'pytutor.jeremiahsleman.com';
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname.endsWith('.workers.dev')) {
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    url.port = '';
    return c.redirect(url.toString(), c.req.method === 'GET' || c.req.method === 'HEAD' ? 301 : 308);
  }
  await next();
});

/** Hosts this app is served from. Passkeys and the cross-site check only trust these. */
const isOwnHost = (h: string) => h === CANONICAL_HOST || h === 'localhost' || h === '127.0.0.1';

// Every API write must be JSON from this site (the voice upload is the one form). Blocks cross-site form posts,
// like a page that signs a visitor into someone else's account.
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'POST' || c.req.method === 'PUT') {
    const o = c.req.header('origin');
    if (o && o !== 'null') {
      let host = '';
      try {
        host = new URL(o).hostname;
      } catch {
        /* bad header */
      }
      if (!isOwnHost(host) && host !== new URL(c.req.url).hostname) return c.json({ error: 'wrong site' }, 403);
    }
    const ct = c.req.header('content-type') ?? '';
    const isForm = c.req.path === '/api/stt';
    if (!(isForm ? ct.startsWith('multipart/form-data') : ct.startsWith('application/json')) && c.req.path !== '/api/auth/logout')
      return c.json({ error: 'expected JSON' }, 415);
  }
  await next();
});

// A malformed request is a 400 with a message, never a bare "Internal Server Error".
app.onError((e, c) => {
  // Bad JSON is the client's fault; anything else (a dropped connection upstream, a bug here) is ours and is logged.
  if (e instanceof SyntaxError) return c.json({ error: 'bad request' }, 400);
  console.error('unhandled', e);
  return c.json({ error: 'Something went wrong. Try again.' }, 500);
});

const STT_VOCAB =
  'Python tutoring for an intro course. Words: variable, int, float, str, list, tuple, slice, index, f-string, range, def, return, argument, parameter, while, break, continue, elif, and, or, not, import, math, random, upper, lower, split, join, replace, find, dict, key, value, .items(), .keys(), .values(), .get(), append, len, for, in, while, if, elif, else, print, input, int, str, open, with, as, read, readline, readlines, write, strip, split, close, "r", "w", "a", class, def, self, __init__, __str__, return, True, False, None, KeyError, FileNotFoundError, colon, square bracket, curly brace.';

const TTS_INSTRUCTIONS =
  'Voice: a warm, relaxed, encouraging tutor in his twenties sitting next to a friend. Natural conversational pace, slightly slower when reading code aloud. Friendly, never salesy or theatrical. Small natural pauses between ideas.';

const isLocal = (c: C) => ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname);
const budget = (c: C) => Number(c.env.MONTHLY_BUDGET_USD ?? '30');
const SID = 'sid';

function startSession(c: C, token: string) {
  const https = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SID, token, { httpOnly: true, secure: https, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 60 });
}

const publicUser = (u: User) => ({ id: u.id, name: u.name, username: u.username, admin: u.admin, passkeys: u.passkeys.length, google: u.google?.email ?? null });

/**
 * Passkeys belong to the address the person is actually on. The browser's Origin header is that address; the
 * request URL can differ behind a custom-domain route (and in local dev). WebAuthn still checks the signed origin.
 */
function rp(c: C) {
  let url = new URL(c.req.url);
  try {
    const o = c.req.header('origin');
    if (o && o !== 'null') url = new URL(o);
  } catch {
    /* bad header: fall back to the request URL */
  }
  if (!isOwnHost(url.hostname)) url = new URL(`https://${CANONICAL_HOST}`);
  return { rpID: url.hostname, origin: url.origin, rpName: 'py-tutor' };
}

app.use('/api/*', async (c, next) => {
  c.set('store', new Store(c.env.KV, c.env.LEDGER.get(c.env.LEDGER.idFromName('class'))));
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
  const b = (await c.req.json<{ name?: string; username?: string; password?: string; code?: string }>().catch(() => null)) ?? ({} as any);
  const name = String(b.name ?? '').trim().slice(0, 40);
  const username = normUsername(String(b.username ?? ''));
  const password = String(b.password ?? '');
  const code = String(b.code ?? '').trim();
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  // Sign-up is open (no class code). At most 40 new accounts per IP every 15 minutes: enough for a whole class
  // on one campus Wi-Fi address, low enough that nobody can farm accounts.
  if (c.env.SIGNUP_LIMITER && new URL(c.req.url).hostname !== 'localhost' && !(await c.env.SIGNUP_LIMITER.limit({ key: ip })).success)
    return c.json({ error: 'Too many new accounts from here. Wait a minute and try again.' }, 429);
  if (await tooManyTries(store, `signup:${ip}`, 40)) return c.json({ error: 'Too many new accounts from here. Wait 15 minutes and try again.' }, 429);
  const admin = !!c.env.ADMIN_CODE && code === c.env.ADMIN_CODE; // admin accounts are made through the API only
  if (!name) return c.json({ error: 'Enter your name.', field: 'name' }, 400);
  if (!USERNAME_RE.test(username))
    return c.json({ error: 'Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.', field: 'username' }, 400);
  // "e2e-" names are the automated test accounts, which the class budget leaves out: only made on a dev machine
  if (username.startsWith('e2e-') && !isLocal(c)) return c.json({ error: 'That username is taken. Try another.', field: 'username' }, 409);
  if (password.length < 8) return c.json({ error: 'Use at least 8 characters for your password.', field: 'password' }, 400);
  if (await store.userByName(username)) return c.json({ error: 'That username is taken. Try another.', field: 'username' }, 409);
  const user: User = { id: randomId(12), username, name, admin, createdAt: Date.now(), pw: await hashPassword(password), passkeys: [] };
  if (!(await store.createUser(user))) return c.json({ error: 'That username is taken. Try another.', field: 'username' }, 409);
  await noteFail(store, `signup:${ip}`);
  startSession(c, await store.newSession(user.id));
  return c.json({ user: publicUser(user) });
});

app.post('/api/auth/login', async (c) => {
  const store = c.get('store');
  const b = (await c.req.json<{ username?: string; password?: string }>().catch(() => null)) ?? ({} as any);
  const username = normUsername(String(b.username ?? ''));
  // Per username and network, so typing someone else's username wrong can't lock them out everywhere.
  const failKey = `login:${username}:${c.req.header('cf-connecting-ip') ?? 'local'}`;
  if (await tooManyTries(store, failKey)) return c.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429);
  // KV counters can be outrun by many tries at once; this limiter can't (10 a minute per username, any network).
  // (Not on localhost, where the end-to-end tests sign one test account in many times a minute.)
  if (c.env.LOGIN_LIMITER && new URL(c.req.url).hostname !== 'localhost' && !(await c.env.LOGIN_LIMITER.limit({ key: `u:${username}` })).success)
    return c.json({ error: 'Too many tries. Wait a minute and try again.' }, 429);
  const user = username ? await store.userByName(username) : null;
  // an unknown username takes as long as a wrong password, so timing can't tell which usernames exist
  if (!user) await hashPassword(String(b.password ?? ''));
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
  const { id, response } = (await c.req.json<{ id: string; response: any }>()) ?? ({} as any);
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

// ---------- Sign in with Google ----------

/** What the sign-in page needs to show the Google button (the client id is public by design). */
app.get('/api/auth/config', (c) => c.json({ google: c.env.GOOGLE_CLIENT_ID || null }));

/**
 * A Google ID token from the page. Signs in the account connected to that Google account, or makes a new account
 * for it the first time. Signed in already and `link` set: connects Google to the account you're in instead.
 */
app.post('/api/auth/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ error: 'Google sign-in isn’t set up.' }, 404);
  const store = c.get('store');
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (c.env.LOGIN_LIMITER && new URL(c.req.url).hostname !== 'localhost' && !(await c.env.LOGIN_LIMITER.limit({ key: `g:${ip}` })).success)
    return c.json({ error: 'Too many tries. Wait a minute and try again.' }, 429);
  const b = (await c.req.json<{ credential?: string; link?: boolean }>().catch(() => null)) ?? ({} as any);
  const g = await verifyGoogleToken(String(b.credential ?? ''), clientId).catch((e) => {
    console.warn('google verify failed', e);
    return null;
  });
  if (!g) return c.json({ error: 'Google sign-in didn’t work. Try again, or use your username and password.' }, 401);
  let owner = await store.raw().get(`google:${g.sub}`);
  if (owner && !(await store.user(owner))) owner = null; // the account it pointed at is gone

  if (b.link) {
    const me = await store.sessionUser(getCookie(c, SID));
    if (!me) return c.json({ error: 'locked' }, 401);
    if (owner && owner !== me.id) return c.json({ error: 'That Google account is already connected to a different py-tutor account.' }, 409);
    if (me.google && me.google.sub !== g.sub) await store.raw().delete(`google:${me.google.sub}`);
    me.google = { sub: g.sub, email: g.email };
    await store.saveUser(me);
    await store.raw().put(`google:${g.sub}`, me.id);
    return c.json({ user: publicUser(me) });
  }

  let user = owner ? await store.user(owner) : null;
  let created = false;
  if (!user) {
    if (c.env.SIGNUP_LIMITER && new URL(c.req.url).hostname !== 'localhost' && !(await c.env.SIGNUP_LIMITER.limit({ key: ip })).success)
      return c.json({ error: 'Too many new accounts from here. Wait a minute and try again.' }, 429);
    if (await tooManyTries(store, `signup:${ip}`, 40)) return c.json({ error: 'Too many new accounts from here. Wait 15 minutes and try again.' }, 429);
    const e = usernameFromEmail(g.email);
    const base = e.startsWith('e2e-') ? `u-${e}`.slice(0, 20) : e;
    const fresh: User = {
      id: randomId(12),
      username: base,
      name: g.name.slice(0, 40),
      admin: false,
      createdAt: Date.now(),
      pw: await hashPassword(randomId(24)), // no password: this account signs in with Google (a passkey can be added)
      passkeys: [],
      google: { sub: g.sub, email: g.email },
    };
    for (let n = 1; n <= 30; n++) {
      fresh.username = n === 1 ? base : `${base.slice(0, 20)}-${n}`;
      if (!USERNAME_RE.test(fresh.username) || fresh.username.startsWith('e2e-') || (await store.userByName(fresh.username))) continue;
      if (await store.createUser(fresh)) {
        user = fresh;
        break;
      }
    }
    if (!user) return c.json({ error: 'Couldn’t make an account for that Google account. Sign up with a username instead.' }, 409);
    await store.raw().put(`google:${g.sub}`, user.id);
    await noteFail(store, `signup:${ip}`);
    created = true;
  }
  startSession(c, await store.newSession(user.id));
  return c.json({ user: publicUser(user), created });
});

// Who's signed in. Signed out is a normal answer here (every visit asks), not an error, so it's a 200 with no user.
app.get('/api/me', async (c) => {
  const store = c.get('store');
  const u = await store.sessionUser(getCookie(c, SID));
  if (!u) return c.json({ user: null });
  return c.json({ user: publicUser(u), usage: await store.usage(u, budget(c)) });
});

// ---------- everything below needs a signed-in account ----------

app.use('/api/*', async (c, next) => {
  const user = await c.get('store').sessionUser(getCookie(c, SID));
  if (!user) return c.json({ error: 'locked' }, 401);
  c.set('user', user);
  await next();
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
    const owner = await store.raw().get(`cred:${cred.id}`);
    if (owner && owner !== u.id) return c.json({ error: 'That passkey is already linked to another account.' }, 409);
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

// Forget every passkey on this account (for example ones made on the old address, which can't sign in anymore).
// The password still works, and a new passkey can be added right after.
app.post('/api/passkey/remove', async (c) => {
  const store = c.get('store');
  const u = (await store.user(c.get('user').id)) ?? c.get('user');
  for (const p of u.passkeys) if ((await store.raw().get(`cred:${p.id}`)) === u.id) await store.raw().delete(`cred:${p.id}`);
  u.passkeys = [];
  await store.saveUser(u);
  return c.json({ user: publicUser(u) });
});

// ---------- AI routes: each checks the cap, then records what it cost ----------

async function capCheck(c: C) {
  const u = c.get('user');
  const usage = await c.get('store').usage(u, budget(c));
  return usage.capped ? c.json({ error: 'cap', usage }, 402) : null;
}

app.post('/api/tutor', async (c) => {
  const req = cleanTutorRequest(await c.req.json());
  if (!req) return c.json({ error: 'bad request' }, 400);
  const concept = Object.hasOwn(concepts, req.concept) ? concepts[req.concept as keyof typeof concepts] : undefined;
  const lesson = concept?.lessons.find((l) => l.subskill === req.subskill);
  if (!concept || !lesson) return c.json({ error: 'unknown lesson' }, 400);
  const capped = await capCheck(c);
  if (capped) return capped;
  const user = c.get('user');
  const store = c.get('store');
  // At most 2 answers at once per person: the cap is checked before a call and charged after, so many at once
  // could otherwise run past it.
  const ticket = await store.beginTutor(user.id);
  if (ticket === null) return c.json({ error: 'One question at a time. Wait for the answer, then ask again.' }, 429);
  req.learnerName = user.name.split(/\s+/)[0];

  const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });
  const stream = client.beta.messages.stream(tutorParams(req, concept, lesson, c.env.TUTOR_MODEL) as any);
  const usage: ClaudeUsage = {};
  let charged = false;
  let sentChars = 0;
  const chargeOnce = () => {
    if (charged) return;
    charged = true;
    c.executionCtx.waitUntil(Promise.resolve(store.endTutor(user.id, ticket)).catch(() => {}));
    // Cut off early (barge-in), the final token count never arrives: bill what was streamed (~3.5 characters a token).
    usage.output_tokens = Math.max(usage.output_tokens ?? 0, Math.ceil(sentChars / 3.5));
    c.executionCtx.waitUntil(store.charge(user, claudeCost(usage), budget(c)));
  };

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const ev of stream as any) {
          if (ev.type === 'message_start') Object.assign(usage, ev.message?.usage ?? {});
          if (ev.type === 'message_delta' && ev.usage) Object.assign(usage, Object.fromEntries(Object.entries(ev.usage).filter(([, v]) => v != null)));
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            sentChars += ev.delta.text.length;
            ctrl.enqueue(enc.encode(ev.delta.text));
          }
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
  if (audio.size > 3_000_000) return c.json({ error: 'That was too long. Try a shorter answer.' }, 413);
  // priced per minute; compressed speech is about 16 KB a second
  const sttCost = Math.max(PRICES.sttPerCall, (audio.size / (16_000 * 60)) * PRICES.sttPerCall);
  // a few at a time per person: the cap is checked before a call and charged after, so a burst could run past it
  const store = c.get('store');
  const sttTicket = await store.beginTutor(`${c.get('user').id}:stt`, 2);
  if (sttTicket === null) return c.json({ error: 'One at a time. Wait for the last answer to finish.' }, 429);
  const out = new FormData();
  out.append('file', audio, audio.name || 'speech.webm');
  out.append('model', c.env.STT_MODEL ?? 'gpt-4o-mini-transcribe');
  out.append('prompt', STT_VOCAB);
  out.append('language', 'en');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${c.env.OPENAI_API_KEY}` },
    body: out,
  }).finally(() => c.executionCtx.waitUntil(Promise.resolve(store.endTutor(`${c.get('user').id}:stt`, sttTicket)).catch(() => {})));
  if (!r.ok) {
    console.error('stt failed', r.status, await r.text()); // the details stay in the logs, not the browser
    return c.json({ error: 'stt failed' }, 502);
  }
  c.executionCtx.waitUntil(c.get('store').charge(c.get('user'), sttCost, budget(c)));
  const j = (await r.json()) as { text: string };
  return c.json({ text: j.text });
});

app.post('/api/tts', async (c) => {
  const b = (await c.req.json()) as { text?: unknown } | null;
  const text = typeof b?.text === 'string' ? b.text : '';
  if (!text.trim()) return c.body(null, 204);
  const capped = await capCheck(c);
  if (capped) return capped;
  const input = text.slice(0, 1500);
  const store = c.get('store');
  const key = `${c.get('user').id}:tts`;
  const ticket = await store.beginTutor(key, 3); // the speaker fetches a sentence or two ahead, never more
  if (ticket === null) return c.json({ error: 'Too many at once.' }, 429);
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
  }).finally(() => c.executionCtx.waitUntil(Promise.resolve(store.endTutor(key, ticket)).catch(() => {})));
  if (!r.ok || !r.body) {
    console.error('tts failed', r.status, await r.text());
    return c.json({ error: 'tts failed' }, 502);
  }
  c.executionCtx.waitUntil(c.get('store').charge(c.get('user'), input.length * PRICES.ttsPerChar, budget(c)));
  return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
});

// ---------- "Ask for more" ----------

app.post('/api/credits/request', async (c) => {
  const store = c.get('store');
  const u = c.get('user');
  const usage = await store.usage(u, budget(c));
  const today = nyDate();
  await store.addRequest({ id: randomId(9), userId: u.id, name: u.name, username: u.username, at: Date.now(), date: today, spentToday: usage.spentToday, allowance: usage.allowance, status: 'pending' });
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
  const ids = await store.userIds();
  const table = await store.table(ids, date);
  // account records, 20 at a time
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(ids.slice(i, i + 20).map((id) => store.user(id)));
    for (const u of batch) if (u) users.push({ ...publicUser(u), ...table[u.id], createdAt: u.createdAt });
  }
  return c.json({ date, budget: budget(c), monthSpent: await store.monthSpent(date), allowance, users, requests: (await store.requests()).reverse() });
});

app.post('/api/admin/requests/:id', async (c) => {
  const store = c.get('store');
  const { action, amount } = ((await c.req.json<{ action: 'approve' | 'decline'; amount?: number }>()) ?? {}) as { action?: string; amount?: number };
  if (action !== 'approve' && action !== 'decline') return c.json({ error: 'bad action' }, 400);
  const r = await store.resolveRequest(c.req.param('id'), action, amount);
  if (!r) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true, request: r });
});

// ---------- progress, per account ----------

app.get('/api/progress', async (c) => {
  const u = c.get('user');
  const store = c.get('store');
  let v = await store.raw().get(`progress:${u.id}`);
  if (!v && u.admin) v = await store.raw().get('progress'); // carry over progress from before accounts
  try {
    return c.json(v ? cleanProgress(JSON.parse(v)) : null);
  } catch {
    return c.json(null);
  }
});

app.put('/api/progress', async (c) => {
  const u = c.get('user');
  const raw = await c.req.text();
  if (raw.length > 64_000) return c.json({ error: 'too big' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: 'bad json' }, 400);
  }
  const key = `progress:${u.id}`;
  const cur = await c.env.KV.get(key);
  // Merge per lesson instead of last-write-wins: an old tab or another device can't wipe what was earned elsewhere.
  let prev = cleanProgress(null);
  try {
    if (cur) prev = cleanProgress(JSON.parse(cur));
  } catch {
    /* a bad stored copy is replaced */
  }
  const merged = mergeProgress(prev, cleanProgress(body));
  try {
    await c.env.KV.put(key, JSON.stringify(merged));
  } catch (e) {
    // KV allows about one write a second per key; the app sends its whole progress again on the next save
    console.warn('progress save failed', e);
    return c.json({ error: 'busy, try again' }, 503);
  }
  return c.json({ ok: true });
});

app.all('*', (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

export { Ledger };
export default app;
