// Sign in with Google: only a token Google really signed, for this app, current, with a verified email, gets in.
// The test makes its own RSA key and plays Google's key server, so nothing here talks to Google.
import { beforeAll, describe, expect, it } from 'vitest';
import { usernameFromEmail, verifyGoogleToken } from '../worker/google';

const CLIENT = 'test-client.apps.googleusercontent.com';
const b64u = (b: Uint8Array | string) =>
  Buffer.from(typeof b === 'string' ? new TextEncoder().encode(b) : b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let priv: CryptoKey, other: CryptoKey, jwk: JsonWebKey;
const kid = 'k1';
const fetcher = (async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }))) as typeof fetch;

beforeAll(async () => {
  const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const kp = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  priv = kp.privateKey;
  jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  other = ((await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair).privateKey;
});

async function token(claims: Record<string, unknown>, key = priv, header: Record<string, unknown> = { alg: 'RS256', kid }) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: 'https://accounts.google.com', aud: CLIENT, sub: '1234567890', email: 'Jms423@njit.edu', email_verified: true, name: 'Jeremiah S', given_name: 'Jeremiah', iat: now, exp: now + 3600, ...claims };
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(body))}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data)));
  return `${data}.${b64u(sig)}`;
}

describe('Google ID token check', () => {
  it('accepts a real token for this app', async () => {
    expect(await verifyGoogleToken(await token({}), CLIENT, fetcher)).toEqual({ sub: '1234567890', email: 'jms423@njit.edu', name: 'Jeremiah S', givenName: 'Jeremiah' });
  });
  it('turns away a token for a different app', async () => {
    expect(await verifyGoogleToken(await token({ aud: 'someone-else' }), CLIENT, fetcher)).toBeNull();
  });
  it('turns away an expired token', async () => {
    expect(await verifyGoogleToken(await token({ exp: Math.floor(Date.now() / 1000) - 600 }), CLIENT, fetcher)).toBeNull();
  });
  it('turns away a token signed by anyone but Google', async () => {
    expect(await verifyGoogleToken(await token({}, other), CLIENT, fetcher)).toBeNull();
  });
  it('turns away an unverified email, a wrong issuer, and a non-RS256 header', async () => {
    expect(await verifyGoogleToken(await token({ email_verified: false }), CLIENT, fetcher)).toBeNull();
    expect(await verifyGoogleToken(await token({ iss: 'evil.example' }), CLIENT, fetcher)).toBeNull();
    expect(await verifyGoogleToken(await token({}, priv, { alg: 'none', kid }), CLIENT, fetcher)).toBeNull();
  });
  it('turns away a token whose claims were changed after signing', async () => {
    const t = await token({});
    const [h, , s] = t.split('.');
    const forged = `${h}.${b64u(JSON.stringify({ iss: 'accounts.google.com', aud: CLIENT, sub: 'admin', email: 'x@y.z', email_verified: true, exp: 9e9 }))}.${s}`;
    expect(await verifyGoogleToken(forged, CLIENT, fetcher)).toBeNull();
  });
  it('turns away junk', async () => {
    expect(await verifyGoogleToken('not.a.token', CLIENT, fetcher)).toBeNull();
    expect(await verifyGoogleToken('', CLIENT, fetcher)).toBeNull();
  });
});

describe('username from a Google email', () => {
  it('uses the part before @, kept to the username rules', () => {
    expect(usernameFromEmail('jms423@njit.edu')).toBe('jms423');
    expect(usernameFromEmail('Ana.Lopez+cs@gmail.com')).toBe('ana.lopezcs');
    expect(usernameFromEmail('jo@x.com')).toMatch(/^[a-z0-9._-]{3,24}$/);
    expect(usernameFromEmail('_.x@x.com')).toMatch(/^[a-z0-9][a-z0-9._-]{2,23}$/);
  });
});
