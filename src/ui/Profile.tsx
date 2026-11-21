import { createContext, useContext, useState } from 'react';
import { rememberSound, soundWanted } from '../intro/sound';
import { sfx } from './sfx';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { LogOut, Keyboard, Mic, Trophy, CalendarClock, Fingerprint, Gauge, Users, Compass, Volume2, VolumeX } from 'lucide-react';
import type { Usage } from '../loop/api';
import { finalIn } from './TopBar';

export interface ProfileInfo {
  name: string;
  mastered: number;
  total: number;
  mode: 'type' | 'talk';
  username: string;
  admin: boolean;
  passkeys: number;
  usage?: Usage | null;
  onAddPasskey?: () => void;
  onAdmin?: () => void;
  onReplayTour?: () => void;
  onSignOut: () => void;
  /** Refresh the AI-help numbers when the menu opens, so they're never stale. */
  onOpen?: () => void;
}

const item =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink';

export const ProfileContext = createContext<ProfileInfo | null>(null);

export function ProfileMenu() {
  const p = useContext(ProfileContext);
  if (!p) return null;
  const initial = p.name.charAt(0).toUpperCase();
  const pct = p.total ? Math.round((p.mastered / p.total) * 100) : 0;
  return (
    <Menu.Root onOpenChange={(open) => open && p.onOpen?.()}>
      <Menu.Trigger
        aria-label={`Account: ${p.name}`}
        className="press grid size-9 place-items-center rounded-full text-sm font-bold text-[#111] ring-1 ring-white/20 outline-none hover:ring-white/50 focus-visible:ring-2 focus-visible:ring-accent"
        style={{ background: 'radial-gradient(70% 70% at 25% 20%, #C7D2FE, transparent), radial-gradient(70% 70% at 80% 85%, #F9A8D4, transparent), #A78BFA' }}
      >
        {initial}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-2xl border border-line-strong bg-[#161616]/95 p-2 text-ink shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl data-[state=open]:animate-[pop-in_220ms_var(--ease-out)]"
        >
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <span
              className="grid size-10 place-items-center rounded-full text-base font-bold text-[#111]"
              style={{ background: 'radial-gradient(70% 70% at 25% 20%, #C7D2FE, transparent), radial-gradient(70% 70% at 80% 85%, #F9A8D4, transparent), #A78BFA' }}
              aria-hidden="true"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="truncate text-sm text-ink-2">@{p.username} · CS 100</p>
            </div>
          </div>
          <div className="mx-1 mb-2 rounded-xl bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="size-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <span className="tnum">
                {p.mastered} of {p.total} lessons mastered
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-line-strong" aria-hidden="true">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <CalendarClock className="size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="tnum">{finalIn()} · Sat, Dec 19, 9:00 AM</span>
            </div>
            {p.usage && !p.admin && (
              <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-2">
                <Gauge className="size-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="tnum">
                  AI help today: ${p.usage.spentToday.toFixed(2)} of ${(p.usage.allowance + p.usage.bonus).toFixed(2)}
                </span>
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-2">
              {p.mode === 'talk' ? <Mic className="size-4" strokeWidth={1.75} aria-hidden="true" /> : <Keyboard className="size-4" strokeWidth={1.75} aria-hidden="true" />}
              <span>{p.mode === 'talk' ? 'Talk mode' : 'Type mode'}</span>
            </div>
          </div>
          {p.admin && p.onAdmin && (
            <Menu.Item onSelect={p.onAdmin} className={item}>
              <Users className="size-4" strokeWidth={1.75} aria-hidden="true" /> Class usage
            </Menu.Item>
          )}
          {p.passkeys === 0 && p.onAddPasskey && (
            <Menu.Item onSelect={p.onAddPasskey} className={item}>
              <Fingerprint className="size-4" strokeWidth={1.75} aria-hidden="true" /> Add a passkey (Face ID)
            </Menu.Item>
          )}
          <SoundItem />
          {p.onReplayTour && (
            <Menu.Item onSelect={p.onReplayTour} className={item}>
              <Compass className="size-4" strokeWidth={1.75} aria-hidden="true" /> Show the tutorial again
            </Menu.Item>
          )}
          <Menu.Item onSelect={p.onSignOut} className={item}>
            <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" /> Sign out on this device
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** One switch for every sound: the intro's music and effects, the tutorial, and the tutor's sounds. */
function SoundItem() {
  const [on, setOn] = useState(soundWanted);
  return (
    <Menu.Item
      onSelect={(e) => {
        e.preventDefault(); // keep the menu open so the change is visible
        const next = !on;
        rememberSound(next);
        setOn(next);
        if (next) sfx.tourStep();
      }}
      className={item}
      aria-label={on ? 'Sounds on. Turn off' : 'Sounds off. Turn on'}
    >
      {on ? <Volume2 className="size-4" strokeWidth={1.75} aria-hidden="true" /> : <VolumeX className="size-4" strokeWidth={1.75} aria-hidden="true" />}
      Sounds: {on ? 'on' : 'off'}
    </Menu.Item>
  );
}
