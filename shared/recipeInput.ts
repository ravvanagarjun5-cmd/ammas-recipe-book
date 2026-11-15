import type { Ingredient, RecipeInput } from './types.ts';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Validates what the editor sends. Returns an error message Mom can read, or the clean input. */
export function parseRecipeInput(body: unknown): { error: string } | { value: RecipeInput } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const title = str(b.title);
  if (!title) return { error: 'Please give the recipe a name.' };
  const ingredients: Ingredient[] = (Array.isArray(b.ingredients) ? b.ingredients : []).flatMap((i) => {
    const o = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>;
    const item = str(o.item);
    return item ? [{ item, quantity: str(o.quantity), note: str(o.note) }] : [];
  });
  const steps = (Array.isArray(b.steps) ? b.steps : []).map(str).filter((s): s is string => s !== null);
  const tags = (Array.isArray(b.tags) ? b.tags : []).map(str).filter((s): s is string => s !== null);
  const value: RecipeInput = {
    title, collection_id: str(b.collection_id), story: str(b.story), ingredients, steps, notes: str(b.notes),
    variation_note: str(b.variation_note), servings: str(b.servings), time: str(b.time), tags,
    based_on_id: str(b.based_on_id), recording_id: str(b.recording_id),
  };
  if (!ingredients.length && !steps.length && !value.story && !value.notes) {
    return { error: 'This recipe is empty. Please add at least an ingredient, a step or a story.' };
  }
  return { value };
}
