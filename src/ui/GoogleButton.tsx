// Google's own "Sign in with Google" button (Google Identity Services). Google draws it, so it always matches their
// rules, and hands back a signed ID token that the Worker checks. Hidden when Google sign-in isn't set up.
import { useEffect, useRef, useState } from 'react';
import { googleClientId } from '../loop/api';

type Gis = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean; itp_support?: boolean; use_fedcm_for_button?: boolean }): void;
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

export function GoogleButton({ onCredential, text = 'continue_with' }: { onCredential: (credential: string) => void; text?: 'continue_with' | 'signin_with' | 'signup_with' }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    let live = true;
    void (async () => {
      const id = await googleClientId();
      const gis = id ? await loadGis() : null;
      if (!live || !id || !gis || !box.current) return setReady(false);
      gis.accounts.id.initialize({ client_id: id, callback: (r) => cb.current(r.credential), ux_mode: 'popup', auto_select: false, itp_support: true });
      gis.accounts.id.renderButton(box.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text,
        logo_alignment: 'center',
        width: Math.min(400, Math.max(200, box.current.parentElement?.clientWidth ?? 320)),
      });
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [text]);

  if (ready === false) return null;
  return <div ref={box} className="flex min-h-11 justify-center" aria-busy={ready === null} />;
}
