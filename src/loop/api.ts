// Thin client for the Worker API.
import type { GradeResult, Mode, Progress } from '../types';

export const META_SEP = '␞';

export interface TutorMeta {
  verdict: 'pass' | 'partial' | 'fail' | 'none';
  nailed: string[];
  fix: string[];
  highlightLines: number[];
  next: 'stay' | 'advance' | 'retry';
}

export interface TutorAsk {
  kind: 'ask' | 'assess-talk' | 'explain-grade' | 'hint' | 'assess-spoken-code';
  concept: string;
  subskill: string;
  step: string;
  mode: Mode;
  learnerText?: string;
  code?: string;
  grade?: GradeResult;
  hintsUsed?: number;
  history?: { role: 'tutor' | 'learner'; text: string }[];
}

export interface Account {
  id: string;
  name: string;
  username: string;
  admin: boolean;
  passkeys: number;
  /** The connected Google account's email, if any. */
  google?: string | null;
}

export interface Usage {
  date: string;
  spentToday: number;
  allowance: number;
  bonus: number;
  capped: boolean;
  active: number;
  monthSpent: number;
  budget: number;
  admin: boolean;
}

/** Thrown when today's AI allowance is used up. The app shows the "You hit your cap" pop-up. */
export class CapError extends Error {
  usage?: Usage;
  constructor(usage?: Usage) {
    super('cap');
    this.usage = usage;
  }
}
const capListeners = new Set<(u?: Usage) => void>();
export function onCap(fn: (u?: Usage) => void) {
  capListeners.add(fn);
  return () => void capListeners.delete(fn);
}
async function failed(r: Response, what: string): Promise<never> {
  if (r.status === 402) {
    const j = (await r.json().catch(() => ({}))) as { usage?: Usage };
    capListeners.forEach((f) => f(j.usage));
    throw new CapError(j.usage);
  }
  if (r.status === 401) window.dispatchEvent(new Event('py-tutor:locked'));
  throw new Error(r.status === 401 ? 'locked' : `${what} ${r.status}`);
}

async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; field?: string };
  // signed out in the middle of using it (not a wrong password on the sign-in screen)
  if (r.status === 401 && !/^\/api\/(auth|passkey\/login)\//.test(url)) window.dispatchEvent(new Event('py-tutor:locked'));
  if (!r.ok) throw Object.assign(new Error(j.error ?? `Something went wrong (${r.status}). Try again.`), { field: j.field, status: r.status });
  return j;
}

/** A signal that gives up after ms (AbortSignal.timeout isn't in older Safari). */
function timeout(ms: number): AbortSignal | undefined {
  try {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  } catch {
    return undefined;
  }
}

export async function me(): Promise<{ user: Account; usage: Usage } | null> {
  try {
    const r = await fetch('/api/me', { signal: timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
export const signUp = (b: { name: string; username: string; password: string; code?: string }) => postJSON<{ user: Account }>('/api/auth/signup', b);
export const signIn = (b: { username: string; password: string }) => postJSON<{ user: Account }>('/api/auth/login', b);
export const signOut = () => postJSON('/api/auth/logout').catch(() => undefined);

export function passkeysSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}
export async function addPasskey(): Promise<Account> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const options = await postJSON<any>('/api/passkey/register/options');
  const response = await startRegistration({ optionsJSON: options });
  return (await postJSON<{ user: Account }>('/api/passkey/register/verify', response)).user;
}
let googleId: Promise<string | null> | null = null;
/** The Google sign-in client id, or null when Sign in with Google isn't set up. */
export function googleClientId(): Promise<string | null> {
  googleId ??= fetch('/api/auth/config', { signal: timeout(6000) })
    .then((r) => (r.ok ? r.json() : { google: null }))
    .then((j: { google?: string | null }) => j.google ?? null)
    .catch(() => {
      googleId = null; // try again next time
      return null;
    });
  return googleId;
}
/** Sign in (or make an account) with a Google ID token; with link, connect Google to the account you're in. */
export const signInWithGoogle = (credential: string, link = false) => postJSON<{ user: Account; created?: boolean }>('/api/auth/google', { credential, link });
export const removePasskeys = async () => (await postJSON<{ user: Account }>('/api/passkey/remove')).user;
export async function signInWithPasskey(): Promise<Account> {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const { id, options } = await postJSON<{ id: string; options: any }>('/api/passkey/login/options');
  const response = await startAuthentication({ optionsJSON: options });
  return (await postJSON<{ user: Account }>('/api/passkey/login/verify', { id, response })).user;
}

export const askForMore = () => postJSON<{ mailto: string; to: string; subject: string; body: string }>('/api/credits/request');

export interface AdminOverview {
  date: string;
  budget: number;
  monthSpent: number;
  allowance: { perPerson: number; active: number };
  users: (Account & { bonus: number; spentToday: number; lastSeen: string | null; createdAt: number })[];
  requests: { id: string; name: string; username: string; at: number; spentToday: number; allowance: number; status: 'pending' | 'approved' | 'declined'; granted?: number }[];
}
export async function adminOverview(): Promise<AdminOverview> {
  const r = await fetch('/api/admin/overview');
  if (!r.ok) throw new Error(`admin ${r.status}`);
  return r.json();
}
export const reviewRequest = (id: string, action: 'approve' | 'decline', amount?: number) => postJSON(`/api/admin/requests/${id}`, { action, amount });

const EMPTY_META: TutorMeta = { verdict: 'none', nailed: [], fix: [], highlightLines: [], next: 'stay' };

export function parseMeta(raw: string): TutorMeta {
  try {
    const m = JSON.parse(raw.trim());
    return {
      verdict: m.verdict ?? 'none',
      nailed: Array.isArray(m.nailed) ? m.nailed : [],
      fix: Array.isArray(m.fix) ? m.fix : [],
      highlightLines: Array.isArray(m.highlightLines) ? m.highlightLines.filter((n: unknown) => typeof n === 'number') : [],
      next: m.next ?? 'stay',
    };
  } catch {
    return EMPTY_META;
  }
}

/** Streams the tutor's spoken text through onText (only the part before ␞), then resolves with text + meta. */
export async function askTutor(
  req: TutorAsk,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; meta: TutorMeta }> {
  const r = await fetch('/api/tutor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok || !r.body) return failed(r, 'tutor');
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let all = '';
  let emitted = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    all += dec.decode(value, { stream: true });
    const sep = all.indexOf(META_SEP);
    const visibleEnd = sep === -1 ? all.length : sep;
    if (visibleEnd > emitted) {
      onText(all.slice(emitted, visibleEnd));
      emitted = visibleEnd;
    }
  }
  const sep = all.indexOf(META_SEP);
  const text = (sep === -1 ? all : all.slice(0, sep)).trim();
  return { text, meta: sep === -1 ? EMPTY_META : parseMeta(all.slice(sep + 1)) };
}

export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const fd = new FormData();
  const ext = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('wav') ? 'wav' : 'webm';
  fd.append('audio', audio, `speech.${ext}`);
  const r = await fetch('/api/stt', { method: 'POST', body: fd, signal });
  if (!r.ok) return failed(r, 'stt');
  return ((await r.json()) as { text: string }).text;
}

export async function speechAudio(text: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!r.ok) return failed(r, 'tts');
  return r.arrayBuffer();
}

export async function pullProgress(): Promise<Progress | null> {
  try {
    const r = await fetch('/api/progress', { signal: timeout(6000) });
    return r.ok ? ((await r.json()) as Progress | null) : null;
  } catch {
    return null;
  }
}

/** Save to the account. The server merges with what other devices saved; a signed-out session asks to sign in
 *  again (this device's copy is kept and merged back in on the next sign-in). */
export async function pushProgress(p: Progress) {
  try {
    const r = await fetch('/api/progress', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p),
    });
    if (r.status === 401) window.dispatchEvent(new Event('py-tutor:locked'));
  } catch {
    /* offline: IndexedDB copy is still there, next save retries */
  }
}
