import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type DB = DatabaseSync;

const DEFAULT_COLLECTIONS = ['Grandma', 'Mom', 'Sister', 'YouTube', 'My Experiments'];

export function openDb(dataDir: string): DB {
  const inMemory = dataDir === ':memory:';
  if (!inMemory) fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(inMemory ? ':memory:' : path.join(dataDir, 'recipes.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      audio_path TEXT NOT NULL, mime TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL, transcript TEXT, stt_provider TEXT, draft TEXT,
      error TEXT, recipe_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, collection_id TEXT REFERENCES collections(id),
      story TEXT, ingredients TEXT NOT NULL DEFAULT '[]', steps TEXT NOT NULL DEFAULT '[]',
      notes TEXT, variation_note TEXT, servings TEXT, time TEXT, tags TEXT NOT NULL DEFAULT '[]',
      based_on_id TEXT REFERENCES recipes(id), recording_id TEXT REFERENCES recordings(id),
      search_text TEXT NOT NULL DEFAULT '', deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id, deleted_at, created_at);
  `);
  // Three layers stay separate: audio file, ORIGINAL transcript (from speech-to-text, never overwritten),
  // and the family's corrected words (optional). The structured recipe lives in `recipes`.
  const cols = (db.prepare('PRAGMA table_info(recordings)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('transcript_edited')) db.exec('ALTER TABLE recordings ADD COLUMN transcript_edited TEXT');
  return db;
}

/** The single family user. user_id stays on every table so real accounts can be added later. */
export function ensureFamilyUser(db: DB): string {
  const row = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  if (row) return row.id;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(id, 'Family');
  DEFAULT_COLLECTIONS.forEach((name, i) =>
    db.prepare('INSERT INTO collections (id, user_id, name, sort) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), id, name, i),
  );
  return id;
}
