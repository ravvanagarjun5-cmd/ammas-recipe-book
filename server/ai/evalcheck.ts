import type { RecipeDraft } from '../../shared/types.ts';
import { numbersIn } from './audit.ts';

/** What a good draft for a given transcript must (and must not) contain. Used by unit tests and by `npm run eval-structure`. */
export interface Expectations {
  /** The transcript contains no cooking time / servings, so these must stay empty. */
  noTime: boolean;
  noServings: boolean;
  /** Ingredient name patterns that must exist, optionally with the exact informal quantity that must survive. */
  ingredients: { item: RegExp; quantity?: RegExp | null }[];
  /** Phrases (any field) proving the story / variation were kept. */
  storyMatches: RegExp;
  variationMatches: RegExp;
  minSteps: number;
}

/** Returns a list of human-readable failures; empty means the draft passes. */
export function checkDraft(draft: RecipeDraft, transcript: string, exp: Expectations): string[] {
  const fails: string[] = [];
  const spoken = numbersIn(transcript);

  if (exp.noTime && draft.time) fails.push(`invented a cooking time: "${draft.time}"`);
  if (exp.noServings && draft.servings) fails.push(`invented servings: "${draft.servings}"`);

  for (const ing of draft.ingredients) {
    for (const n of numbersIn(ing.quantity ?? '')) if (!spoken.has(n)) fails.push(`invented quantity for ${ing.item}: "${ing.quantity}"`);
    if (/\b(g|gm|grams?|kg|ml|tsp|tbsp|teaspoons?|tablespoons?|cups?)\b/i.test(ing.quantity ?? '') && !/\b(g|gm|grams?|kg|ml|tsp|tbsp|teaspoons?|tablespoons?|cups?)\b/i.test(transcript)) {
      fails.push(`converted an informal quantity into a measurement for ${ing.item}: "${ing.quantity}"`);
    }
  }
  for (const want of exp.ingredients) {
    const hit = draft.ingredients.find((i) => want.item.test(i.item));
    if (!hit) { fails.push(`missing ingredient ${want.item}`); continue; }
    if (want.quantity === null && hit.quantity) fails.push(`${hit.item} should have no quantity but has "${hit.quantity}"`);
    if (want.quantity instanceof RegExp && !want.quantity.test(hit.quantity ?? '')) fails.push(`${hit.item} quantity "${hit.quantity ?? ''}" lost its informal wording`);
  }

  const variationText = [draft.variation_note, draft.notes, ...draft.ingredients.map((i) => i.note)].filter(Boolean).join(' ');
  if (!exp.storyMatches.test(`${draft.story ?? ''} ${draft.notes ?? ''}`)) fails.push('story / memory was not preserved');
  if (!exp.variationMatches.test(variationText)) fails.push('variation information was not preserved');
  if (draft.steps.length < exp.minSteps) fails.push(`expected at least ${exp.minSteps} steps, got ${draft.steps.length}`);

  // ingredients and steps must be separate: a step should not just be an ingredient list
  const listLike = draft.steps.filter((s) => (s.match(/,/g) ?? []).length >= 4 && !/\b(add|heat|cook|stir|fry|mix)\b/i.test(s));
  if (listLike.length) fails.push('a step looks like an ingredient list');
  return fails;
}
