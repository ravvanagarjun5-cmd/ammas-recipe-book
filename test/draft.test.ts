import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseDraft, isDraftEmpty, searchTokens, buildSearchText } from '../server/ai/draft.ts';
import { hashPassphrase, verifyPassphrase } from '../server/auth.ts';

test('normaliseDraft never invents: missing fields stay null, junk is dropped', () => {
  const d = normaliseDraft({ title: ' Palya ', time: '', ingredients: [{ item: 'Onion', quantity: '2' }, { item: '  ' }, 42], steps: ['Fry', '', 7], tags: ['Onion'] });
  assert.equal(d.title, 'Palya');
  assert.equal(d.time, null);
  assert.deepEqual(d.ingredients, [{ item: 'Onion', quantity: '2', note: null }]);
  assert.deepEqual(d.steps, ['Fry']);
  assert.deepEqual(d.tags, ['onion']);
});

test('informal quantities survive untouched', () => {
  const d = normaliseDraft({ ingredients: [{ item: 'Salt', quantity: 'a little', note: null }, { item: 'Coriander', quantity: 'one handful' }] });
  assert.equal(d.ingredients[0]?.quantity, 'a little');
  assert.equal(d.ingredients[1]?.quantity, 'one handful');
});

test('garbage from the model becomes an empty draft', () => {
  assert.ok(isDraftEmpty(normaliseDraft('nonsense')));
  assert.ok(isDraftEmpty(normaliseDraft(null)));
});

test('searchTokens drops filler words', () => {
  assert.deepEqual(searchTokens('Show me paneer recipes'), ['paneer']);
  assert.deepEqual(searchTokens('recipes with potato'), ['potato']);
  assert.deepEqual(searchTokens('Grandma'), ['grandma']);
});

test('search text covers title, source, ingredients', () => {
  const t = buildSearchText({ title: 'Gojju', collection_name: 'Grandma', ingredients: [{ item: 'Tomato', quantity: null, note: null }], tags: [] });
  assert.match(t, /gojju/); assert.match(t, /grandma/); assert.match(t, /tomato/);
});

test('passphrase hashing never stores plaintext and verifies', () => {
  const h = hashPassphrase('Family Secret');
  assert.ok(!h.includes('family'));
  assert.ok(verifyPassphrase('family secret', h));
  assert.ok(!verifyPassphrase('wrong', h));
});
