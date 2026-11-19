import { useState } from 'react';
import { Button } from '../ui/primitives';

export function PassScreen({ onSubmit }: { onSubmit: (p: string) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <p className="font-voice text-md font-semibold">
        py<span className="bg-[linear-gradient(transparent_55%,var(--hl)_55%)] px-0.5">tutor</span>
      </p>
      <form
        className="mt-8 flex flex-col gap-3"
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
          className="h-12 rounded-lg border border-line-strong bg-surface px-4 text-md focus-visible:outline-2 focus-visible:outline-accent"
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
