// Usage:
//   npm run compare-stt -- <audio-file> [--duration SECONDS] [--reference corrected.txt]
//                          [--terms "tomato,onion,coriander"] [--providers openai,sarvam]
//
// Sends ONE recording to every speech provider that has a key in .env and writes a side-by-side report to compare-out/.
// The report keeps ingredient names, quantities, instructions, readability, time, cost and duration limits visible together.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.ts';
import { sttProviders } from '../server/stt/index.ts';
import { charErrorRate, estimateCost, termRecall, transcriptStats, wavDurationSec, wordErrorRate } from '../server/stt/metrics.ts';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!file || !fs.existsSync(file)) {
  console.error('Usage: npm run compare-stt -- <audio-file> [--duration SECONDS] [--reference corrected.txt] [--terms "a,b,c"] [--providers openai,sarvam]');
  process.exit(1);
}

const ext = path.extname(file).slice(1).toLowerCase();
const mime = ({ webm: 'audio/webm', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg' } as Record<string, string>)[ext] ?? 'application/octet-stream';
const audio = fs.readFileSync(file);
const durationSec = Number(flag('duration')) || wavDurationSec(audio) || 0;
if (!durationSec) console.warn('! Duration unknown (pass --duration SECONDS). Cost cannot be estimated and Sarvam will use its long-audio path.\n');
const reference = flag('reference') ? fs.readFileSync(flag('reference')!, 'utf8') : null;
const terms = (flag('terms') ?? '').split(',').filter(Boolean);
const wanted = flag('providers')?.split(',');

const keyFor: Record<string, string> = { openai: config.openaiKey, sarvam: config.sarvamKey };
interface Row { name: string; ok: boolean; text: string; error?: string; seconds: number; language: string | null; costUsd: number | null }
const rows: Row[] = [];

for (const [name, provider] of Object.entries(sttProviders)) {
  if (name === 'mock' || name === 'none') continue;
  if (wanted && !wanted.includes(name)) continue;
  if (!keyFor[name]) { console.log(`- ${name}: skipped (no API key in .env)`); continue; }
  process.stdout.write(`- ${name}: transcribing… `);
  const t0 = Date.now();
  try {
    const r = await provider.transcribe({ audio, mime, durationMs: durationSec * 1000 });
    const seconds = (Date.now() - t0) / 1000;
    rows.push({ name, ok: true, text: r.text, seconds, language: r.language, costUsd: estimateCost(durationSec, provider.info.usdPerMinute) });
    console.log(`done in ${seconds.toFixed(1)}s`);
  } catch (e) {
    rows.push({ name, ok: false, text: '', error: e instanceof Error ? e.message : String(e), seconds: (Date.now() - t0) / 1000, language: null, costUsd: null });
    console.log('FAILED');
  }
}
if (rows.length === 0) { console.log('\nNo provider has a key yet. Add OPENAI_API_KEY and/or SARVAM_API_KEY to .env and run again.'); process.exit(0); }

const out: string[] = [];
const P = (s = '') => out.push(s);
P(`# Speech-to-text comparison`);
P(`File: \`${path.basename(file)}\` · duration: ${durationSec ? `${durationSec.toFixed(0)} s` : 'unknown'} · ${new Date().toISOString()}`);
P();
P(`## Summary`);
P(`| | ${rows.map((r) => r.name).join(' | ')} |`);
P(`|---|${rows.map(() => '---').join('|')}|`);
const stats = rows.map((r) => (r.ok ? transcriptStats(r.text) : null));
const line = (label: string, f: (r: Row, s: ReturnType<typeof transcriptStats> | null, i: number) => string) => P(`| ${label} | ${rows.map((r, i) => f(r, stats[i] ?? null, i)).join(' | ')} |`);
line('Result', (r) => (r.ok ? 'ok' : `FAILED: ${r.error?.slice(0, 80)}`));
line('Processing time', (r) => `${r.seconds.toFixed(1)} s`);
line('Cost for this file', (r) => (r.costUsd === null ? 'unknown' : `$${r.costUsd}`));
line('Cost basis', (r) => sttProviders[r.name]!.info.costNote);
line('Maximum audio duration', (r) => sttProviders[r.name]!.info.maxDuration);
line('Language reported', (r) => r.language ?? 'n/a');
line('Words total', (_r, s) => (s ? String(s.wordCount) : '-'));
line('Numbers heard', (_r, s) => (s ? s.numbersHeard.join(', ') || 'none' : '-'));
line('Informal quantities kept', (_r, s) => (s ? s.informalQuantities.join(', ') || 'none' : '-'));
line('Sentences / words per sentence', (_r, s) => (s ? `${s.sentences} / ${s.avgWordsPerSentence}` : '-'));
line('Has punctuation', (_r, s) => (s ? (s.hasPunctuation ? 'yes' : 'NO (hard to read)') : '-'));
if (terms.length) line(`Expected terms found (${terms.length})`, (r) => (r.ok ? `${termRecall(terms, r.text).found.length}/${terms.length}. Missing: ${termRecall(terms, r.text).missing.join(', ') || 'none'}` : '-'));
if (reference) {
  line('Word error rate vs reference (lower = better)', (r) => (r.ok ? `${(wordErrorRate(reference, r.text) * 100).toFixed(0)}%` : '-'));
  line('Character error rate vs reference', (r) => (r.ok ? `${(charErrorRate(reference, r.text) * 100).toFixed(0)}%` : '-'));
}
P();
P(`## Transcripts`);
for (const r of rows) { P(`### ${r.name}`); P(r.ok ? r.text : `FAILED: ${r.error}`); P(); }
P(`## Your judgement (fill in by listening to the recording; the numbers above cannot judge meaning)`);
P(`Score each 1 (bad) to 5 (excellent):`);
P();
P(`| Criterion | ${rows.map((r) => r.name).join(' | ')} |`);
P(`|---|${rows.map(() => '---').join('|')}|`);
for (const c of ['Words correct', 'Ingredient names correct', 'Quantities correct (esp. informal ones)', 'Cooking instructions in the right order', 'Readable as written text']) P(`| ${c} | ${rows.map(() => ' ').join(' | ')} |`);
P();

fs.mkdirSync('compare-out', { recursive: true });
const base = path.join('compare-out', `${path.basename(file, path.extname(file))}-${Date.now()}`);
fs.writeFileSync(`${base}.md`, out.join('\n'));
fs.writeFileSync(`${base}.json`, JSON.stringify({ file: path.basename(file), durationSec, rows, stats }, null, 2));
console.log(`\n${out.slice(0, 22 + rows.length).join('\n')}\n\nFull report: ${base}.md`);
