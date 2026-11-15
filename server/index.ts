import path from 'node:path';
import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { config, startupProblems } from './config.ts';
import { ensureFamilyUser, openDb } from './db.ts';
import { diskStorage } from './storage.ts';
import { createApp } from './app.ts';
import { getSttProvider } from './stt/index.ts';
import { getStructurer } from './ai/structure.ts';
import { hashPassphrase } from './auth.ts';
import { recoverInterruptedJobs } from './pipeline.ts';

const problems = startupProblems();
if (problems.length) {
  for (const p of problems) console.error(`Setup problem: ${p}`);
  process.exit(1);
}

let passphraseHash = config.passphraseHash;
if (!passphraseHash) {
  // Development convenience only (production refuses to start without a real hash).
  passphraseHash = hashPassphrase('amma');
  console.warn('\n  DEV: no FAMILY_PASSPHRASE_HASH set. The temporary passphrase is "amma".\n  Run `npm run hash-passphrase` to make a real one.\n');
}

const db = openDb(config.dataDir);
const userId = ensureFamilyUser(db);
recoverInterruptedJobs(db);
const storage = diskStorage(path.join(config.dataDir, 'audio'));
const stt = getSttProvider();
const structurer = getStructurer();
console.log(`Speech-to-text: ${stt.name}${stt.simulated ? ' (SIMULATED)' : ''} | Recipe writing: ${structurer.name}${structurer.simulated ? ' (SIMULATED)' : ''}`);

const api = createApp({ db, storage, stt, structurer, passphraseHash, userId });

const root = new Hono();
root.route('/', api);

// In production the built web app is served from the same address, so cookies stay first-party.
const dist = path.resolve('web/dist');
if (fs.existsSync(dist)) {
  root.use('/*', serveStatic({ root: path.relative(process.cwd(), dist) }));
  root.get('*', serveStatic({ path: path.relative(process.cwd(), path.join(dist, 'index.html')) }));
}

serve({ fetch: root.fetch, port: config.port, hostname: config.production ? '0.0.0.0' : '127.0.0.1' }, (info) => {
  console.log(`${config.appName} server listening on http://localhost:${info.port}`);
});
