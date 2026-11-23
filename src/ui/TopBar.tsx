import type { ReactNode } from 'react';
import { ProfileMenu } from './Profile';
import { DateCoin } from './DateCoin';

export const FINAL_DATE = new Date('2026-12-19T09:00:00-05:00');

/** Whole calendar days until the final, counted in New York time (so it changes at midnight, not at 9 AM). */
export function daysToFinal(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(2026, 11, 19) - Date.UTC(y, m - 1, d)) / 86_400_000));
}

/** "Final in 3 days", "Final is tomorrow", "Final is today". */
export function finalIn(now = new Date()) {
  const d = daysToFinal(now);
  return d === 0 ? 'Final is today' : d === 1 ? 'Final is tomorrow' : `Final in ${d} days`;
}

export function Logo({ onClick }: { onClick?: () => void }) {
  const mark = (
    <span className="flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-lg font-code text-[0.75rem] font-bold text-[#111]"
        style={{ background: 'radial-gradient(70% 70% at 25% 20%, #C7D2FE, transparent), radial-gradient(70% 70% at 80% 85%, #F9A8D4, transparent), #A78BFA' }}
      >
        {'>_'}
      </span>
      <span className="text-[1.0625rem] font-bold tracking-[-0.04em] whitespace-nowrap max-[420px]:sr-only">py-tutor</span>
    </span>
  );
  return onClick ? (
    <button onClick={onClick} aria-label="py-tutor home" className="press -m-2 rounded-md p-2">
      {mark}
    </button>
  ) : (
    mark
  );
}

/** Logo, breadcrumbs, and actions on the right. */
export function TopBar({ crumbs = [], right, onHome }: { crumbs?: string[]; right?: ReactNode; onHome?: () => void }) {
  return (
    // On iPhone (home-screen app) the page draws under the status bar, so leave room for it.
    <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-line pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:pr-[max(1.25rem,env(safe-area-inset-right))] md:pl-[max(1.25rem,env(safe-area-inset-left))]">
      <Logo onClick={onHome} />
      {crumbs.map((c, i) => (
        <span key={i} className={`flex min-w-0 items-center gap-3 text-sm ${i === crumbs.length - 1 ? 'text-ink' : 'text-ink-2'} ${i < crumbs.length - 1 ? 'max-sm:hidden' : ''}`}>
          <span className="text-ink-3" aria-hidden="true">
            /
          </span>
          <span className="truncate">{c}</span>
        </span>
      ))}
      <div data-tour="profile" className="ml-auto flex items-center gap-2">
        {right}
        <ProfileMenu />
      </div>
    </div>
  );
}

export function FinalPill() {
  // the date as a coin: SAT, DEC, 19, then the days left
  return (
    <span className="inline-flex h-9 items-center">
      <DateCoin days={daysToFinal()} size={26} label={`${finalIn()}: Sat, Dec 19`} />
    </span>
  );
}
