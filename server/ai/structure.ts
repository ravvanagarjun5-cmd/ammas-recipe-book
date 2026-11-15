import { config, ProviderConfigError } from '../config.ts';
import type { RecipeDraft } from '../../shared/types.ts';
import { emptyDraft, normaliseDraft } from './draft.ts';
import { MOCK_TRANSCRIPT } from '../stt/index.ts';

export class StructureError extends Error {}

export interface Structurer {
  name: string;
  simulated: boolean;
  structure(transcript: string, collectionNames: string[]): Promise<RecipeDraft>;
}

const SYSTEM_PROMPT = `You turn a home cook's spoken recipe into a clean written English recipe card.

The speaker is a mother recording a recipe from memory, in English. The transcript comes from speech recognition, so it may contain misheard or garbled words.

Hard rules:
- NEVER invent anything. If she did not say a quantity, the quantity is null. If she did not give a cooking time, time is null. Do not add ingredients, steps, temperatures or timings she did not mention, even if they are "normal" for the dish.
- Keep informal quantities exactly in spirit and wording: "a little", "one handful", "as required", "until it smells nice", "a little more". Never convert them into grams, spoons or other numbers.
- Keep dish and ingredient names as she said them (e.g. "gojju"); add a short explanation in the ingredient note only if you are confident of it.
- Ingredients: one entry per ingredient, in the order mentioned. "quantity" is only what she said about amount. "note" is for things like "chopped" or "Mom adds more than Grandma".
- Steps: short imperative sentences in the order she described. Only steps she actually described.
- "story" holds personal context and memories (who taught her, festivals, when she cooked it), in simple first-person wording, lightly cleaned up. Null if there is none.
- "notes" holds tips and variations she mentioned. "variation_note" is only for how her version differs from someone else's (for example "Grandma uses less chilli; Mom adds a little more").
- "collection_hint": who the recipe comes from, ONLY if she said it. The speaker is the mother; "my mother", "Amma" or "my grandmother's" all refer to HER mother, which this family calls "Grandma". Choose one of the existing collection names provided if it fits clearly; otherwise null. Never guess.
- "needs_confirmation": every place you are unsure, as {about, question} in plain, kind words a non-technical person can answer in a few seconds. Examples: she said "some masala" without naming it; a word could not be understood; a quantity sounded unclear; the transcript seems cut off; two ingredients are ambiguous. Prefer asking over guessing.
- "title": the dish name as she said it. If she never named it, null.
- "tags": up to 5 short lowercase words useful for searching (main ingredient, dish type).
- Leave arrays empty and fields null when the transcript has nothing for them. If the transcript is not about a recipe at all, return empty fields and one needs_confirmation entry saying so.

Always answer by calling the save_recipe tool.`;

const TOOL = {
  name: 'save_recipe',
  description: 'Record the structured recipe extracted from the transcript.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'collection_hint', 'story', 'ingredients', 'steps', 'notes', 'variation_note', 'servings', 'time', 'tags', 'needs_confirmation'],
    properties: {
      title: { type: ['string', 'null'] },
      collection_hint: { type: ['string', 'null'] },
      story: { type: ['string', 'null'] },
      ingredients: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['item', 'quantity', 'note'],
          properties: { item: { type: 'string' }, quantity: { type: ['string', 'null'] }, note: { type: ['string', 'null'] } },
        },
      },
      steps: { type: 'array', items: { type: 'string' } },
      notes: { type: ['string', 'null'] },
      variation_note: { type: ['string', 'null'] },
      servings: { type: ['string', 'null'] },
      time: { type: ['string', 'null'] },
      tags: { type: 'array', items: { type: 'string' } },
      needs_confirmation: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['about', 'question'], properties: { about: { type: 'string' }, question: { type: 'string' } } },
      },
    },
  },
};

const anthropic: Structurer = {
  name: 'anthropic',
  simulated: false,
  async structure(transcript, collectionNames) {
    if (!config.anthropicKey) throw new ProviderConfigError('ANTHROPIC_API_KEY is not set (LLM_PROVIDER=anthropic).');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{
          role: 'user',
          content: `Existing collection names: ${JSON.stringify(collectionNames)}\n\nTranscript:\n"""\n${transcript}\n"""`,
        }],
      }),
    });
    if (!res.ok) throw new StructureError(`Anthropic request failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
    const block = json.content?.find((b) => b.type === 'tool_use');
    if (!block) throw new StructureError('Anthropic response had no tool_use block.');
    return normaliseDraft(block.input);
  },
};

/** Development only. It reads nothing from the transcript except to recognise the built-in sample. */
const mock: Structurer = {
  name: 'mock',
  simulated: true,
  async structure(transcript) {
    await new Promise((r) => setTimeout(r, 500));
    if (transcript.trim() !== MOCK_TRANSCRIPT) {
      return { ...emptyDraft(), needs_confirmation: [{ about: 'Dev mode', question: 'The simulated AI only understands the built-in sample recipe. Please fill this in by hand.' }] };
    }
    return {
      title: 'Tomato Gojju',
      collection_hint: 'Grandma',
      story: 'I learned this from my mother.',
      ingredients: [
        { item: 'Tomatoes', quantity: 'three', note: null },
        { item: 'Onions', quantity: 'two', note: null },
        { item: 'Mustard', quantity: null, note: null },
        { item: 'Curry leaves', quantity: null, note: null },
        { item: 'Chilli', quantity: 'a little more', note: 'Mom adds a little more than Grandma' },
      ],
      steps: ['Add mustard and curry leaves.', 'Add the tomatoes and onions.', 'Add chilli.', 'Cook everything until soft.'],
      notes: null,
      variation_note: 'Grandma uses less chilli; Mom adds a little more.',
      servings: null, time: null, tags: ['tomato', 'gojju'],
      needs_confirmation: [{ about: 'Order of steps', question: 'You did not say when to add the chilli. Is the order right?' }],
    };
  },
};

/** Recording-only test mode: no AI connected. */
const none: Structurer = {
  name: 'none',
  simulated: false,
  async structure() { throw new ProviderConfigError('No LLM is connected (LLM_PROVIDER=none: recording-only test mode).'); },
};

export const structurers: Record<string, Structurer> = { anthropic, mock, none };

export function getStructurer(name: string = config.llmProvider): Structurer {
  const s = structurers[name];
  if (!s) throw new ProviderConfigError(`Unknown LLM_PROVIDER "${name}". Use one of: ${Object.keys(structurers).join(', ')}.`);
  return s;
}
