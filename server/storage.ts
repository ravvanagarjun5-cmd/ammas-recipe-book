import fs from 'node:fs';
import path from 'node:path';

/**
 * Where audio bytes live. Today: a folder on the server's disk.
 * To move to S3/R2 later, implement this interface and swap it in index.ts; nothing else changes.
 * Audio is only ever served through an authenticated route, never from a public path.
 */
export interface AudioStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  size(key: string): Promise<number>;
  stream(key: string, range?: { start: number; end: number }): ReadableStream<Uint8Array>;
  exists(key: string): Promise<boolean>;
}

export function diskStorage(dir: string): AudioStorage {
  fs.mkdirSync(dir, { recursive: true });
  const file = (key: string) => {
    if (!/^[\w.-]+$/.test(key)) throw new Error('Invalid storage key');
    return path.join(dir, key);
  };
  return {
    async save(key, data) {
      // Write-then-rename so a crash never leaves a half-written recording under the final name.
      const final = file(key);
      const tmp = `${final}.tmp`;
      await fs.promises.writeFile(tmp, data);
      await fs.promises.rename(tmp, final);
    },
    read: (key) => fs.promises.readFile(file(key)),
    size: async (key) => (await fs.promises.stat(file(key))).size,
    exists: async (key) => fs.existsSync(file(key)),
    stream(key, range) {
      const node = fs.createReadStream(file(key), range);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          node.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
          node.on('end', () => controller.close());
          node.on('error', (e) => controller.error(e));
        },
        cancel() { node.destroy(); },
      });
    },
  };
}
