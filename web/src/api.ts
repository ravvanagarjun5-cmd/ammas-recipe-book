import type { Collection, Recipe, RecipeInput } from '../../shared/types.ts';
import { parseRecipeInput } from '../../shared/recipeInput.ts';
import { buildSearchText, searchTokens } from '../../server/ai/draft.ts';
import { all, put, tx } from './lib/db.ts';

// Everything is stored on this phone. No server, no account, no internet needed.
const DEFAULT_COLLECTIONS = ['Grandma', 'Mom', 'Sister', 'YouTube', 'My Experiments'];

interface Stored extends Omit<Recipe, 'collection_name' | 'based_on_title'> { search_text: string; deleted_at: string | null }
interface StoredCollection extends Collection { sort: number }

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' '); // same shape the screens already parse

async function collections(): Promise<StoredCollection[]> {
  let list = await all<StoredCollection>('collections');
  if (list.length === 0) {
    list = DEFAULT_COLLECTIONS.map((name, sort) => ({ id: crypto.randomUUID(), name, sort }));
    await Promise.all(list.map((c) => put('collections', c)));
  }
  return list.sort((a, b) => a.sort - b.sort);
}

async function hydrate(rows: Stored[]): Promise<Recipe[]> {
  const live = new Map((await all<Stored>('recipes')).filter((r) => !r.deleted_at).map((r) => [r.id, r.title]));
  const names = new Map((await collections()).map((c) => [c.id, c.name]));
  return rows.map(({ search_text: _s, deleted_at: _d, ...r }) => ({
    ...r,
    collection_name: r.collection_id ? names.get(r.collection_id) ?? null : null,
    based_on_title: r.based_on_id ? live.get(r.based_on_id) ?? null : null,
    based_on_id: r.based_on_id && live.has(r.based_on_id) ? r.based_on_id : null,
  }));
}

async function save(id: string, body: RecipeInput, existing?: Stored): Promise<Recipe> {
  const names = new Map((await collections()).map((c) => [c.id, c.name]));
  const row: Stored = {
    ...body, id, created_at: existing?.created_at ?? now(), updated_at: now(), deleted_at: null,
    recording_id: existing?.recording_id ?? body.recording_id, // the voice stays attached no matter what the editor sends
    search_text: buildSearchText({ ...body, collection_name: body.collection_id ? names.get(body.collection_id) : null }),
  };
  await put('recipes', row);
  return (await hydrate([row]))[0]!;
}

function parse(body: RecipeInput): RecipeInput {
  const parsed = parseRecipeInput(body);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.value;
}

export const api = {
  collections: async (): Promise<Collection[]> => (await collections()).map(({ id, name }) => ({ id, name })),
  addCollection: async (name: string): Promise<Collection> => {
    const list = await collections();
    const found = list.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (found) return { id: found.id, name: found.name };
    const c = { id: crypto.randomUUID(), name: name.trim(), sort: list.length };
    await put('collections', c);
    return { id: c.id, name: c.name };
  },

  recipes: async (opts: { q?: string; collection?: string } = {}): Promise<Recipe[]> => {
    const tokens = searchTokens(opts.q ?? '');
    const rows = (await all<Stored>('recipes'))
      .filter((r) => !r.deleted_at && (!opts.collection || r.collection_id === opts.collection) && tokens.every((t) => r.search_text.includes(t)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return hydrate(rows);
  },
  recipe: async (id: string): Promise<Recipe> => {
    const row = await tx<Stored>('recipes', 'readonly', (s) => s.get(id));
    if (!row || row.deleted_at) throw new Error('I could not find that recipe.');
    return (await hydrate([row]))[0]!;
  },
  createRecipe: (input: RecipeInput) => save(crypto.randomUUID(), parse(input)),
  updateRecipe: async (id: string, input: RecipeInput) => save(id, parse(input), await tx<Stored>('recipes', 'readonly', (s) => s.get(id))),
  // Removing a recipe hides it; the voice recording is never deleted.
  deleteRecipe: async (id: string) => {
    const row = await tx<Stored>('recipes', 'readonly', (s) => s.get(id));
    if (row) await put('recipes', { ...row, deleted_at: now() });
    return { ok: true as const };
  },
  /** Voice recordings that belong to a recipe (including removed ones), so Home only offers unfinished ones. */
  attachedRecordingIds: async (): Promise<Set<string>> => new Set((await all<Stored>('recipes')).map((r) => r.recording_id).filter((x): x is string => !!x)),
};
