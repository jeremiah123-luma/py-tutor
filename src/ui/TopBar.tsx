import type { ReactNode } from 'react';
import { ProfileMenu } from './Profile';

export const FINAL_DATE = new Date('2026-12-19T09:00:00-05:00');

export function daysToFinal(now = new Date()) {
  return Math.max(0, Math.ceil((FINAL_DATE.getTime() - now.getTime()) / 86_400_000));
}

export function Logo({ onClick }: { onClick?: () => void }) {
  const mark = (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-lg font-code text-[0.75rem] font-bold text-[#111]"
        style={{ background: 'radial-gradient(70% 70% at 25% 20%, #C7D2FE, transparent), radial-gradient(70% 70% at 80% 85%, #F9A8D4, transparent), #A78BFA' }}
      >
        {'>_'}
      </span>
      <span className="text-[1.0625rem] font-bold tracking-[-0.04em]">py-tutor</span>
    </span>
  );
  return onClick ? (
    <button onClick={onClick} aria-label="py-tutor home" className="press rounded-md">
      {mark}
    </button>
  ) : (
    mark
  );
}

/** Logo, breadcrumbs, and actions on the right. */
export function TopBar({ crumbs = [], right, onHome }: { crumbs?: string[]; right?: ReactNode; onHome?: () => void }) {
  return (
    <div className="flex h-14 items-center gap-3 border-b border-line px-4 md:px-5">
      <Logo onClick={onHome} />
      {crumbs.map((c, i) => (
        <span key={i} className={`flex min-w-0 items-center gap-3 text-sm ${i === crumbs.length - 1 ? 'text-ink' : 'text-ink-2'} ${i < crumbs.length - 1 ? 'max-sm:hidden' : ''}`}>
          <span className="text-ink-3" aria-hidden="true">
            /
          </span>
          <span className="truncate">{c}</span>
        </span>
      ))}
      <div className="ml-auto flex items-center gap-2">
        {right}
        <ProfileMenu />
      </div>
    </div>
  );
}

export function FinalPill() {
  const d = daysToFinal();
  return (
    <span className="glass-dark tnum inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm whitespace-nowrap">
      <span className="size-1.5 animate-pulse rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" aria-hidden="true" />
      <span className="text-ink-2 max-sm:hidden">Final in</span>
      <span className="font-medium text-accent">
        {d} day{d === 1 ? '' : 's'}
      </span>
    </span>
  );
}
