// Sign in / create account. Real <form>s with the right autocomplete fields so iPhone and Chrome
// offer to save the username and password, plus passkeys (Face ID / Touch ID).
import { useRef, useState, type ReactNode } from 'react';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/primitives';
import { Logo } from '../ui/TopBar';
import { Aurora } from '../ui/Aurora';
import { Intro } from '../ui/Intro';
import { introSeen, markIntroSeen } from '../intro/state';
import { distortionWave, recentTap } from '../ui/wave';
import { addPasskey, passkeysSupported, signIn, signInWithPasskey, signUp, type Account } from '../loop/api';

type Tab = 'signin' | 'signup';

const inputCls =
  'h-12 w-full rounded-md border border-line-strong bg-surface-2 px-4 text-md focus-visible:outline-2 focus-visible:outline-accent aria-[invalid=true]:border-err';

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.9375rem] text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-err">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const passkeyCancelled = (e: unknown) => ['NotAllowedError', 'AbortError'].includes((e as Error)?.name);

export function AuthScreen({ onSignedIn }: { onSignedIn: (u: Account) => void }) {
  const [tab, setTab] = useState<Tab>('signin');
  const [busy, setBusy] = useState<'' | 'form' | 'passkey'>('');
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [offer, setOffer] = useState<Account | null>(null); // just signed up: offer a passkey
  const [f, setF] = useState({ name: '', username: '', password: '', code: '' });
  const canPasskey = passkeysSupported();
  const [intro, setIntro] = useState(() => !introSeen());
  const cardRef = useRef<HTMLDivElement>(null);
  // Signing in is the "it worked" moment: the wave goes through the card, then the app opens.
  const welcome = async (u: Account) => {
    await distortionWave(cardRef.current, { origin: recentTap(), tone: 'iridescent' });
    onSignedIn(u);
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError(null);
  };
  const err = (field: string) => (error?.field === field ? error.text : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy('form');
    setError(null);
    try {
      if (tab === 'signin') await welcome((await signIn({ username: f.username, password: f.password })).user);
      else {
        const { user } = await signUp(f);
        if (canPasskey) {
          void distortionWave(cardRef.current, { origin: recentTap(), tone: 'success' });
          setOffer(user);
        } else await welcome(user);
      }
    } catch (x) {
      setError({ text: (x as Error).message, field: (x as { field?: string }).field });
    }
    setBusy('');
  }

  async function passkeySignIn() {
    setBusy('passkey');
    setError(null);
    try {
      await welcome(await signInWithPasskey());
    } catch (x) {
      if (!passkeyCancelled(x)) setError({ text: (x as Error).message || 'That passkey didn’t work. Sign in with your password.' });
    }
    setBusy('');
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center border-b border-line pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <Logo />
      </div>
      <Aurora className="px-5 pt-16 pb-32 text-center md:pt-24">
        <h1 className="font-voice text-[2.5rem] leading-[1.02] md:text-[4rem]">Ace the final.</h1>
        <p className="mx-auto mt-3 max-w-[40ch] text-base text-[#3a3340]">A Python tutor for CS 100: dictionaries, files, and classes. It coaches you, it never writes your code.</p>
        <button type="button" onClick={() => setIntro(true)} className="mt-4 text-sm font-medium text-[#111] underline underline-offset-4 hover:text-[#5b21b6]">
          What is py-tutor?
        </button>
      </Aurora>

      <div ref={cardRef} className="glow-ring relative z-10 mx-auto -mt-20 mb-12 w-[calc(100%-2rem)] max-w-md rounded-2xl bg-surface p-5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.6)] animate-[rise-in_700ms_var(--ease-out)_both]">
        {offer ? (
          <PasskeyOffer user={offer} onDone={(u) => void welcome(u)} />
        ) : (
          <>
            <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 rounded-lg bg-surface-2 p-1">
              {(['signin', 'signup'] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => {
                    setTab(t);
                    setError(null);
                  }}
                  className="press h-10 rounded-md text-[0.9375rem] font-medium text-ink-2 outline-none aria-selected:bg-seg-on aria-selected:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {t === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
              {tab === 'signup' && (
                <Field id="name" label="Your name" hint="Shown to the tutor so it can use your name." error={err('name')}>
                  <input id="name" name="name" autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={!!err('name')} className={inputCls} />
                </Field>
              )}
              <Field id="username" label="Username" error={err('username')} hint={tab === 'signup' ? '3 to 24 letters or numbers. You’ll sign in with this.' : undefined}>
                <input
                  id="username"
                  name="username"
                  autoComplete={tab === 'signin' ? 'username webauthn' : 'username'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={f.username}
                  onChange={set('username')}
                  aria-invalid={!!err('username')}
                  className={inputCls}
                />
              </Field>
              <Field id="password" label="Password" error={err('password')} hint={tab === 'signup' ? 'At least 8 characters. Your phone can save it for you.' : undefined}>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  minLength={tab === 'signup' ? 8 : undefined}
                  value={f.password}
                  onChange={set('password')}
                  aria-invalid={!!err('password')}
                  className={inputCls}
                />
              </Field>
              {tab === 'signup' && (
                <Field id="code" label="Class code" hint="From the CS 100 group chat." error={err('code')}>
                  <input id="code" name="code" autoComplete="off" autoCapitalize="none" value={f.code} onChange={set('code')} aria-invalid={!!err('code')} className={inputCls} />
                </Field>
              )}

              {error && !error.field && (
                <p role="alert" className="text-sm text-err">
                  {error.text}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={busy === 'form'}
                disabled={!!busy || !f.username.trim() || !f.password || (tab === 'signup' && (!f.name.trim() || !f.code.trim()))}
                className="justify-center"
              >
                {tab === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            {tab === 'signin' && canPasskey && (
              <>
                <div className="my-4 flex items-center gap-3 text-sm text-ink-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={passkeySignIn}
                  loading={busy === 'passkey'}
                  disabled={!!busy}
                  icon={<Fingerprint className="size-5" strokeWidth={1.75} />}
                  className="w-full justify-center"
                >
                  Sign in with a passkey
                </Button>
              </>
            )}
            {tab === 'signin' && (
              <p className="mt-4 text-center text-sm text-ink-3">
                New here?{' '}
                <button type="button" onClick={() => setTab('signup')} className="text-ink underline underline-offset-4 hover:text-accent">
                  Create an account
                </button>{' '}
                with the class code.
              </p>
            )}
          </>
        )}
      </div>

      {intro && (
        <Intro
          onDone={(how) => {
            markIntroSeen();
            setIntro(false);
            if (how !== 'skip') {
              setTab(how === 'signin' ? 'signin' : 'signup');
              setError(null);
            }
          }}
        />
      )}
    </main>
  );
}

/** Right after sign-up: one tap to add a passkey so next time it's just Face ID. */
function PasskeyOffer({ user, onDone }: { user: Account; onDone: (u: Account) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = user.name.split(/\s+/)[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-accent" aria-hidden="true">
          <ShieldCheck className="size-6" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-lg font-semibold">You’re in, {first}.</p>
          <p className="text-sm text-ink-2">Your account is ready.</p>
        </div>
      </div>
      <div className="rounded-xl bg-surface-2 p-4">
        <p className="flex items-center gap-2 font-medium">
          <KeyRound className="size-4 text-accent" strokeWidth={1.75} aria-hidden="true" /> Add a passkey?
        </p>
        <p className="mt-1.5 text-[0.9375rem] text-ink-2">Next time you sign in with Face ID or Touch ID instead of typing your password. Your password still works too.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-err">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        loading={busy}
        className="justify-center"
        icon={<Fingerprint className="size-5" strokeWidth={1.75} />}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            onDone(await addPasskey());
          } catch (x) {
            if (!passkeyCancelled(x)) setError('The passkey couldn’t be added. You can add one later from your profile.');
          }
          setBusy(false);
        }}
      >
        Add a passkey
      </Button>
      <Button variant="ghost" size="lg" className="justify-center" disabled={busy} onClick={() => onDone(user)}>
        Not now
      </Button>
    </div>
  );
}
