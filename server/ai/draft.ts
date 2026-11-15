import type { Confirmation, Ingredient, RecipeDraft } from '../../shared/types.ts';

export function emptyDraft(): RecipeDraft {
  return {
    title: null, collection_hint: null, story: null, ingredients: [], steps: [], notes: null,
    variation_note: null, servings: null, time: null, tags: [], needs_confirmation: [],
  };
}

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

/**
 * Turns whatever the model returned into a safe RecipeDraft.
 * Unknown shapes are dropped rather than trusted; missing stays missing.
 */
export function normaliseDraft(raw: unknown): RecipeDraft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  const ingredients: Ingredient[] = list(r.ingredients).flatMap((i) => {
    const o = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>;
    const item = str(o.item);
    return item ? [{ item, quantity: str(o.quantity), note: str(o.note) }] : [];
  });
  const steps = list(r.steps).map(str).filter((s): s is string => s !== null);
  const tags = list(r.tags).map(str).filter((s): s is string => s !== null).map((s) => s.toLowerCase());
  const needs_confirmation: Confirmation[] = list(r.needs_confirmation).flatMap((c) => {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const question = str(o.question);
    return question ? [{ about: str(o.about) ?? '', question }] : [];
  });

  return {
    title: str(r.title), collection_hint: str(r.collection_hint), story: str(r.story), ingredients, steps,
    notes: str(r.notes), variation_note: str(r.variation_note), servings: str(r.servings), time: str(r.time),
    tags, needs_confirmation,
  };
}

/** A draft with nothing useful in it should not become a recipe silently. */
export function isDraftEmpty(d: RecipeDraft): boolean {
  return !d.title && d.ingredients.length === 0 && d.steps.length === 0 && !d.story && !d.notes;
}

const FILLER = new Set(['show', 'me', 'find', 'recipe', 'recipes', 'with', 'the', 'a', 'an', 'i', 'my', 'made', 'for', 'of', 'and', 'some', 'recently', 'using']);

/** Natural phrases like "show me potato recipes" become the useful words: ["potato"]. */
export function searchTokens(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((t) => t && !FILLER.has(t));
}

/** One lowercase blob per recipe that search runs against. */
export function buildSearchText(p: {
  title: string; collection_name?: string | null; ingredients: Ingredient[]; tags: string[]; story?: string | null; notes?: string | null; transcript?: string | null;
}): string {
  return [p.title, p.collection_name, ...p.ingredients.map((i) => i.item), ...p.tags, p.story, p.notes, p.transcript]
    .filter(Boolean).join(' ').toLowerCase();
}
