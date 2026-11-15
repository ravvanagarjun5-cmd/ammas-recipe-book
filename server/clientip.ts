import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/**
 * Best-effort client address for rate limiting. The server only listens on localhost (or behind a trusted proxy),
 * so we prefer headers set by that proxy: Cloudflare's CF-Connecting-IP, else the LAST X-Forwarded-For entry
 * (the one the proxy itself appended; earlier entries can be forged by the client).
 * A global limit in auth.ts backs this up, so a forged header cannot be used to guess the passphrase.
 */
export function clientKey(c: Context): string {
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return cf;
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',').at(-1)!.trim();
  try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
}

/** True when the browser reached us over HTTPS (directly, or through a tunnel/proxy that says so). */
export function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';
}
