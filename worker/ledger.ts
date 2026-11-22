// The one place that adds money up and changes shared lists. A Durable Object runs one request at a time, so two AI
// calls finishing together, two people signing up together, or approving while a student is charged can't overwrite
// each other (Workers KV has no transactions). Everything else (accounts, sessions, progress) stays in KV.
//
// Keys in its storage:
//   users                 every user id
//   spend:<id>:<date>     what one person spent that day (USD)
//   month:<YYYY-MM>       what the class spent that month (admins excluded)
//   classday:<date>       what the class spent that day (admins excluded)
//   bonus:<id>            extra credit left (USD)
//   reqs                  "Ask for more" requests
//
// On first start it copies the old KV values in, so nothing from before the move is lost.
import { DurableObject } from 'cloudflare:workers';
import type { CreditRequest, User } from './accounts';
import { applyCharge } from './budget';

type Env = { KV: KVNamespace };

export class Ledger extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(() => this.importFromKv());
  }

  private async importFromKv() {
    const s = this.ctx.storage;
    if (await s.get('imported')) return;
    const kv = this.env.KV;
    const ids = JSON.parse((await kv.get('users')) ?? '[]') as string[];
    const put: Record<string, unknown> = { users: ids, reqs: JSON.parse((await kv.get('reqs')) ?? '[]') };
    // Days that can still matter: this month's total, the last two days' per-day numbers.
    const listed = await kv.list({ prefix: 'month:' });
    for (const k of listed.keys) put[k.name] = Number((await kv.get(k.name)) ?? '0');
    for (const prefix of ['classday:', 'spend:']) {
      let cursor: string | undefined;
      do {
        const l: KVNamespaceListResult<unknown> = await kv.list({ prefix, cursor });
        for (const k of l.keys) put[k.name] = Number((await kv.get(k.name)) ?? '0');
        cursor = l.list_complete ? undefined : l.cursor;
      } while (cursor);
    }
    for (const id of ids) {
      const u = JSON.parse((await kv.get(`user:${id}`)) ?? 'null') as User | null;
      if (u?.bonus) put[`bonus:${id}`] = u.bonus;
    }
    put.imported = Date.now();
    // storage.put takes at most 128 keys at a time
    const entries = Object.entries(put);
    for (let i = 0; i < entries.length; i += 100) await s.put(Object.fromEntries(entries.slice(i, i + 100)));
  }

  private num(key: string) {
    return this.ctx.storage.get<number>(key).then((v) => v ?? 0);
  }

  // ---- accounts list ----
  async userIds(): Promise<string[]> {
    return (await this.ctx.storage.get<string[]>('users')) ?? [];
  }
  async addUser(id: string) {
    const ids = await this.userIds();
    if (!ids.includes(id)) await this.ctx.storage.put('users', [...ids, id]);
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
  async spentOn(userIds: string[], date: string) {
    const got = await this.ctx.storage.get<number>(userIds.map((id) => `spend:${id}:${date}`));
    return Object.fromEntries(userIds.map((id) => [id, got.get(`spend:${id}:${date}`) ?? 0]));
  }
  async bonuses(userIds: string[]) {
    const got = await this.ctx.storage.get<number>(userIds.map((id) => `bonus:${id}`));
    return Object.fromEntries(userIds.map((id) => [id, got.get(`bonus:${id}`) ?? 0]));
  }

  /** Record one AI call. Admins count toward their own day only, not the class total or extra credit. */
  async charge(userId: string, admin: boolean, cost: number, date: string, perPerson: number) {
    if (!(cost > 0)) return;
    const s = this.ctx.storage;
    const spentKey = `spend:${userId}:${date}`;
    const spent = await this.num(spentKey);
    const put: Record<string, number> = { [spentKey]: spent + cost };
    if (!admin) {
      const bonus = await this.num(`bonus:${userId}`);
      const next = applyCharge(spent, perPerson, bonus, cost);
      if (next.bonus !== bonus) put[`bonus:${userId}`] = Math.max(0, next.bonus);
      put[`month:${date.slice(0, 7)}`] = (await this.num(`month:${date.slice(0, 7)}`)) + cost;
      put[`classday:${date}`] = (await this.num(`classday:${date}`)) + cost;
    }
    await s.put(put);
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
