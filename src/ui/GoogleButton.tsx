// Sign in with Google. What you see is our own button, styled like the rest of the app (Google's own button only
// comes in Google's colours, and in a dark page the browser paints a white box behind its frame). Google's real
// button sits exactly on top of ours, invisible, so the tap still goes to Google and Google hands back the signed
// ID token that the Worker checks. Hover and keyboard focus show on our button. Hidden when Google sign-in isn't
// set up.
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { googleClientId } from '../loop/api';

type Gis = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean; itp_support?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    };
  };
};

let script: Promise<Gis | null> | null = null;
function loadGis(): Promise<Gis | null> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  script ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(w.google ?? null);
    s.onerror = () => {
      script = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return script;
}

/** Google's four-colour G. */
export function GoogleG({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const LABELS = { continue_with: 'Continue with Google', signin_with: 'Sign in with Google', signup_with: 'Sign up with Google' } as const;

export function GoogleButton({
  onCredential,
  text = 'continue_with',
  busy = false,
}: {
  onCredential: (credential: string) => void;
  text?: keyof typeof LABELS;
  /** Signing in after Google answered: show a spinner and ignore taps. */
  busy?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    let live = true;
    void (async () => {
      const id = await googleClientId();
      const gis = id ? await loadGis() : null;
      if (!live) return;
      if (!id || !gis || !box.current) return setReady(false);
      gis.accounts.id.initialize({ client_id: id, callback: (r) => cb.current(r.credential), ux_mode: 'popup', auto_select: false, itp_support: true });
      gis.accounts.id.renderButton(box.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text,
        width: Math.min(400, Math.max(200, box.current.clientWidth || 320)),
      });
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [text]);

  if (ready === false) return null;
  return (
    <div className={`group relative w-full ${busy ? 'pointer-events-none' : ''}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none flex min-h-12 w-full items-center justify-center gap-3 rounded-md border border-line-strong bg-surface-2 px-5 text-base font-medium text-ink transition-colors duration-150 group-hover:border-ink-3 group-hover:bg-seg-on group-focus-within:outline-2 group-focus-within:outline-offset-2 group-focus-within:outline-accent"
      >
        {busy ? <Loader2 className="size-5 animate-spin" strokeWidth={2} /> : <GoogleG />}
        <span>{LABELS[text]}</span>
      </div>
      {/* Google's real button, stretched over ours and invisible (light colour-scheme so the browser doesn't paint
          a white box behind it). It is what takes the tap and the keyboard focus. */}
      <div
        ref={box}
        className="absolute inset-0 flex items-center justify-center overflow-hidden opacity-0 [color-scheme:light] [&>div]:scale-x-[1.35] [&>div]:scale-y-[1.3]"
        aria-busy={ready === null}
      />
    </div>
  );
}
