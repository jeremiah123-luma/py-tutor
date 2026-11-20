import { useState } from 'react';
import { Button } from '../ui/primitives';
import { Logo } from '../ui/TopBar';
import { Aurora } from '../ui/Aurora';

export function PassScreen({ onSubmit }: { onSubmit: (p: string) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center border-b border-line px-4 pt-[env(safe-area-inset-top)] md:px-5">
        <Logo />
      </div>
      <Aurora className="px-5 pt-20 pb-32 text-center md:pt-28">
        <h1 className="font-voice text-[2.5rem] leading-[1.02] md:text-[4rem]">Ace the final.</h1>
        <p className="mx-auto mt-3 max-w-[40ch] text-base text-[#3a3340]">Your Python tutor for dictionaries, files, and classes.</p>
      </Aurora>
      <form
        className="glow-ring relative z-10 mx-auto -mt-20 flex w-[calc(100%-2rem)] max-w-md flex-col gap-3 rounded-2xl bg-surface p-5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.6)] animate-[rise-in_700ms_var(--ease-out)_both]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await onSubmit(value.trim());
          setBusy(false);
          setWrong(!ok);
        }}
      >
        <label htmlFor="pass" className="text-[0.9375rem] text-ink-2">
          Passcode
        </label>
        <input
          id="pass"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
          aria-invalid={wrong}
          aria-describedby={wrong ? 'pass-err' : undefined}
          className="h-12 rounded-md border border-line-strong bg-surface-2 px-4 text-md focus-visible:outline-2 focus-visible:outline-accent"
        />
        {wrong && (
          <p id="pass-err" className="text-sm text-err">
            That passcode didn’t work.
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!value.trim()} className="justify-center">
          Open
        </Button>
      </form>
    </main>
  );
}
