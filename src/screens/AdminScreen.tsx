// Class usage (admins only): the month's budget, today's allowance, everyone's spending,
// and "Ask for more" requests to approve or decline.
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, X } from 'lucide-react';
import { TopBar } from '../ui/TopBar';
import { Button } from '../ui/primitives';
import { adminOverview, reviewRequest, type AdminOverview } from '../loop/api';

const money = (n: number) => `$${n.toFixed(2)}`;
const GRANTS = [0.25, 0.5, 1];

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await adminOverview());
    } catch {
      setError('Couldn’t load class usage. Check your connection and try again.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: 'approve' | 'decline', amount?: number) => {
    setBusy(id);
    try {
      await reviewRequest(id, action, amount);
      await load();
    } catch {
      setError('That didn’t save. Try again.');
    }
    setBusy('');
  };

  const pending = data?.requests.filter((r) => r.status === 'pending') ?? [];
  const done = data?.requests.filter((r) => r.status !== 'pending').slice(0, 10) ?? [];
  const pct = data ? Math.min(100, (data.monthSpent / data.budget) * 100) : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        crumbs={['Class usage']}
        onHome={onBack}
        right={
          <Button size="sm" variant="ghost" onClick={() => void load()} icon={<RefreshCw className="size-4" strokeWidth={1.75} />}>
            Refresh
          </Button>
        }
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="size-4" strokeWidth={1.75} />} className="self-start">
          Home
        </Button>
        {error && (
          <p role="alert" className="text-sm text-err">
            {error}
          </p>
        )}
        {data && (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Stat label="This month" value={`${money(data.monthSpent)} of ${money(data.budget)}`}>
                <div className="mt-2 h-1.5 rounded-full bg-line-strong" aria-hidden="true">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </Stat>
              <Stat label="Today, per person" value={money(data.allowance.perPerson)} note="Resets daily" />
              <Stat label="Active this week" value={String(data.allowance.active)} note="Splits the budget" />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Requests for more {pending.length > 0 && <span className="text-accent">({pending.length})</span>}</h2>
              {pending.length === 0 && <p className="text-[0.9375rem] text-ink-2">No one is waiting. Requests show up here when someone taps “Ask for more”.</p>}
              {pending.map((r) => (
                <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="tnum text-sm text-ink-2">
                      @{r.username} · used {money(r.spentToday)} of {money(r.allowance)} · {new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {GRANTS.map((g) => (
                      <Button key={g} size="sm" variant="secondary" disabled={busy === r.id} onClick={() => void act(r.id, 'approve', g)} icon={<Check className="size-4" strokeWidth={2} />}>
                        +{money(g)}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void act(r.id, 'decline')} icon={<X className="size-4" strokeWidth={2} />}>
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
              {done.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-ink-2">
                  {done.map((r) => (
                    <li key={r.id} className="tnum">
                      {r.name}: {r.status === 'approved' ? `approved +${money(r.granted ?? 0)}` : 'declined'} ({r.at ? new Date(r.at).toLocaleDateString() : ''})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Everyone ({data.users.length})</h2>
              <div className="overflow-x-auto rounded-xl border border-line-strong">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="text-ink-3">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Today</th>
                      <th className="px-4 py-2.5 font-medium">Extra credit</th>
                      <th className="px-4 py-2.5 font-medium">Last used AI</th>
                      <th className="px-4 py-2.5 font-medium">Passkey</th>
                    </tr>
                  </thead>
                  <tbody className="tnum">
                    {data.users.map((u) => (
                      <tr key={u.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5">
                          {u.name} <span className="text-ink-3">@{u.username}</span>
                          {u.admin && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">admin</span>}
                        </td>
                        <td className="px-4 py-2.5">{money(u.spentToday)}</td>
                        <td className="px-4 py-2.5">{u.bonus > 0 ? money(u.bonus) : '–'}</td>
                        <td className="px-4 py-2.5">{u.lastSeen ?? 'never'}</td>
                        <td className="px-4 py-2.5">{u.passkeys > 0 ? 'yes' : 'no'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, note, children }: { label: string; value: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line-strong bg-surface p-4">
      <p className="text-sm text-ink-3">{label}</p>
      <p className="tnum mt-1 text-xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-sm text-ink-3">{note}</p>}
      {children}
    </div>
  );
}
