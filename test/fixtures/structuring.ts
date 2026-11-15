import type { RecipeDraft } from '../../shared/types.ts';
import type { Expectations } from '../../server/ai/evalcheck.ts';

/**
 * A realistic spoken English transcript. Facts in it: no cooking time, no servings, informal amounts
 * ("a little", "one handful"), a story (Amma, festivals) and a variation (Mom adds more chilli than Amma).
 */
export const TRANSCRIPT =
  'Today I made tomato gojju. This is how Amma taught me, she used to make it for festivals. ' +
  'First add oil, then mustard seeds and curry leaves. Then add two onions, chopped, and three tomatoes. ' +
  'Amma used to add less chilli, but I add a little more. Add a little salt. ' +
  'Cook until the tomato becomes soft. At the end, add one handful of coriander leaves.';

/** What a careful model should return. Hand-written; the checks below are what must hold for ANY model's output. */
export const GOLDEN_DRAFT: RecipeDraft = {
  title: 'Tomato Gojju',
  collection_hint: 'Grandma',
  story: 'Amma taught me this. She used to make it for festivals.',
  ingredients: [
    { item: 'Oil', quantity: null, note: null },
    { item: 'Mustard seeds', quantity: null, note: null },
    { item: 'Curry leaves', quantity: null, note: null },
    { item: 'Onions', quantity: 'two', note: 'chopped' },
    { item: 'Tomatoes', quantity: 'three', note: null },
    { item: 'Chilli', quantity: 'a little more', note: 'Amma uses less; I add a little more' },
    { item: 'Salt', quantity: 'a little', note: null },
    { item: 'Coriander leaves', quantity: 'one handful', note: null },
  ],
  steps: [
    'Heat the oil. Add mustard seeds and curry leaves.',
    'Add the chopped onions and tomatoes.',
    'Add chilli and a little salt.',
    'Cook until the tomato becomes soft.',
    'Finish with a handful of coriander leaves.',
  ],
  notes: null,
  variation_note: 'Amma uses less chilli; I add a little more.',
  servings: null,
  time: null,
  tags: ['tomato', 'gojju'],
  needs_confirmation: [],
};

export const EXPECTATIONS: Expectations = {
  noTime: true,
  noServings: true,
  ingredients: [
    { item: /tomato/i, quantity: /three|3/i },
    { item: /onion/i, quantity: /two|2/i },
    { item: /chilli|chili/i, quantity: /little|more/i },
    { item: /salt/i, quantity: /little/i },
    { item: /coriander/i, quantity: /handful/i },
    { item: /oil/i, quantity: null },
    { item: /mustard/i, quantity: null },
    { item: /curry leaves/i, quantity: null },
  ],
  storyMatches: /festival|taught|Amma/i,
  variationMatches: /chilli/i,
  minSteps: 3,
};

/** Drafts that break one rule each. The checker must catch every one. */
export const BAD_DRAFTS: { name: string; draft: RecipeDraft; expectFailure: RegExp }[] = [
  { name: 'invented cooking time', draft: { ...GOLDEN_DRAFT, time: '15 minutes' }, expectFailure: /cooking time/ },
  { name: 'invented servings', draft: { ...GOLDEN_DRAFT, servings: '4' }, expectFailure: /servings/ },
  {
    name: 'informal "a little" turned into a measurement',
    draft: { ...GOLDEN_DRAFT, ingredients: GOLDEN_DRAFT.ingredients.map((i) => (i.item === 'Salt' ? { ...i, quantity: '1 tsp' } : i)) },
    expectFailure: /invented quantity|measurement/,
  },
  {
    name: 'quantity invented where none was spoken',
    draft: { ...GOLDEN_DRAFT, ingredients: GOLDEN_DRAFT.ingredients.map((i) => (i.item === 'Oil' ? { ...i, quantity: '2 tablespoons' } : i)) },
    expectFailure: /Oil/,
  },
  { name: 'story dropped', draft: { ...GOLDEN_DRAFT, story: null }, expectFailure: /story/ },
  { name: 'variation dropped', draft: { ...GOLDEN_DRAFT, variation_note: null, ingredients: GOLDEN_DRAFT.ingredients.map((i) => ({ ...i, note: null })) }, expectFailure: /variation/ },
  { name: 'missing ingredient', draft: { ...GOLDEN_DRAFT, ingredients: GOLDEN_DRAFT.ingredients.filter((i) => i.item !== 'Onions') }, expectFailure: /onion/i },
  {
    name: 'ingredient list pasted as a step',
    draft: { ...GOLDEN_DRAFT, steps: ['Oil, mustard, curry leaves, onions, tomatoes, chilli, salt, coriander'] },
    expectFailure: /ingredient list|steps/,
  },
];
