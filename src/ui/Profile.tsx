import { createContext, useContext, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './primitives';
import { rememberSound, soundWanted } from '../intro/sound';
import { sfx } from './sfx';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { LogOut, Trash2, Keyboard, Mic, Trophy, CalendarClock, Fingerprint, Gauge, Users, Compass, Volume2, VolumeX } from 'lucide-react';
import type { Usage } from '../loop/api';
import { finalIn } from './TopBar';
import { GoogleG } from './GoogleButton';

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
  onRemovePasskeys?: () => void;
  /** The connected Google account's email (null: none). */
  google?: string | null;
  onConnectGoogle?: () => void;
  onAdmin?: () => void;
  onReplayTour?: () => void;
  onSignOut: () => void;
  /** Delete the account for good (the typed username is checked by the server). Rejects with a message on failure. */
  onDeleteAccount?: (confirm: string) => Promise<void>;
  /** Refresh the AI-help numbers when the menu opens, so they're never stale. */
  onOpen?: () => void;
}

const item =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink';

export const ProfileContext = createContext<ProfileInfo | null>(null);

export function ProfileMenu() {
  const p = useContext(ProfileContext);
  const [deleting, setDeleting] = useState(false);
  if (!p) return null;
  const initial = p.name.charAt(0).toUpperCase();
  const pct = p.total ? Math.round((p.mastered / p.total) * 100) : 0;
  return (
    <>
    {p.onDeleteAccount && <DeleteAccountDialog open={deleting} username={p.username} onClose={() => setDeleting(false)} onDelete={p.onDeleteAccount} />}
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
          className="z-50 w-72 rounded-2xl border border-line-strong bg-[#161616] p-2 text-ink shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] data-[state=open]:animate-[pop-in_220ms_var(--ease-out)]"
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
          {p.passkeys > 0 && p.onRemovePasskeys && (
            <Menu.Item onSelect={p.onRemovePasskeys} className={item}>
              <Fingerprint className="size-4" strokeWidth={1.75} aria-hidden="true" /> Remove {p.passkeys === 1 ? 'my passkey' : `my ${p.passkeys} passkeys`}
            </Menu.Item>
          )}
          {!p.google && p.onConnectGoogle && (
            <Menu.Item onSelect={p.onConnectGoogle} className={item}>
              <GoogleG className="size-4" /> Connect Google sign-in
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
          {p.onDeleteAccount && (
            <Menu.Item onSelect={() => setDeleting(true)} className={`${item} data-[highlighted]:text-err`}>
              <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" /> Delete my account
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
    </>
  );
}

/** "Delete my account": says exactly what goes, and only goes ahead once the username is typed. */
function DeleteAccountDialog({ open, username, onClose, onDelete }: { open: boolean; username: string; onClose: () => void; onDelete: (confirm: string) => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const match = typed.trim().toLowerCase() === username.toLowerCase();
  const close = () => {
    if (busy) return;
    onClose();
    setTyped('');
    setError('');
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line-strong bg-surface p-6 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] outline-none">
          <span className="grid size-11 place-items-center rounded-full bg-err-bg text-err" aria-hidden="true">
            <Trash2 className="size-6" strokeWidth={1.75} />
          </span>
          <Dialog.Title className="mt-4 text-xl font-semibold">Delete your account?</Dialog.Title>
          <Dialog.Description className="mt-2 text-[0.9375rem] text-ink-2">
            This removes your account, your sign-in (password, Face ID, Google link), and all your saved progress. It can’t be undone, and nobody can get it back for you.
          </Dialog.Description>
          <form
            className="mt-5 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!match || busy) return;
              setBusy(true);
              setError('');
              onDelete(typed.trim()).catch((err: unknown) => {
                setBusy(false);
                setError(err instanceof Error ? err.message : 'That didn’t go through. Check your connection and try again.');
              });
            }}
          >
            <label htmlFor="delete-confirm" className="text-sm text-ink-2">
              Type your username, <span className="font-code text-ink">{username}</span>, to confirm.
            </label>
            <input
              id="delete-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-11 rounded-lg border border-line-strong bg-paper px-3 text-base outline-none focus-visible:border-accent"
            />
            {error && (
              <p role="alert" className="text-sm text-err">
                {error}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                Keep my account
              </Button>
              <button
                type="submit"
                disabled={!match || busy}
                className="press h-10 rounded-lg bg-err px-4 text-sm font-semibold text-[#2B1515] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
