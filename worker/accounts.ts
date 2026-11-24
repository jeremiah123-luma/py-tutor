// Accounts, sign-in sessions and passkeys in Workers KV. Money and shared lists live in the Ledger Durable Object
// (worker/ledger.ts), which applies one change at a time.
//   user:<id>            the account (password hash, passkeys)
//   uname:<username>     -> user id
//   cred:<passkey id>    -> user id
//   google:<sub>         -> user id (Sign in with Google)
//   sess:<token>         -> user id (60 days)
//   allow:<date>         that day's per-person allowance, fixed once computed
import { dailyAllowance, daysLeftInMonth, isCapped, nyDate } from './budget';
import type { Ledger } from './ledger';

export interface Passkey {
  id: string; // base64url
  publicKey: string; // base64url
  counter: number;
  transports?: string[];
}

export interface User {
  id: string;
  username: string;
  name: string;
  admin: boolean;
  createdAt: number;
  pw: { salt: string; hash: string; iter: number };
  passkeys: Passkey[];
  /** Old copy of extra credit; the Ledger holds the live amount. */
  bonus?: number;
  /** Connected Google account (Sign in with Google). */
  google?: { sub: string; email: string };
}

export interface CreditRequest {
  id: string;
  userId: string;
  name: string;
  username: string;
  at: number;
  date: string;
  spentToday: number;
  allowance: number;
  status: 'pending' | 'approved' | 'declined';
  granted?: number;
}

export interface Allowance {
  date: string;
  perPerson: number;
  active: number;
  monthSpentBefore: number;
}

const SESSION_TTL = 60 * 60 * 24 * 60;
const ITER = 100_000; // the most PBKDF2 iterations Workers allow

const enc = new TextEncoder();
export const b64u = {
  from(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  to(s: string): Uint8Array<ArrayBuffer> {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

export const randomId = (bytes = 18) => b64u.from(crypto.getRandomValues(new Uint8Array(bytes)));

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return b64u.from(new Uint8Array(bits));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64u.from(salt), hash: await pbkdf2(password, salt, ITER), iter: ITER };
}

export async function checkPassword(user: User, password: string): Promise<boolean> {
  const got = await pbkdf2(password, b64u.to(user.pw.salt), user.pw.iter);
  // constant-time compare
  if (got.length !== user.pw.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ user.pw.hash.charCodeAt(i);
  return diff === 0;
}

/** What the Ledger needs to know about an account. */
export const meta = (u: User) => ({ admin: !!u.admin, test: u.username.startsWith('e2e-') });

export const normUsername = (u: string) => u.trim().toLowerCase();
export const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

export class Store {
  constructor(
    private kv: KVNamespace,
    private ledger: DurableObjectStub<Ledger>,
  ) {}

  async getJSON<T>(key: string): Promise<T | null> {
    const v = await this.kv.get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async putJSON(key: string, v: unknown, ttl?: number) {
    await this.kv.put(key, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined);
  }
  raw() {
    return this.kv;
  }

  user(id: string) {
    return this.getJSON<User>(`user:${id}`);
  }
  async userByName(username: string) {
    const id = await this.kv.get(`uname:${normUsername(username)}`);
    return id ? this.user(id) : null;
  }
  saveUser(u: User) {
    return this.putJSON(`user:${u.id}`, u);
  }
  userIds(): Promise<string[]> {
    return this.ledger.userIds();
  }

  /** False if the username was taken (claimed in the Ledger, so two sign-ups at once can't both get it). */
  async createUser(u: User): Promise<boolean> {
    if (!(await this.ledger.claimName(u.username, u.id))) return false;
    try {
      await this.saveUser(u);
      await this.kv.put(`uname:${u.username}`, u.id);
      await this.ledger.addUser(u.id, meta(u));
    } catch (e) {
      await this.ledger.releaseName(u.username, u.id);
      throw e;
    }
    return true;
  }

  /**
   * Delete an account and everything kept about it: the record (name, password hash, passkeys, Google link), the
   * username, saved progress, and its usage numbers. Any other device still signed in is signed out on its next
   * request, because its session points at a record that no longer exists.
   */
  async deleteUser(u: User) {
    const keys = [`user:${u.id}`, `uname:${u.username}`, `progress:${u.id}`, `seen:${u.id}`];
    if (u.google && (await this.kv.get(`google:${u.google.sub}`)) === u.id) keys.push(`google:${u.google.sub}`);
    for (const p of u.passkeys) if ((await this.kv.get(`cred:${p.id}`)) === u.id) keys.push(`cred:${p.id}`);
    await Promise.all(keys.map((k) => this.kv.delete(k)));
    await this.ledger.removeUser(u.id, u.username);
  }

  async newSession(userId: string) {
    const token = randomId(32);
    await this.kv.put(`sess:${token}`, userId, { expirationTtl: SESSION_TTL });
    return token;
  }
  async sessionUser(token: string | undefined) {
    if (!token) return null;
    const id = await this.kv.get(`sess:${token}`);
    return id ? this.user(id) : null;
  }
  endSession(token: string) {
    return this.kv.delete(`sess:${token}`);
  }

  // ---- spending ----

  async monthSpent(date = nyDate()) {
    return (await this.ledger.snapshot('', date)).month;
  }
  /** Per person, for the admin page: spent today, extra credit left, last day using AI. */
  table(ids: string[], date: string) {
    return this.ledger.table(ids, date);
  }
  beginTutor(userId: string, max?: number) {
    return this.ledger.beginTutor(userId, max);
  }
  endTutor(userId: string, ticket: number) {
    return this.ledger.endTutor(userId, ticket);
  }

  /** Today's per-person allowance, computed on the first request of the day and then fixed. */
  async allowance(budget: number, date = nyDate()): Promise<Allowance> {
    const cached = await this.getJSON<Allowance>(`allow:${date}`);
    if (cached) return cached;
    const active = await this.activeCount(date);
    const snap = await this.ledger.snapshot('', date);
    const monthSpentBefore = snap.month - snap.classDay;
    const a: Allowance = { date, perPerson: dailyAllowance(budget, monthSpentBefore, date, active), active, monthSpentBefore };
    await this.putJSON(`allow:${date}`, a, 60 * 60 * 48);
    return a;
  }

  /** Students (not admins or test accounts) who used AI in the last 7 days. At least 1. */
  activeCount(date: string) {
    return this.ledger.activeCount(date);
  }

  async usage(u: User, budget: number) {
    const date = nyDate();
    const [snap, a] = await Promise.all([this.ledger.snapshot(u.id, date), this.allowance(budget, date)]);
    // Also a cap on the whole class's day, so a crowd of new people (who weren't counted in today's allowance) can't
    // spend several days' worth in one day.
    const classDaily = Math.max(0, budget - a.monthSpentBefore) / daysLeftInMonth(date);
    const capped = u.admin ? false : isCapped(snap.spentToday, a.perPerson, snap.bonus, snap.month, budget, snap.classDay, classDaily);
    return { date, spentToday: snap.spentToday, allowance: a.perPerson, bonus: snap.bonus, capped, active: a.active, monthSpent: snap.month, budget, admin: u.admin };
  }

  /** Record what one AI call cost. */
  async charge(u: User, cost: number, budget: number) {
    if (!(cost > 0)) return;
    const date = nyDate();
    try {
      const a = u.admin ? null : await this.allowance(budget, date);
      await this.ledger.charge(u.id, meta(u), cost, date, a?.perPerson ?? 0);
    } catch (e) {
      console.error('charge failed', e);
    }
  }

  // ---- "Ask for more" ----

  requests(): Promise<CreditRequest[]> {
    return this.ledger.requests();
  }
  addRequest(r: CreditRequest) {
    return this.ledger.addRequest(r);
  }
  resolveRequest(id: string, action: 'approve' | 'decline', amount?: number) {
    return this.ledger.resolveRequest(id, action, amount);
  }
}
