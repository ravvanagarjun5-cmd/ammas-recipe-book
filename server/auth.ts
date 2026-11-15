import crypto from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { DB } from './db.ts';

const COOKIE = 'session';
const SESSION_DAYS = 90; // Mom signs in once and stays signed in.

const normalise = (p: string) => p.normalize('NFKC').trim().toLowerCase();

export function hashPassphrase(passphrase: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(normalise(passphrase), salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassphrase(passphrase: string, stored: string): boolean {
  const [kind, saltHex, keyHex] = stored.split('$');
  if (kind !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(normalise(passphrase), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(db: DB, userId: string, secure: boolean, c: Context) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha(token), userId, Date.now() + SESSION_DAYS * 86400_000,
  );
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure, path: '/', maxAge: SESSION_DAYS * 86400 });
}

export function destroySession(db: DB, c: Context) {
  const token = getCookie(c, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  deleteCookie(c, COOKIE, { path: '/' });
}

export function userIdFor(db: DB, c: Context): string | null {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha(token)) as
    | { user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

export type AuthEnv = { Variables: { userId: string } };

export function requireAuth(db: DB): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const userId = userIdFor(db, c);
    if (!userId) return c.json({ error: 'Please sign in again.' }, 401);
    c.set('userId', userId);
    await next();
  };
}

/** Tiny in-memory throttle for passphrase guesses: 8 tries per minute per client. */
export function makeLoginLimiter() {
  const tries = new Map<string, number[]>();
  const all: number[] = [];
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (tries.get(key) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    tries.set(key, recent);
    // Global cap too (30/min across everyone), so rotating forged client addresses cannot bypass the per-client limit.
    while (all.length && now - all[0]! >= 60_000) all.shift();
    all.push(now);
    return recent.length <= 8 && all.length <= 30;
  };
}
