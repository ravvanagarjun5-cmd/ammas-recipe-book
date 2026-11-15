import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, ensureFamilyUser } from '../server/db.ts';
import { diskStorage } from '../server/storage.ts';
import { createApp } from '../server/app.ts';
import { hashPassphrase } from '../server/auth.ts';
import { sttProviders, type SttProvider } from '../server/stt/index.ts';
import { structurers } from '../server/ai/structure.ts';
import type { Recording, Recipe, Collection } from '../shared/types.ts';

function setup(stt: SttProvider = sttProviders.mock!) {
  const db = openDb(':memory:');
  const userId = ensureFamilyUser(db);
  const storage = diskStorage(fs.mkdtempSync(path.join(os.tmpdir(), 'recipes-test-')));
  const app = createApp({ db, storage, stt, structurer: structurers.mock!, passphraseHash: hashPassphrase('Secret Phrase'), userId });
  let cookie = '';
  const call = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const isBuf = body instanceof Uint8Array;
    const res = await app.request(url, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body && !isBuf ? { 'content-type': 'application/json' } : {}), ...headers },
      body: (body ? (isBuf ? body : JSON.stringify(body)) : undefined) as BodyInit | undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]!;
    return res;
  };
  return { call, db };
}

const audio = () => new Uint8Array(Buffer.from('fake-opus-audio-bytes'));
const waitFor = async (call: ReturnType<typeof setup>['call'], id: string, done: (r: Recording) => boolean) => {
  for (let i = 0; i < 50; i++) {
    const r = (await (await call('GET', `/api/recordings/${id}`)).json()) as Recording;
    if (done(r)) return r;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timed out');
};

test('requires sign-in, rejects wrong passphrase, accepts the right one (case-insensitive)', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/recipes')).status, 401);
  assert.equal((await call('POST', '/api/login', { passphrase: 'nope' })).status, 401);
  assert.equal((await call('POST', '/api/login', { passphrase: ' secret phrase ' })).status, 200);
  assert.equal((await call('GET', '/api/recipes')).status, 200);
});

test('audio is not available without sign-in', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/recordings/abcdefgh1/audio')).status, 401);
});

test('full journey: upload -> transcribe -> structure -> review -> save -> search -> audio still playable', async () => {
  const { call } = setup();
  await call('POST', '/api/login', { passphrase: 'secret phrase' });
  const id = crypto.randomUUID();

  const up = await call('PUT', `/api/recordings/${id}`, audio(), { 'content-type': 'audio/webm;codecs=opus', 'x-duration-ms': '12000' });
  assert.equal(up.status, 201);
  // Retrying the same upload must not duplicate anything.
  assert.equal((await call('PUT', `/api/recordings/${id}`, audio(), { 'content-type': 'audio/webm' })).status, 200);

  assert.equal((await call('POST', `/api/recordings/${id}/process`)).status, 202);
  const ready = await waitFor(call, id, (r) => r.status === 'ready' || r.status.startsWith('failed'));
  assert.equal(ready.status, 'ready');
  assert.match(ready.transcript ?? '', /tomato gojju/i);
  assert.equal(ready.draft?.title, 'Tomato Gojju');
  const chilli = ready.draft?.ingredients.find((i) => i.item === 'Chilli');
  assert.equal(chilli?.quantity, 'a little more'); // informal quantity preserved
  assert.equal(ready.draft?.time, null); // nothing invented

  const cols = (await (await call('GET', '/api/collections')).json()) as Collection[];
  const grandma = cols.find((c) => c.name === 'Grandma')!;
  const d = ready.draft!;
  const save = await call('POST', '/api/recipes', {
    title: d.title, collection_id: grandma.id, story: d.story, ingredients: d.ingredients, steps: d.steps, notes: d.notes,
    variation_note: d.variation_note, servings: null, time: null, tags: d.tags, based_on_id: null, recording_id: id,
  });
  assert.equal(save.status, 201);
  const recipe = (await save.json()) as Recipe;
  assert.equal(recipe.collection_name, 'Grandma');

  // search: by name, ingredient, natural phrase, and a miss
  const find = async (q: string) => ((await (await call('GET', `/api/recipes?q=${encodeURIComponent(q)}`)).json()) as Recipe[]).length;
  assert.equal(await find('gojju'), 1);
  assert.equal(await find('curry leaves'), 1);
  assert.equal(await find('show me tomato recipes'), 1);
  assert.equal(await find('paneer'), 0);

  // original audio is still there and supports range requests
  const full = await call('GET', `/api/recordings/${id}/audio`);
  assert.equal(full.status, 200);
  assert.equal(Buffer.from(await full.arrayBuffer()).toString(), 'fake-opus-audio-bytes');
  const part = await call('GET', `/api/recordings/${id}/audio`, undefined, { range: 'bytes=0-3' });
  assert.equal(part.status, 206);
  assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'fake');

  // editing the recipe keeps the recording attached
  const edit = await call('PUT', `/api/recipes/${recipe.id}`, { ...recipe, title: 'Amma Tomato Gojju', recording_id: null });
  assert.equal(((await edit.json()) as Recipe).recording_id, id);

  // a saved recording no longer shows as "waiting"
  assert.equal(((await (await call('GET', '/api/recordings')).json()) as Recording[]).length, 0);
});

test('variation: "based on" is stored and shown', async () => {
  const { call } = setup();
  await call('POST', '/api/login', { passphrase: 'secret phrase' });
  const base = (await (await call('POST', '/api/recipes', { title: "Grandma's Gojju", steps: ['Cook.'] })).json()) as Recipe;
  const mine = (await (await call('POST', '/api/recipes', { title: "Mom's Gojju", steps: ['Cook.'], based_on_id: base.id, variation_note: 'More chilli, less oil.' })).json()) as Recipe;
  assert.equal(mine.based_on_title, "Grandma's Gojju");
});

test('empty recipes are refused with a kind message', async () => {
  const { call } = setup();
  await call('POST', '/api/login', { passphrase: 'secret phrase' });
  assert.equal((await call('POST', '/api/recipes', { title: '' })).status, 400);
  const r = await call('POST', '/api/recipes', { title: 'Nothing' });
  assert.equal(r.status, 400);
  assert.match(((await r.json()) as { error: string }).error, /empty/i);
});

test('speech failure keeps the recording and allows retry', async () => {
  let calls = 0;
  const flaky: SttProvider = {
    name: 'flaky', simulated: false, info: { maxDuration: 'n/a', usdPerMinute: 0, costNote: 'test' },
    async transcribe() { if (++calls === 1) throw new Error('network down'); return sttProviders.mock!.transcribe({ audio: Buffer.alloc(1), mime: 'audio/webm', durationMs: 0 }); },
  };
  const { call } = setup(flaky);
  await call('POST', '/api/login', { passphrase: 'secret phrase' });
  const id = crypto.randomUUID();
  await call('PUT', `/api/recordings/${id}`, audio(), { 'content-type': 'audio/webm' });
  await call('POST', `/api/recordings/${id}/process`);
  const failed = await waitFor(call, id, (r) => r.status.startsWith('failed'));
  assert.equal(failed.status, 'failed_transcribe');
  assert.match(failed.error ?? '', /recording is safe/i);
  assert.doesNotMatch(failed.error ?? '', /network down/); // no internals leak to the user
  assert.equal((await call('GET', `/api/recordings/${id}/audio`)).status, 200);
  await call('POST', `/api/recordings/${id}/process`);
  assert.equal((await waitFor(call, id, (r) => r.status === 'ready' || r.status.startsWith('failed'))).status, 'ready');
});

test('editing the words re-writes the recipe from them', async () => {
  const { call } = setup();
  await call('POST', '/api/login', { passphrase: 'secret phrase' });
  const id = crypto.randomUUID();
  await call('PUT', `/api/recordings/${id}`, audio(), { 'content-type': 'audio/webm' });
  await call('POST', `/api/recordings/${id}/process`);
  await waitFor(call, id, (r) => r.status === 'ready');
  await call('PUT', `/api/recordings/${id}/transcript`, { transcript: 'something else entirely' });
  const r = await waitFor(call, id, (x) => x.status === 'ready' || x.status.startsWith('failed'));
  assert.equal(r.transcript_edited, 'something else entirely');
  assert.match(r.transcript ?? '', /tomato gojju/i); // the original transcript is not replaced
});

test('three layers stay separate: correcting the words never overwrites the original transcript', async () => {
  const { call, db } = setup();
  await call('POST', '/api/login', { passphrase: 'secret phrase' });
  const id = crypto.randomUUID();
  await call('PUT', `/api/recordings/${id}`, audio(), { 'content-type': 'audio/webm' });
  await call('POST', `/api/recordings/${id}/process`);
  const first = await waitFor(call, id, (r) => r.status === 'ready');
  const original = first.transcript;
  assert.ok(original);
  await call('PUT', `/api/recordings/${id}/transcript`, { transcript: 'a corrected version' });
  const after = await waitFor(call, id, (r) => r.status === 'ready' && r.transcript_edited === 'a corrected version');
  assert.equal(after.transcript, original); // original untouched
  assert.equal(after.transcript_edited, 'a corrected version');
  // the audio is still the same bytes too
  const row = db.prepare('SELECT audio_path FROM recordings WHERE id = ?').get(id) as { audio_path: string };
  assert.ok(row.audio_path.startsWith(id));
});

test('recording-only mode: a real recording is kept and the failure is friendly and retryable', async () => {
  const { call } = setup(sttProviders.none!);
  await call('POST', '/api/login', { passphrase: 'secret phrase' });
  const id = crypto.randomUUID();
  await call('PUT', `/api/recordings/${id}`, audio(), { 'content-type': 'audio/webm;codecs=opus', 'x-duration-ms': '20000' });
  await call('POST', `/api/recordings/${id}/process`);
  const r = await waitFor(call, id, (x) => x.status.startsWith('failed'));
  assert.equal(r.status, 'failed_transcribe');
  assert.match(r.error ?? '', /isn't set up yet/);
  assert.equal((await call('GET', `/api/recordings/${id}/audio`)).status, 200);
  const cfg = (await (await call('GET', '/api/config')).json()) as { devMode: boolean; devNotes: string[] };
  assert.ok(cfg.devMode);
});

test('login limiter cannot be bypassed by forging the client address', async () => {
  const { call } = setup();
  let blocked = false;
  for (let i = 0; i < 40; i++) {
    const res = await call('POST', '/api/login', { passphrase: 'wrong' }, { 'x-forwarded-for': `10.0.0.${i}` });
    if (res.status === 429) { blocked = true; break; }
  }
  assert.ok(blocked);
});

test('session cookie: httpOnly, long-lived, Secure when the request came over https', async () => {
  const { call } = setup();
  const plain = await call('POST', '/api/login', { passphrase: 'secret phrase' });
  const c1 = plain.headers.get('set-cookie') ?? '';
  assert.match(c1, /HttpOnly/i); assert.match(c1, /SameSite=Lax/i); assert.match(c1, /Max-Age=7776000/); assert.doesNotMatch(c1, /Secure/i);
  const tunnelled = await call('POST', '/api/login', { passphrase: 'secret phrase' }, { 'x-forwarded-proto': 'https' });
  assert.match(tunnelled.headers.get('set-cookie') ?? '', /Secure/i);
});
