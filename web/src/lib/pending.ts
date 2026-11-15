// Every voice recording, written to the phone while she speaks. These ARE her saved voices.

export interface PendingRecording {
  id: string;
  mime: string;
  chunks: Blob[];
  durationMs: number;
  /** 'recording' = interrupted mid-way (app closed / phone died); 'stopped' = finished, not yet on the server. */
  state: 'recording' | 'stopped';
  createdAt: number;
  /** What the phone heard her say (may be empty if speech typing was not available). */
  transcript?: string;
}

import { tx, all } from './db.ts';

export const pending = {
  async create(id: string, mime: string) {
    await tx('recordings', 'readwrite', (s) => s.put({ id, mime, chunks: [], durationMs: 0, state: 'recording', createdAt: Date.now() } satisfies PendingRecording));
  },
  async append(id: string, chunk: Blob) {
    const cur = (await tx<PendingRecording>('recordings', 'readonly', (s) => s.get(id))) as PendingRecording | undefined;
    if (!cur) return;
    cur.chunks.push(chunk);
    await tx('recordings', 'readwrite', (s) => s.put(cur));
  },
  async finish(id: string, durationMs: number) {
    const cur = (await tx<PendingRecording>('recordings', 'readonly', (s) => s.get(id))) as PendingRecording | undefined;
    if (!cur) return;
    await tx('recordings', 'readwrite', (s) => s.put({ ...cur, durationMs, state: 'stopped' } satisfies PendingRecording));
  },
  async setTranscript(id: string, transcript: string) {
    const cur = (await tx<PendingRecording>('recordings', 'readonly', (s) => s.get(id))) as PendingRecording | undefined;
    if (cur) await tx('recordings', 'readwrite', (s) => s.put({ ...cur, transcript }));
  },
  async get(id: string): Promise<PendingRecording | undefined> {
    return (await tx<PendingRecording>('recordings', 'readonly', (s) => s.get(id))) as PendingRecording | undefined;
  },
  async list(): Promise<PendingRecording[]> {
    return (await all<PendingRecording>('recordings')).filter((r) => r.chunks.length > 0);
  },
  async remove(id: string) {
    await tx('recordings', 'readwrite', (s) => s.delete(id));
  },
  blob(r: PendingRecording): Blob {
    return new Blob(r.chunks, { type: r.mime });
  },
};
