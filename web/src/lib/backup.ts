import { all, put } from './db.ts';
import type { PendingRecording } from './pending.ts';

// One file with everything: recipes, collections and the voice recordings. The only copy of the data is on the phone,
// so this file (sent to WhatsApp / Drive / email) is her safety net.
const toBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res((r.result as string).split(',')[1] ?? '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});
const fromBase64 = async (data: string, mime: string) => (await fetch(`data:${mime};base64,${data}`)).blob();

export async function makeBackup(): Promise<File> {
  const voices = await Promise.all((await all<PendingRecording>('recordings')).filter((v) => v.chunks.length).map(async (v) => ({
    id: v.id, mime: v.mime, durationMs: v.durationMs, createdAt: v.createdAt, data: await toBase64(new Blob(v.chunks, { type: v.mime })),
  })));
  const body = JSON.stringify({ format: 'recipe-book-backup', version: 1, collections: await all('collections'), recipes: await all('recipes'), voices });
  return new File([body], `recipe-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
}

/** Shares the file (WhatsApp, Drive...) where the phone supports it, otherwise downloads it. */
export async function saveBackup() {
  const file = await makeBackup();
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'My recipe backup' }); return; } catch (e) { if ((e as DOMException).name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  URL.revokeObjectURL(a.href);
}

export async function restoreBackup(file: File): Promise<number> {
  const b = JSON.parse(await file.text());
  if (b?.format !== 'recipe-book-backup') throw new Error('That is not a recipe backup file.');
  // Collections match by name, so restoring never creates a second "Grandma".
  const local = await all<{ id: string; name: string }>('collections');
  const idMap = new Map<string, string>();
  for (const c of b.collections ?? []) {
    const same = local.find((l) => l.name.toLowerCase() === String(c.name).toLowerCase());
    if (same) idMap.set(c.id, same.id); else await put('collections', c);
  }
  for (const r of b.recipes ?? []) await put('recipes', { ...r, collection_id: idMap.get(r.collection_id) ?? r.collection_id });
  for (const v of b.voices ?? []) {
    await put('recordings', { id: v.id, mime: v.mime, durationMs: v.durationMs, createdAt: v.createdAt, state: 'stopped', chunks: [await fromBase64(v.data, v.mime)] } satisfies PendingRecording);
  }
  return (b.recipes ?? []).filter((r: { deleted_at?: string }) => !r.deleted_at).length;
}
