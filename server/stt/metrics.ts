import { numbersIn } from '../ai/audit.ts';

/** Pure helpers for judging a transcript. Used by `npm run compare-stt`; unit-tested without any API. */

export const words = (text: string): string[] => text.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);

/** Informal-quantity phrases that must be preserved, not converted. */
const INFORMAL = ['a little', 'little more', 'handful', 'as required', 'to taste', 'a pinch', 'some'];

export interface TranscriptStats {
  wordCount: number;
  /** Distinct numbers heard (digits or number words). */
  numbersHeard: number[];
  informalQuantities: string[];
  sentences: number;
  avgWordsPerSentence: number;
  hasPunctuation: boolean;
}

export function transcriptStats(text: string): TranscriptStats {
  const ws = words(text);
  const lower = text.toLowerCase();
  const sentences = Math.max(1, (text.match(/[.!?।]+(\s|$)/g) ?? []).length);
  return {
    wordCount: ws.length,
    numbersHeard: [...numbersIn(text)].sort((a, b) => a - b),
    informalQuantities: INFORMAL.filter((p) => lower.includes(p)),
    sentences, avgWordsPerSentence: Math.round((ws.length / sentences) * 10) / 10,
    hasPunctuation: /[.,!?।]/.test(text),
  };
}

const norm = (t: string) => words(t.toLowerCase().normalize('NFC'));

function editDistance<T>(a: T[], b: T[]): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Word error rate against a hand-corrected reference. 0 = perfect. Can exceed 1. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const r = norm(reference);
  return r.length ? editDistance(r, norm(hypothesis)) / r.length : 0;
}

/** Character error rate: friendlier than WER when only spelling differs. */
export function charErrorRate(reference: string, hypothesis: string): number {
  const r = [...norm(reference).join(' ')];
  return r.length ? editDistance(r, [...norm(hypothesis).join(' ')]) / r.length : 0;
}

/** Which of the expected terms (ingredient names etc., any language/spelling you list) appear in the transcript. */
export function termRecall(terms: string[], transcript: string): { found: string[]; missing: string[] } {
  const hay = transcript.toLowerCase().normalize('NFC');
  const found: string[] = [], missing: string[] = [];
  for (const t of terms.map((x) => x.trim()).filter(Boolean)) (hay.includes(t.toLowerCase().normalize('NFC')) ? found : missing).push(t);
  return { found, missing };
}

export function estimateCost(durationSec: number, usdPerMinute: number | null): number | null {
  return usdPerMinute === null ? null : Math.round((durationSec / 60) * usdPerMinute * 10000) / 10000;
}

/** Duration of a PCM .wav file, if that is what we were given. Other formats need --duration. */
export function wavDurationSec(buf: Buffer): number | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  const byteRate = buf.readUInt32LE(28);
  const dataAt = buf.indexOf('data', 12, 'ascii');
  if (!byteRate || dataAt < 0) return null;
  return buf.readUInt32LE(dataAt + 4) / byteRate;
}
