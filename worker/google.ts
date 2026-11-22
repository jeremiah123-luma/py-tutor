// Sign in with Google. The page gets a signed ID token from Google (Google Identity Services); this checks it was
// really signed by Google, for this app, recently, and for a verified email, before anyone is signed in with it.
import { b64u } from './accounts';

export interface GoogleId {
  sub: string; // Google's id for the person: never changes, unlike the email
  email: string;
  name: string;
  givenName: string;
}

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

let keys: { at: number; byKid: Map<string, JsonWebKey> } | null = null;

/** Google's public signing keys, kept for an hour (Google rotates them every few days, with overlap). */
async function googleKey(kid: string, fetcher: typeof fetch): Promise<JsonWebKey | null> {
  if (!keys || Date.now() - keys.at > 3600_000 || !keys.byKid.has(kid)) {
    const r = await fetcher(CERTS);
    if (!r.ok) throw new Error(`google certs ${r.status}`);
    const j = (await r.json()) as { keys: (JsonWebKey & { kid: string })[] };
    keys = { at: Date.now(), byKid: new Map(j.keys.map((k) => [k.kid, k])) };
  }
  return keys.byKid.get(kid) ?? null;
}

const json = (part: string) => JSON.parse(new TextDecoder().decode(b64u.to(part)));

/** The person in a Google ID token, or null if it isn't a valid, current token for this app. */
export async function verifyGoogleToken(token: string, clientId: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<GoogleId | null> {
  const parts = String(token).split('.');
  if (parts.length !== 3 || token.length > 4096) return null;
  let header: { alg?: string; kid?: string }, claims: Record<string, unknown>;
  try {
    header = json(parts[0]);
    claims = json(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;
  const jwk = await googleKey(header.kid, fetcher);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u.to(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;
  const sec = now / 1000;
  if (!ISSUERS.has(String(claims.iss))) return null;
  if (claims.aud !== clientId) return null;
  if (typeof claims.exp !== 'number' || claims.exp < sec - 60) return null;
  if (typeof claims.iat === 'number' && claims.iat > sec + 300) return null;
  if (claims.email_verified !== true || typeof claims.email !== 'string' || typeof claims.sub !== 'string') return null;
  const name = String(claims.name ?? '').trim();
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: name || claims.email.split('@')[0], givenName: String(claims.given_name ?? '').trim() };
}

/** A username for a new Google account, from the email: jms423@njit.edu becomes jms423 (or jms423-2 if taken). */
export function usernameFromEmail(email: string) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+/, '').slice(0, 20);
  return base.length >= 3 ? base : `${base}user`.slice(0, 20);
}
