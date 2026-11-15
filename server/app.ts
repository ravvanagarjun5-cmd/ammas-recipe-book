import crypto from 'node:crypto';
import { Hono } from 'hono';
import { clientKey, isHttps } from './clientip.ts';
import type { DB } from './db.ts';
import { config } from './config.ts';
import { createSession, destroySession, makeLoginLimiter, requireAuth, verifyPassphrase, type AuthEnv } from './auth.ts';
import type { AudioStorage } from './storage.ts';
import { runPipeline, runStructure, type Pipeline } from './pipeline.ts';
import { buildSearchText, searchTokens } from './ai/draft.ts';
import { parseRecipeInput } from '../shared/recipeInput.ts';
import type { AppConfig, Collection, Recipe, RecipeInput, Recording, RecipeDraft } from '../shared/types.ts';

const ID = /^[\w-]{8,64}$/;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

type RecipeRow = {
  id: string; title: string; collection_id: string | null; collection_name: string | null; story: string | null;
  ingredients: string; steps: string; notes: string | null; variation_note: string | null; servings: string | null;
  time: string | null; tags: string; based_on_id: string | null; based_on_title: string | null; recording_id: string | null;
  created_at: string; updated_at: string;
};

const RECIPE_SELECT = `
  SELECT r.*, c.name AS collection_name, b.title AS based_on_title
  FROM recipes r
  LEFT JOIN collections c ON c.id = r.collection_id
  LEFT JOIN recipes b ON b.id = r.based_on_id AND b.deleted_at IS NULL`;

const toRecipe = (r: RecipeRow): Recipe => ({
  id: r.id, title: r.title, collection_id: r.collection_id, collection_name: r.collection_name, story: r.story,
  ingredients: JSON.parse(r.ingredients), steps: JSON.parse(r.steps), notes: r.notes, variation_note: r.variation_note,
  servings: r.servings, time: r.time, tags: JSON.parse(r.tags), based_on_id: r.based_on_title ? r.based_on_id : null,
  based_on_title: r.based_on_title, recording_id: r.recording_id, created_at: r.created_at, updated_at: r.updated_at,
});

type RecordingRow = {
  id: string; status: Recording['status']; duration_ms: number; transcript: string | null; transcript_edited: string | null; stt_provider: string | null;
  draft: string | null; error: string | null; recipe_id: string | null; created_at: string;
};
const toRecording = (r: RecordingRow): Recording => ({
  id: r.id, status: r.status, duration_ms: r.duration_ms, transcript: r.transcript, transcript_edited: r.transcript_edited, stt_provider: r.stt_provider,
  draft: r.draft ? (JSON.parse(r.draft) as RecipeDraft) : null, error: r.error, recipe_id: r.recipe_id, created_at: r.created_at,
});

export interface AppDeps extends Pipeline {
  db: DB;
  storage: AudioStorage;
  passphraseHash: string;
  userId: string;
}

export function createApp(deps: AppDeps) {
  const { db, storage, userId: familyUserId } = deps;
  const app = new Hono<AuthEnv>();
  const auth = requireAuth(db);
  const loginAllowed = makeLoginLimiter();

  // ----- public -----
  app.get('/api/config', (c) => {
    const devNotes: string[] = [];
    if (deps.stt.simulated) devNotes.push('Speech-to-text is simulated.');
    if (deps.structurer.simulated) devNotes.push('Recipe writing is simulated.');
    if (deps.stt.name === 'none' || deps.structurer.name === 'none') devNotes.push('Recording-only test mode: your voice is saved, but it is not turned into words yet.');
    const body: AppConfig = { appName: config.appName, devMode: devNotes.length > 0, devNotes };
    return c.json(body);
  });

  app.post('/api/login', async (c) => {
    if (!loginAllowed(clientKey(c))) return c.json({ error: 'Too many tries. Please wait a minute.' }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { passphrase?: unknown };
    if (typeof body.passphrase !== 'string' || !verifyPassphrase(body.passphrase, deps.passphraseHash)) {
      return c.json({ error: "That isn't the family passphrase. Please try again." }, 401);
    }
    createSession(db, familyUserId, config.production || isHttps(c), c); // Secure cookie whenever the phone is on HTTPS
    return c.json({ ok: true });
  });

  app.post('/api/logout', (c) => { destroySession(db, c); return c.json({ ok: true }); });

  // ----- everything below needs sign-in -----
  app.use('/api/*', async (c, next) => (c.req.path === '/api/config' || c.req.path === '/api/login' || c.req.path === '/api/logout' ? next() : auth(c, next)));

  app.get('/api/me', (c) => c.json({ ok: true }));

  // ----- collections -----
  app.get('/api/collections', (c) => {
    const rows = db.prepare('SELECT id, name FROM collections WHERE user_id = ? ORDER BY sort, name').all(c.get('userId')) as unknown as Collection[];
    return c.json(rows);
  });

  app.post('/api/collections', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = str(body.name);
    if (!name || name.length > 60) return c.json({ error: 'Please type a name.' }, 400);
    const userId = c.get('userId');
    const existing = db.prepare('SELECT id, name FROM collections WHERE user_id = ? AND lower(name) = lower(?)').get(userId, name) as Collection | undefined;
    if (existing) return c.json(existing);
    const id = crypto.randomUUID();
    const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM collections WHERE user_id = ?').get(userId) as { n: number }).n;
    db.prepare('INSERT INTO collections (id, user_id, name, sort) VALUES (?, ?, ?, ?)').run(id, userId, name, sort);
    return c.json({ id, name } satisfies Collection, 201);
  });

  // ----- recordings -----
  // Idempotent: the phone picks the id, so retrying an upload never creates a second copy.
  app.put('/api/recordings/:id', async (c) => {
    const id = c.req.param('id');
    if (!ID.test(id)) return c.json({ error: 'Bad recording id.' }, 400);
    const userId = c.get('userId');
    const existing = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as unknown as (RecordingRow & { user_id: string }) | undefined;
    if (existing) {
      if (existing.user_id !== userId) return c.json({ error: 'Not found.' }, 404);
      return c.json(toRecording(existing));
    }
    const mime = (c.req.header('content-type') ?? 'application/octet-stream').split(';')[0] ?? 'application/octet-stream';
    if (!mime.startsWith('audio/') && !mime.startsWith('video/webm')) return c.json({ error: 'That does not look like audio.' }, 400);
    const audio = Buffer.from(await c.req.arrayBuffer());
    if (audio.length === 0) return c.json({ error: 'The recording was empty.' }, 400);
    if (audio.length > config.maxAudioBytes) return c.json({ error: 'That recording is too long to save.' }, 413);
    const duration = Math.max(0, Math.round(Number(c.req.header('x-duration-ms') ?? 0)) || 0);
    const key = `${id}.${mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'audio'}`;
    await storage.save(key, audio);
    db.prepare("INSERT INTO recordings (id, user_id, audio_path, mime, duration_ms, status) VALUES (?, ?, ?, ?, ?, 'uploaded')").run(id, userId, key, mime, duration);
    return c.json(toRecording(db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as unknown as RecordingRow), 201);
  });

  // Recordings that are not yet a saved recipe: shown on Home as "A recording is waiting".
  app.get('/api/recordings', (c) => {
    const rows = db.prepare("SELECT * FROM recordings WHERE user_id = ? AND status != 'saved' ORDER BY created_at DESC").all(c.get('userId')) as unknown as RecordingRow[];
    return c.json(rows.map(toRecording));
  });

  app.get('/api/recordings/:id', (c) => {
    const row = db.prepare('SELECT * FROM recordings WHERE id = ? AND user_id = ?').get(c.req.param('id'), c.get('userId')) as unknown as RecordingRow | undefined;
    return row ? c.json(toRecording(row)) : c.json({ error: 'Not found.' }, 404);
  });

  app.get('/api/recordings/:id/audio', async (c) => {
    const row = db.prepare('SELECT audio_path, mime FROM recordings WHERE id = ? AND user_id = ?').get(c.req.param('id'), c.get('userId')) as { audio_path: string; mime: string } | undefined;
    if (!row || !(await storage.exists(row.audio_path))) return c.json({ error: 'Not found.' }, 404);
    const size = await storage.size(row.audio_path);
    const headers: Record<string, string> = { 'Content-Type': row.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '');
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      return new Response(storage.stream(row.audio_path, { start, end }), {
        status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
    return new Response(storage.stream(row.audio_path), { headers: { ...headers, 'Content-Length': String(size) } });
  });

  // Start (or retry) transcription + writing. Returns at once; the phone polls GET /api/recordings/:id.
  app.post('/api/recordings/:id/process', (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const row = db.prepare('SELECT status FROM recordings WHERE id = ? AND user_id = ?').get(id, userId) as { status: string } | undefined;
    if (!row) return c.json({ error: 'Not found.' }, 404);
    if (row.status === 'transcribing' || row.status === 'structuring') return c.json({ ok: true, alreadyRunning: true }, 202);
    // Retry from the failed step: if we already have words, only the writing step re-runs.
    void runPipeline(deps, id, userId);
    return c.json({ ok: true }, 202);
  });

  // Mom (or the family) fixed the words; write the recipe again from them.
  app.put('/api/recordings/:id/transcript', async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const body = (await c.req.json().catch(() => ({}))) as { transcript?: unknown };
    const transcript = str(body.transcript);
    if (!transcript) return c.json({ error: 'The words cannot be empty.' }, 400);
    const res = db.prepare('UPDATE recordings SET transcript_edited = ? WHERE id = ? AND user_id = ?').run(transcript, id, userId); // the original transcript is never touched
    if (res.changes === 0) return c.json({ error: 'Not found.' }, 404);
    void runStructure(deps, id, userId);
    return c.json({ ok: true }, 202);
  });

  // ----- recipes -----
  app.get('/api/recipes', (c) => {
    const userId = c.get('userId');
    const tokens = searchTokens(c.req.query('q') ?? '');
    const collection = c.req.query('collection');
    const where = ['r.user_id = ?', 'r.deleted_at IS NULL'];
    const params: (string | number)[] = [userId];
    if (collection) { where.push('r.collection_id = ?'); params.push(collection); }
    for (const t of tokens) { where.push("r.search_text LIKE ? ESCAPE '\\'"); params.push(`%${t.replace(/[\\%_]/g, '\\$&')}%`); }
    const rows = db.prepare(`${RECIPE_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT 200`).all(...params) as unknown as RecipeRow[];
    return c.json(rows.map(toRecipe));
  });

  app.get('/api/recipes/:id', (c) => {
    const row = db.prepare(`${RECIPE_SELECT} WHERE r.id = ? AND r.user_id = ? AND r.deleted_at IS NULL`).get(c.req.param('id'), c.get('userId')) as unknown as RecipeRow | undefined;
    return row ? c.json(toRecipe(row)) : c.json({ error: 'Not found.' }, 404);
  });

  const writeRecipe = (userId: string, id: string, input: RecipeInput, creating: boolean): { error: string } | null => {
    let collectionName: string | null = null;
    if (input.collection_id) {
      const col = db.prepare('SELECT name FROM collections WHERE id = ? AND user_id = ?').get(input.collection_id, userId) as { name: string } | undefined;
      if (!col) return { error: 'That collection does not exist.' };
      collectionName = col.name;
    }
    if (input.based_on_id && !db.prepare('SELECT 1 FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(input.based_on_id, userId)) {
      return { error: 'The recipe this is based on was not found.' };
    }
    if (input.recording_id && !db.prepare('SELECT 1 FROM recordings WHERE id = ? AND user_id = ?').get(input.recording_id, userId)) {
      return { error: 'The recording was not found.' };
    }
    const search = buildSearchText({ ...input, collection_name: collectionName });
    const values = [input.title, input.collection_id, input.story, JSON.stringify(input.ingredients), JSON.stringify(input.steps), input.notes,
      input.variation_note, input.servings, input.time, JSON.stringify(input.tags), input.based_on_id, input.recording_id, search];
    if (creating) {
      db.prepare(`INSERT INTO recipes (title, collection_id, story, ingredients, steps, notes, variation_note, servings, time, tags, based_on_id, recording_id, search_text, id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...values, id, userId);
      if (input.recording_id) db.prepare("UPDATE recordings SET status = 'saved', recipe_id = ? WHERE id = ?").run(id, input.recording_id);
    } else {
      db.prepare(`UPDATE recipes SET title=?, collection_id=?, story=?, ingredients=?, steps=?, notes=?, variation_note=?, servings=?, time=?, tags=?,
        based_on_id=?, recording_id=?, search_text=?, updated_at=datetime('now') WHERE id=? AND user_id=?`).run(...values, id, userId);
    }
    return null;
  };

  app.post('/api/recipes', async (c) => {
    const parsed = parseRecipeInput(await c.req.json().catch(() => null));
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);
    const id = crypto.randomUUID();
    const err = writeRecipe(c.get('userId'), id, parsed.value, true);
    if (err) return c.json(err, 400);
    return c.json(toRecipe(db.prepare(`${RECIPE_SELECT} WHERE r.id = ?`).get(id) as unknown as RecipeRow), 201);
  });

  app.put('/api/recipes/:id', async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    if (!db.prepare('SELECT 1 FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, userId)) return c.json({ error: 'Not found.' }, 404);
    const parsed = parseRecipeInput(await c.req.json().catch(() => null));
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);
    // The original recording stays attached no matter what the editor sends.
    const current = db.prepare('SELECT recording_id FROM recipes WHERE id = ?').get(id) as { recording_id: string | null };
    const err = writeRecipe(userId, id, { ...parsed.value, recording_id: current.recording_id ?? parsed.value.recording_id }, false);
    if (err) return c.json(err, 400);
    return c.json(toRecipe(db.prepare(`${RECIPE_SELECT} WHERE r.id = ?`).get(id) as unknown as RecipeRow));
  });

  // Soft delete. The recording is never deleted.
  app.delete('/api/recipes/:id', (c) => {
    const res = db.prepare("UPDATE recipes SET deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL").run(c.req.param('id'), c.get('userId'));
    return res.changes ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  app.onError((e, c) => {
    console.error('[error]', e instanceof Error ? e.message : e);
    return c.json({ error: 'Something went wrong on our side. Nothing was lost. Please try again.' }, 500);
  });

  return app;
}
