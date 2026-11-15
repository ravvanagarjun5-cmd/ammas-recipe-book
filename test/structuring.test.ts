import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDraft, numbersIn } from '../server/ai/audit.ts';
import { checkDraft } from '../server/ai/evalcheck.ts';
import { normaliseDraft } from '../server/ai/draft.ts';
import { BAD_DRAFTS, EXPECTATIONS, GOLDEN_DRAFT, TRANSCRIPT } from './fixtures/structuring.ts';

test('the golden draft for the fixture passes every check', () => {
  assert.deepEqual(checkDraft(GOLDEN_DRAFT, TRANSCRIPT, EXPECTATIONS), []);
});

test('the golden draft survives normalisation unchanged (nothing is lost or invented by our own code)', () => {
  const n = normaliseDraft(JSON.parse(JSON.stringify(GOLDEN_DRAFT)));
  assert.deepEqual(n, GOLDEN_DRAFT);
  assert.deepEqual(checkDraft(n, TRANSCRIPT, EXPECTATIONS), []);
});

for (const bad of BAD_DRAFTS) {
  test(`checker catches: ${bad.name}`, () => {
    const fails = checkDraft(bad.draft, TRANSCRIPT, EXPECTATIONS);
    assert.ok(fails.some((f) => bad.expectFailure.test(f)), `expected a failure matching ${bad.expectFailure}, got: ${JSON.stringify(fails)}`);
  });
}

test('audit adds review questions for invented numbers, without deleting anything', () => {
  const bad = { ...GOLDEN_DRAFT, time: '15 minutes', ingredients: GOLDEN_DRAFT.ingredients.map((i) => (i.item === 'Salt' ? { ...i, quantity: '2 tsp' } : i)) };
  const out = auditDraft(TRANSCRIPT, bad);
  assert.equal(out.time, '15 minutes'); // still there; Mom decides
  assert.ok(out.needs_confirmation.some((c) => /Cooking time/.test(c.about)));
  assert.ok(out.needs_confirmation.some((c) => /Salt/.test(c.about)));
});

test('audit leaves a faithful draft alone', () => {
  assert.deepEqual(auditDraft(TRANSCRIPT, GOLDEN_DRAFT).needs_confirmation, []);
});

test('fractions and mixed forms are understood', () => {
  const s = numbersIn('half a cup, 1/4 spoon, ½ kg, 2-3 chillies');
  for (const n of [0.5, 0.25, 2, 3]) assert.ok(s.has(n), String(n));
});
