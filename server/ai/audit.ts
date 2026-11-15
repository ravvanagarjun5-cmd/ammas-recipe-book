import type { Confirmation, RecipeDraft } from '../../shared/types.ts';

/**
 * A deterministic safety net that runs on EVERY draft, whichever model wrote it.
 * It never deletes anything; when a number in the draft cannot be traced back to the words
 * that were actually spoken, it adds a plain-language question so Mom sees it on the review screen.
 */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, quarter: 0.25, dozen: 12, couple: 2, twice: 2,
};
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };

/** All numeric values mentioned in a piece of text, from digits ("2", "1/2", "½") or number words. */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>();
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/(\d+)\s*\/\s*(\d+)|\d+(?:[.,]\d+)?|[½¼¾]|\p{L}+/gu)) {
    const tok = m[0];
    if (m[1] && m[2]) { if (Number(m[2])) found.add(Number(m[1]) / Number(m[2])); continue; }
    if (/^\d/.test(tok)) { found.add(Number(tok.replace(',', '.'))); continue; }
    if (tok in FRACTIONS) { found.add(FRACTIONS[tok]!); continue; }
    const v = WORD_NUMBERS[tok];
    if (v !== undefined) found.add(v);
  }
  return found;
}

export function auditDraft(transcript: string, draft: RecipeDraft): RecipeDraft {
  const spoken = numbersIn(transcript);
  const flags: Confirmation[] = [];
  const unsupported = (value: string | null): boolean => !!value && [...numbersIn(value)].some((n) => !spoken.has(n));

  const UNIT = /\b(g|gm|grams?|kg|ml|litres?|tsp|tbsp|teaspoons?|tablespoons?|cups?)\b/i;
  const unitSpoken = UNIT.test(transcript);
  for (const ing of draft.ingredients) {
    if (ing.quantity && UNIT.test(ing.quantity) && !unitSpoken) {
      flags.push({ about: `Amount for ${ing.item}`, question: `The recipe says "${ing.quantity}" for ${ing.item}, but I did not hear a measurement like that. You may have said it more loosely. Please check.` });
    } else if (unsupported(ing.quantity)) {
      flags.push({ about: `Amount for ${ing.item}`, question: `The recipe says "${ing.quantity}" for ${ing.item}, but I could not match that number to what you said. Is it right?` });
    }
  }
  if (unsupported(draft.time)) flags.push({ about: 'Cooking time', question: `I wrote "${draft.time}", but I did not hear a cooking time like that. Please check it or clear it.` });
  if (unsupported(draft.servings)) flags.push({ about: 'Servings', question: `I wrote "${draft.servings}" servings, but I did not hear that. Please check it or clear it.` });
  for (const step of draft.steps) {
    const stepNumbers = [...numbersIn(step)].filter((n) => !spoken.has(n));
    if (stepNumbers.length && /\b(minutes?|mins?|hours?|whistles?|degrees?)\b/i.test(step)) {
      flags.push({ about: 'A time in the steps', question: `A step says "${step}", but I did not hear that time. Please check it.` });
    }
  }
  return flags.length ? { ...draft, needs_confirmation: [...draft.needs_confirmation, ...flags] } : draft;
}
