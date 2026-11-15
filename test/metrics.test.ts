import { test } from 'node:test';
import assert from 'node:assert/strict';
import { charErrorRate, estimateCost, termRecall, transcriptStats, wavDurationSec, wordErrorRate } from '../server/stt/metrics.ts';
import { TRANSCRIPT } from './fixtures/structuring.ts';

test('fixture: numbers, informal quantities and readability are detected', () => {
  const s = transcriptStats(TRANSCRIPT);
  assert.deepEqual(s.numbersHeard, [1, 2, 3]);
  for (const q of ['a little', 'little more', 'handful']) assert.ok(s.informalQuantities.includes(q), q);
  assert.ok(s.hasPunctuation);
  assert.ok(s.sentences >= 6);
});

test('word and character error rates', () => {
  assert.equal(wordErrorRate('two onions and tomato', 'two onions and tomato'), 0);
  assert.equal(wordErrorRate('two onions and tomato', 'two onion and tomato'), 0.25);
  assert.ok(charErrorRate('tomatoes', 'tomatos') < 0.15); // a spelling variant costs little at character level
  assert.equal(wordErrorRate('', 'anything'), 0);
});

test('term recall finds ingredient names in any spelling you list', () => {
  const r = termRecall(['onions', 'tomato', 'paneer'], TRANSCRIPT);
  assert.deepEqual(r.found, ['onions', 'tomato']);
  assert.deepEqual(r.missing, ['paneer']);
});

test('cost estimate', () => {
  assert.equal(estimateCost(180, 0.006), 0.018);
  assert.equal(estimateCost(60, null), null);
});

test('wav duration is read from the header; other formats return null', () => {
  const h = Buffer.alloc(44 + 16000 * 2);
  h.write('RIFF', 0, 'ascii'); h.write('WAVE', 8, 'ascii'); h.write('data', 36, 'ascii');
  h.writeUInt32LE(32000, 28); h.writeUInt32LE(32000, 40);
  assert.equal(wavDurationSec(h), 1);
  assert.equal(wavDurationSec(Buffer.from('not a wav file at all, definitely not')), null);
});
