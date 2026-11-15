import type { DB } from './db.ts';
import type { AudioStorage } from './storage.ts';
import type { SttProvider } from './stt/index.ts';
import type { Structurer } from './ai/structure.ts';
import { isDraftEmpty } from './ai/draft.ts';
import { auditDraft } from './ai/audit.ts';
import { ProviderConfigError } from './config.ts';

export interface Pipeline {
  db: DB;
  storage: AudioStorage;
  stt: SttProvider;
  structurer: Structurer;
}

const FRIENDLY = {
  transcribe: "I couldn't turn the recording into words this time. Your recording is safe. Please try again.",
  structure: "I couldn't write the recipe out this time. Your recording and its words are safe. Please try again.",
  setup: "This part of the app isn't set up yet. Your recording is safe. Please ask the person who set up the app.",
  empty: "I couldn't find a recipe in what was said. Your recording is safe. You can try again or write the recipe yourself.",
};

function fail(db: DB, id: string, status: 'failed_transcribe' | 'failed_structure', message: string) {
  db.prepare('UPDATE recordings SET status = ?, error = ? WHERE id = ?').run(status, message, id);
}

function friendlyFor(e: unknown, fallback: string): string {
  return e instanceof ProviderConfigError ? FRIENDLY.setup : fallback;
}

function collectionNames(db: DB, userId: string): string[] {
  return (db.prepare('SELECT name FROM collections WHERE user_id = ? ORDER BY sort, name').all(userId) as { name: string }[]).map((c) => c.name);
}

/** Step 2: words -> recipe draft. Safe to re-run with edited words. Never touches the audio. */
export async function runStructure(p: Pipeline, recordingId: string, userId: string): Promise<void> {
  const row = p.db.prepare('SELECT COALESCE(transcript_edited, transcript) AS words FROM recordings WHERE id = ? AND user_id = ?').get(recordingId, userId) as { words: string | null } | undefined;
  if (!row?.words?.trim()) return fail(p.db, recordingId, 'failed_structure', FRIENDLY.empty);
  p.db.prepare("UPDATE recordings SET status = 'structuring', error = NULL WHERE id = ?").run(recordingId);
  try {
    const draft = auditDraft(row.words, await p.structurer.structure(row.words, collectionNames(p.db, userId)));
    if (isDraftEmpty(draft) && draft.needs_confirmation.length === 0) return fail(p.db, recordingId, 'failed_structure', FRIENDLY.empty);
    p.db.prepare("UPDATE recordings SET status = 'ready', draft = ?, error = NULL WHERE id = ?").run(JSON.stringify(draft), recordingId);
  } catch (e) {
    console.error(`[structure ${recordingId}]`, e instanceof Error ? e.message : e);
    fail(p.db, recordingId, 'failed_structure', friendlyFor(e, FRIENDLY.structure));
  }
}

/** Step 1 then 2. Each failure is recorded on the recording so the app can offer "Try again". */
export async function runPipeline(p: Pipeline, recordingId: string, userId: string): Promise<void> {
  const row = p.db.prepare('SELECT audio_path, mime, duration_ms, transcript FROM recordings WHERE id = ? AND user_id = ?')
    .get(recordingId, userId) as { audio_path: string; mime: string; duration_ms: number; transcript: string | null } | undefined;
  if (!row) return;

  if (!row.transcript?.trim()) {
    p.db.prepare("UPDATE recordings SET status = 'transcribing', error = NULL WHERE id = ?").run(recordingId);
    try {
      const audio = await p.storage.read(row.audio_path);
      const result = await p.stt.transcribe({ audio, mime: row.mime, durationMs: row.duration_ms });
      if (!result.text.trim()) return fail(p.db, recordingId, 'failed_transcribe', "I couldn't hear any words in the recording. Your recording is safe. You can listen to it, try again, or write the recipe yourself.");
      p.db.prepare('UPDATE recordings SET transcript = ?, stt_provider = ? WHERE id = ?').run(result.text, p.stt.name, recordingId);
    } catch (e) {
      console.error(`[transcribe ${recordingId}]`, e instanceof Error ? e.message : e);
      return fail(p.db, recordingId, 'failed_transcribe', friendlyFor(e, FRIENDLY.transcribe));
    }
  }
  await runStructure(p, recordingId, userId);
}

/** On boot, jobs that were mid-flight when the server stopped become retryable failures. */
export function recoverInterruptedJobs(db: DB) {
  db.prepare("UPDATE recordings SET status = 'failed_transcribe', error = ? WHERE status = 'transcribing'").run(FRIENDLY.transcribe);
  db.prepare("UPDATE recordings SET status = 'failed_structure', error = ? WHERE status = 'structuring'").run(FRIENDLY.structure);
}
