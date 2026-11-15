// Starts the app for testing from a real phone THROUGH A TUNNEL, in recording-only mode (no API keys needed).
// The server still listens on localhost only; the tunnel (see README) is what gives the phone an https:// address.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!process.env.FAMILY_PASSPHRASE_HASH) {
  console.error(`
Phone testing needs a real passphrase, because a tunnel makes the app reachable from the internet.
(The built-in development passphrase is deliberately NOT allowed here.)

  1. npm run hash-passphrase -- "pick a passphrase of your own"
  2. Put the FAMILY_PASSPHRASE_HASH=... line it prints into a file named .env
  3. npm run phone
`);
  process.exit(1);
}

// Recording-only unless real providers were chosen in .env.
process.env.STT_PROVIDER ??= 'none';
process.env.LLM_PROVIDER ??= 'none';
process.env.PORT ??= '8787';

if (!fs.existsSync('web/dist/index.html')) {
  console.log('Building the web app first…');
  const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`
Mode: STT_PROVIDER=${process.env.STT_PROVIDER}, LLM_PROVIDER=${process.env.LLM_PROVIDER}${process.env.STT_PROVIDER === 'none' ? '  (recording-only: your voice is saved, not transcribed)' : ''}

In a SECOND terminal, start the tunnel:

  cloudflared tunnel --url http://localhost:${process.env.PORT}

Open the https://….trycloudflare.com address it prints on the phone, in Chrome.
Stop the tunnel (Ctrl+C) when you are done: the link stops working immediately.
`);

await import('../server/index.ts');
