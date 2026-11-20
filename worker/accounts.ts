// Accounts, sign-in sessions, passkeys, and per-person spending, all in Workers KV.
//   user:<id>            the account (password hash, passkeys, extra credit)
//   uname:<username>     -> user id
//   cred:<passkey id>    -> user id
//   sess:<token>         -> user id (60 days)
//   users                list of every user id
//   spend:<id>:<date>    what one person spent that day (USD)
//   month:<YYYY-MM>      what the class spent that month (USD, admins excluded)
//   seen:<id>            the last day that person used AI
//   allow:<date>         that day's per-person allowance, fixed once computed
//   reqs                 "Ask for more" requests
import { applyCharge, dailyAllowance, daysBetween, isCapped, nyDate } from './budget';

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
  /** Extra credit he approved, used after the daily allowance runs out (USD). */
  bonus: number;
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

export const normUsername = (u: string) => u.trim().toLowerCase();
export const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

export class Store {
  constructor(private kv: KVNamespace) {}

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
  async userIds(): Promise<string[]> {
    return (await this.getJSON<string[]>('users')) ?? [];
  }

  async createUser(u: User) {
    await this.saveUser(u);
    await this.kv.put(`uname:${u.username}`, u.id);
    const ids = await this.userIds();
    if (!ids.includes(u.id)) await this.putJSON('users', [...ids, u.id]);
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

  async spentToday(userId: string, date = nyDate()) {
    return Number((await this.kv.get(`spend:${userId}:${date}`)) ?? '0');
  }
  async monthSpent(date = nyDate()) {
    return Number((await this.kv.get(`month:${date.slice(0, 7)}`)) ?? '0');
  }

  /** Today's per-person allowance, computed on the first request of the day and then fixed. */
  async allowance(budget: number, date = nyDate()): Promise<Allowance> {
    const cached = await this.getJSON<Allowance>(`allow:${date}`);
    if (cached) return cached;
    const active = await this.activeCount(date);
    const monthSpentBefore = (await this.monthSpent(date)) - (await this.classSpentOn(date));
    const a: Allowance = { date, perPerson: dailyAllowance(budget, monthSpentBefore, date, active), active, monthSpentBefore };
    await this.putJSON(`allow:${date}`, a, 60 * 60 * 48);
    return a;
  }

  /** Students (not admins or test accounts) who used AI in the last 7 days. At least 1. */
  async activeCount(date: string) {
    let n = 0;
    for (const id of await this.userIds()) {
      const seen = await this.kv.get(`seen:${id}`);
      if (!seen || daysBetween(seen, date) >= 7) continue;
      const u = await this.user(id);
      if (u && !u.admin && !u.username.startsWith('e2e-')) n++;
    }
    return Math.max(1, n);
  }

  private async classSpentOn(date: string) {
    return Number((await this.kv.get(`classday:${date}`)) ?? '0');
  }

  async usage(u: User, budget: number) {
    const date = nyDate();
    const [spent, a, month] = await Promise.all([this.spentToday(u.id, date), this.allowance(budget, date), this.monthSpent(date)]);
    const capped = u.admin ? false : isCapped(spent, a.perPerson, u.bonus, month, budget);
    return { date, spentToday: spent, allowance: a.perPerson, bonus: u.bonus, capped, active: a.active, monthSpent: month, budget, admin: u.admin };
  }

  /** Record what one AI call cost. KV has no transactions; at class scale a lost cent now and then is fine. */
  async charge(u: User, cost: number, budget: number) {
    if (!(cost > 0)) return;
    const date = nyDate();
    try {
      const spent = await this.spentToday(u.id, date);
      await this.kv.put(`spend:${u.id}:${date}`, String(spent + cost), { expirationTtl: 60 * 60 * 24 * 40 });
      await this.kv.put(`seen:${u.id}`, date);
      if (u.admin) return;
      const a = await this.allowance(budget, date);
      const next = applyCharge(spent, a.perPerson, u.bonus, cost);
      if (next.bonus !== u.bonus) {
        const fresh = (await this.user(u.id)) ?? u;
        fresh.bonus = Math.max(0, next.bonus);
        await this.saveUser(fresh);
      }
      const month = await this.monthSpent(date);
      await this.kv.put(`month:${date.slice(0, 7)}`, String(month + cost), { expirationTtl: 60 * 60 * 24 * 70 });
      const day = await this.classSpentOn(date);
      await this.kv.put(`classday:${date}`, String(day + cost), { expirationTtl: 60 * 60 * 48 });
    } catch (e) {
      console.error('charge failed', e);
    }
  }

  // ---- "Ask for more" ----

  async requests(): Promise<CreditRequest[]> {
    return (await this.getJSON<CreditRequest[]>('reqs')) ?? [];
  }
  async saveRequests(r: CreditRequest[]) {
    await this.putJSON('reqs', r.slice(-200));
  }
}
