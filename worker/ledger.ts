// The one place that adds money up and changes shared lists. A Durable Object runs one request at a time, so two AI
// calls finishing together, two people signing up together, or approving while a student is charged can't overwrite
// each other (Workers KV has no transactions). Accounts, sessions and progress stay in KV.
//
// Keys in its storage:
//   users                 every user id
//   meta:<id>             { admin, test } for that user (test = an e2e-* account)
//   name:<username>       -> user id: usernames are claimed here, so two sign-ups can't both get one
//   seen:<id>             the last day that person used AI
//   spend:<id>:<date>     what one person spent that day (USD)
//   month:<YYYY-MM>       what the class spent that month (admins and test accounts excluded)
//   classday:<date>       what the class spent that day (same)
//   bonus:<id>            extra credit left (USD)
//   reqs                  "Ask for more" requests
//
// On first start it copies the old KV values in, and once it lists every account record in KV so nobody is missed.
import { DurableObject } from 'cloudflare:workers';
import { purgeKv, type CreditRequest, type User } from './accounts';
import { applyCharge, daysBetween, nyDate } from './budget';

type Env = { KV: KVNamespace };
type Meta = { admin: boolean; test: boolean };

/** storage.get/put/delete take at most 128 keys at a time. */
const CHUNK = 100;
const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / CHUNK) }, (_, i) => a.slice(i * CHUNK, i * CHUNK + CHUNK));

export class Ledger extends DurableObject<Env> {
  /** AI tutor calls running right now, per user (in memory; a restart just forgets them). */
  private inFlight = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await this.importFromKv();
      await this.reconcileAccounts();
    });
  }

  private async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const c of chunks(keys)) for (const [k, v] of await this.ctx.storage.get<T>(c)) out.set(k, v);
    return out;
  }
  private async putMany(put: Record<string, unknown>) {
    for (const c of chunks(Object.entries(put))) await this.ctx.storage.put(Object.fromEntries(c));
  }

  private async importFromKv() {
    const s = this.ctx.storage;
    if (await s.get('imported')) return;
    const kv = this.env.KV;
    const put: Record<string, unknown> = { users: JSON.parse((await kv.get('users')) ?? '[]'), reqs: JSON.parse((await kv.get('reqs')) ?? '[]') };
    // Only what can still matter: the monthly totals, and the last two days' per-day numbers.
    const today = nyDate(), yesterday = nyDate(new Date(Date.now() - 86_400_000));
    for (const prefix of ['month:', 'classday:', 'spend:']) {
      let cursor: string | undefined;
      do {
        const l: KVNamespaceListResult<unknown> = await kv.list({ prefix, cursor });
        for (const k of l.keys)
          if (prefix === 'month:' || k.name.endsWith(today) || k.name.endsWith(yesterday)) put[k.name] = Number((await kv.get(k.name)) ?? '0');
        cursor = l.list_complete ? undefined : l.cursor;
      } while (cursor);
    }
    put.imported = Date.now();
    await this.putMany(put);
  }

  /** Once: every account record in KV gets into the list, with its username, flags, last-seen day and extra credit. */
  private async reconcileAccounts() {
    const s = this.ctx.storage;
    if (await s.get('reconciled')) return;
    const kv = this.env.KV;
    const ids = new Set(await this.userIds());
    const put: Record<string, unknown> = {};
    let cursor: string | undefined;
    do {
      const l: KVNamespaceListResult<unknown> = await kv.list({ prefix: 'user:', cursor });
      for (const k of l.keys) {
        const u = JSON.parse((await kv.get(k.name)) ?? 'null') as User | null;
        if (!u?.id) continue;
        ids.add(u.id);
        put[`meta:${u.id}`] = { admin: !!u.admin, test: u.username.startsWith('e2e-') } satisfies Meta;
        put[`name:${u.username}`] = u.id;
        if (u.bonus && (await s.get(`bonus:${u.id}`)) === undefined) put[`bonus:${u.id}`] = u.bonus;
        const seen = await kv.get(`seen:${u.id}`);
        if (seen) put[`seen:${u.id}`] = seen;
      }
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
    put.users = [...ids];
    put.reconciled = Date.now();
    await this.putMany(put);
  }

  private num(key: string) {
    return this.ctx.storage.get<number>(key).then((v) => v ?? 0);
  }

  // ---- accounts ----
  async userIds(): Promise<string[]> {
    return (await this.ctx.storage.get<string[]>('users')) ?? [];
  }
  /** Claims a username for a new account. False if someone already has it. */
  async claimName(username: string, id: string): Promise<boolean> {
    const owner = await this.ctx.storage.get<string>(`name:${username}`);
    if (owner && owner !== id) return false;
    await this.ctx.storage.put(`name:${username}`, id);
    return true;
  }
  async releaseName(username: string, id: string) {
    if ((await this.ctx.storage.get<string>(`name:${username}`)) === id) await this.ctx.storage.delete(`name:${username}`);
  }
  async addUser(id: string, meta: Meta) {
    const ids = await this.userIds();
    const put: Record<string, unknown> = { [`meta:${id}`]: meta };
    if (!ids.includes(id)) put.users = [...ids, id];
    await this.ctx.storage.put(put);
  }

  /**
   * Forget one person (they deleted their account): off the list, their username freed, their own numbers and
   * requests gone. The class's month and day totals stay, since that money was really spent.
   */
  async removeUser(id: string, username: string) {
    const s = this.ctx.storage;
    const ids = await this.userIds();
    const reqs = ((await s.get<CreditRequest[]>('reqs')) ?? []).filter((r) => r.userId !== id);
    await s.put({ users: ids.filter((x) => x !== id), reqs });
    const keys = [`meta:${id}`, `seen:${id}`, `bonus:${id}`];
    if ((await s.get<string>(`name:${username}`)) === id) keys.push(`name:${username}`);
    keys.push(...(await s.list({ prefix: `spend:${id}:` })).keys());
    for (let i = 0; i < keys.length; i += 100) await s.delete(keys.slice(i, i + 100));
  }

  // ---- deleted accounts: erased when their restore window runs out ----
  async schedulePurge(id: string, at: number) {
    const s = this.ctx.storage;
    await s.put(`purge:${id}`, at);
    const cur = await s.getAlarm();
    if (cur === null || cur > at) await s.setAlarm(at);
  }
  /** True if the account was still waiting and is now safe; false if its time was up (it is, or will be, erased). */
  async cancelPurge(id: string): Promise<boolean> {
    const s = this.ctx.storage;
    const at = await s.get<number>(`purge:${id}`);
    if (at === undefined || Date.now() >= at) return false;
    await s.delete(`purge:${id}`);
    return true;
  }
  /** Erase every account whose time is up. If anything fails the alarm runs again, so nothing is left half-deleted. */
  async alarm() {
    const s = this.ctx.storage;
    let next = Infinity;
    for (const [key, at] of await s.list<number>({ prefix: 'purge:' })) {
      if (at > Date.now()) {
        next = Math.min(next, at);
        continue;
      }
      const id = key.slice('purge:'.length);
      const raw = await this.env.KV.get(`user:${id}`);
      const u = raw ? (JSON.parse(raw) as User) : null;
      // only an account still marked deleted is erased (a restore that won the race has cleared the mark)
      if (u?.deletedAt) await purgeKv(this.env.KV, u);
      if (!u || u.deletedAt) await this.removeUser(id, u?.username ?? '');
      await s.delete(key);
    }
    if (next < Infinity) await s.setAlarm(next);
  }

  /** Students (not admins or test accounts) who used AI in the last 7 days. At least 1. */
  async activeCount(date: string) {
    const ids = await this.userIds();
    const [seen, meta] = await Promise.all([this.getMany<string>(ids.map((id) => `seen:${id}`)), this.getMany<Meta>(ids.map((id) => `meta:${id}`))]);
    let n = 0;
    for (const id of ids) {
      const d = seen.get(`seen:${id}`), m = meta.get(`meta:${id}`);
      if (d && daysBetween(d, date) < 7 && m && !m.admin && !m.test) n++;
    }
    return Math.max(1, n);
  }

  // ---- money ----
  /** Everything usage needs for one person, read together. */
  async snapshot(userId: string, date: string) {
    const [spentToday, month, classDay, bonus] = await Promise.all([
      this.num(`spend:${userId}:${date}`),
      this.num(`month:${date.slice(0, 7)}`),
      this.num(`classday:${date}`),
      this.num(`bonus:${userId}`),
    ]);
    return { spentToday, month, classDay, bonus };
  }
  /** For the admin page: what each person spent that day, their extra credit, and their last day using AI. */
  async table(userIds: string[], date: string) {
    const [spend, bonus, seen] = await Promise.all([
      this.getMany<number>(userIds.map((id) => `spend:${id}:${date}`)),
      this.getMany<number>(userIds.map((id) => `bonus:${id}`)),
      this.getMany<string>(userIds.map((id) => `seen:${id}`)),
    ]);
    return Object.fromEntries(
      userIds.map((id) => [id, { spentToday: spend.get(`spend:${id}:${date}`) ?? 0, bonus: bonus.get(`bonus:${id}`) ?? 0, lastSeen: seen.get(`seen:${id}`) ?? null }]),
    );
  }

  /** Record one AI call. Admins and test accounts count toward their own day only, not the class or extra credit. */
  async charge(userId: string, meta: Meta, cost: number, date: string, perPerson: number) {
    const put: Record<string, unknown> = { [`seen:${userId}`]: date };
    const ids = await this.userIds();
    if (!ids.includes(userId)) put.users = [...ids, userId]; // an account the old list had lost
    if (!(await this.ctx.storage.get(`meta:${userId}`))) put[`meta:${userId}`] = meta;
    if (cost > 0) {
      const spentKey = `spend:${userId}:${date}`;
      const spent = await this.num(spentKey);
      put[spentKey] = spent + cost;
      if (!meta.admin && !meta.test) {
        const bonus = await this.num(`bonus:${userId}`);
        const next = applyCharge(spent, perPerson, bonus, cost);
        if (next.bonus !== bonus) put[`bonus:${userId}`] = Math.max(0, next.bonus);
        put[`month:${date.slice(0, 7)}`] = (await this.num(`month:${date.slice(0, 7)}`)) + cost;
        put[`classday:${date}`] = (await this.num(`classday:${date}`)) + cost;
      }
    }
    await this.putMany(put);
  }

  /**
   * At most 2 tutor answers at once per person, so firing many requests together can't run far past the cap
   * (the cap is checked before a call and charged after it). Returns a ticket to pass to endTutor, or null.
   */
  beginTutor(userId: string, max = 2): number | null {
    const now = Date.now();
    const live = (this.inFlight.get(userId) ?? []).filter((t) => now - Math.floor(t) < 90_000);
    if (live.length >= max) return null;
    const ticket = now + ++this.seq / 1e6; // unique even for two calls in the same millisecond
    live.push(ticket);
    this.inFlight.set(userId, live);
    return ticket;
  }
  private seq = 0;
  endTutor(userId: string, ticket: number) {
    const live = (this.inFlight.get(userId) ?? []).filter((t) => t !== ticket);
    if (live.length) this.inFlight.set(userId, live);
    else this.inFlight.delete(userId);
  }

  // ---- "Ask for more" ----
  async requests(): Promise<CreditRequest[]> {
    return (await this.ctx.storage.get<CreditRequest[]>('reqs')) ?? [];
  }
  /** One pending request per person per day. */
  async addRequest(r: CreditRequest): Promise<CreditRequest> {
    const reqs = await this.requests();
    const open = reqs.find((x) => x.userId === r.userId && x.date === r.date && x.status === 'pending');
    if (open) return open;
    await this.ctx.storage.put('reqs', [...reqs, r].slice(-200));
    return r;
  }
  /** Approving twice grants once. */
  async resolveRequest(id: string, action: 'approve' | 'decline', amount?: number): Promise<CreditRequest | null> {
    const reqs = await this.requests();
    const r = reqs.find((x) => x.id === id);
    if (!r) return null;
    if (r.status !== 'pending') return r;
    if (action === 'approve') {
      const grant = Math.min(5, Math.max(0.05, Number(amount) || r.allowance || 0.25));
      await this.ctx.storage.put(`bonus:${r.userId}`, (await this.num(`bonus:${r.userId}`)) + grant);
      r.granted = grant;
    }
    r.status = action === 'approve' ? 'approved' : 'declined';
    await this.ctx.storage.put('reqs', reqs);
    return r;
  }
}
