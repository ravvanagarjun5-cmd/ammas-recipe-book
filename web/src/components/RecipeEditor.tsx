import { useState } from 'react';
import type { Collection, Confirmation, Ingredient, Recipe, RecipeInput } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { ErrorBox, useLoad } from './ui.tsx';

export interface EditorInitial {
  title: string;
  collection_id: string | null;
  collectionNote?: string;
  story: string;
  ingredients: Ingredient[];
  steps: string[];
  notes: string;
  transcript: string;
  variation_note: string;
  servings: string;
  time: string;
  tags: string[];
  based_on_id: string | null;
  recording_id: string | null;
  confirmations: Confirmation[];
}

export function initialFromRecipe(r: Recipe): EditorInitial {
  return {
    title: r.title, collection_id: r.collection_id, story: r.story ?? '', ingredients: r.ingredients, steps: r.steps,
    notes: r.notes ?? '', transcript: r.transcript ?? '', variation_note: r.variation_note ?? '', servings: r.servings ?? '', time: r.time ?? '', tags: r.tags,
    based_on_id: r.based_on_id, recording_id: r.recording_id, confirmations: [],
  };
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

interface Props {
  initial: EditorInitial;
  collections: Collection[];
  saveLabel?: string;
  /** Recipe being edited; hidden from the "based on" list. */
  selfId?: string;
  onCollectionAdded: (c: Collection) => void;
  onSave: (input: RecipeInput) => Promise<void>;
  onCancel: () => void;
  cancelLabel?: string;
}

export function RecipeEditor({ initial, collections, saveLabel = 'Save recipe', selfId, onCollectionAdded, onSave, onCancel, cancelLabel = 'Not now' }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [collectionId, setCollectionId] = useState(initial.collection_id);
  const [story, setStory] = useState(initial.story);
  const [ingredients, setIngredients] = useState<Ingredient[]>(initial.ingredients.length ? initial.ingredients : [{ item: '', quantity: null, note: null }]);
  const [steps, setSteps] = useState<string[]>(initial.steps.length ? initial.steps : ['']);
  const [notes, setNotes] = useState(initial.notes);
  const [transcript, setTranscript] = useState(initial.transcript);
  const [variation, setVariation] = useState(initial.variation_note);
  const [basedOn, setBasedOn] = useState(initial.based_on_id);
  const [confirmations, setConfirmations] = useState(initial.confirmations);
  const [newCollection, setNewCollection] = useState('');
  const [addingCollection, setAddingCollection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const others = useLoad(() => api.recipes(), []);

  const addCollection = async () => {
    if (!newCollection.trim()) return;
    try {
      const c = await api.addCollection(newCollection.trim());
      onCollectionAdded(c);
      setCollectionId(c.id);
      setNewCollection(''); setAddingCollection(false);
    } catch (e) { setError((e as Error).message); }
  };

  const submit = async () => {
    setError('');
    setSaving(true);
    try {
      await onSave({
        title: title.trim(), collection_id: collectionId, story: orNull(story),
        ingredients: ingredients.filter((i) => i.item.trim()),
        steps: steps.filter((s) => s.trim()), notes: orNull(notes), variation_note: orNull(variation),
        servings: orNull(initial.servings), time: orNull(initial.time), tags: initial.tags,
        based_on_id: basedOn, recording_id: initial.recording_id, transcript: orNull(transcript),
      });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const setIng = (i: number, patch: Partial<Ingredient>) => setIngredients((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const candidates = (others.data ?? []).filter((r) => r.id !== selfId);

  return (
    <div className="stack-lg">
      {confirmations.length > 0 && (
        <section className="stack" aria-label="Please check">
          <h2>Please check these</h2>
          <p className="muted">I wasn't sure about a few things, so I didn't guess. Fix the recipe below if needed, then tap "Got it".</p>
          {confirmations.map((c, i) => (
            <div key={i} className="card flag stack">
              {c.about && <p className="eyebrow">{c.about}</p>}
              <p>{c.question}</p>
              <button className="btn small" onClick={() => setConfirmations((l) => l.filter((_, j) => j !== i))}>Got it</button>
            </div>
          ))}
        </section>
      )}

      <label className="field">
        <span>Name of the recipe</span>
        <input type="text" className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tomato Gojju" />
      </label>

      <section className="stack" aria-label="Whose recipe">
        <h2>Whose recipe is this?</h2>
        {initial.collectionNote && collectionId === initial.collection_id && collectionId && <p className="muted small">{initial.collectionNote}</p>}
        <div className="chips wrap">
          {collections.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={collectionId === c.id} onClick={() => setCollectionId(collectionId === c.id ? null : c.id)}>
              {c.name}
            </button>
          ))}
          {!addingCollection && <button type="button" className="chip" aria-pressed="false" onClick={() => setAddingCollection(true)}>+ Someone else</button>}
        </div>
        {addingCollection && (
          <div className="row">
            <input type="text" className="grow" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} placeholder="e.g. Lakshmi Aunty" aria-label="New name" />
            <button className="btn primary" onClick={addCollection}>Add</button>
          </div>
        )}
      </section>

      <section className="stack" aria-label="Ingredients">
        <h2>Ingredients</h2>
        <p className="muted small">Write amounts the way you say them, like "a little" or "one handful".</p>
        {ingredients.map((ing, i) => (
          <div key={i} className="edit-row">
            <input type="text" aria-label={`Amount ${i + 1}`} placeholder="Amount" value={ing.quantity ?? ''} onChange={(e) => setIng(i, { quantity: e.target.value || null })} />
            <input type="text" aria-label={`Ingredient ${i + 1}`} placeholder="Ingredient" value={ing.item} onChange={(e) => setIng(i, { item: e.target.value })} />
            <button className="x-btn" aria-label={`Remove ingredient ${i + 1}`} onClick={() => setIngredients((l) => l.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="btn" onClick={() => setIngredients((l) => [...l, { item: '', quantity: null, note: null }])}>+ Add an ingredient</button>
      </section>

      <section className="stack" aria-label="Method">
        <h2>Method</h2>
        {steps.map((s, i) => (
          <div key={i} className="edit-row step">
            <textarea aria-label={`Step ${i + 1}`} value={s} placeholder={`Step ${i + 1}`} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="x-btn" aria-label={`Remove step ${i + 1}`} onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="btn" onClick={() => setSteps((l) => [...l, ''])}>+ Add a step</button>
      </section>

      {(initial.recording_id || transcript) && (
        <label className="field">
          <span>What you said <span className="muted">(typed from your voice, fix any mistakes)</span></span>
          <textarea rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Nothing was typed from the recording. You can tap the microphone on your keyboard and say it again here." />
        </label>
      )}

      <label className="field">
        <span>The story behind it <span className="muted">(optional)</span></span>
        <textarea value={story} onChange={(e) => setStory(e.target.value)} placeholder="Who taught you? When do you make it?" />
      </label>

      <label className="field">
        <span>Tips and notes <span className="muted">(optional)</span></span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <section className="stack" aria-label="Variation">
        <h2>Is this your version of another recipe?</h2>
        <select value={basedOn ?? ''} onChange={(e) => setBasedOn(e.target.value || null)} aria-label="Based on">
          <option value="">No, it's its own recipe</option>
          {candidates.map((r) => <option key={r.id} value={r.id}>{r.title}{r.collection_name ? ` (${r.collection_name})` : ''}</option>)}
        </select>
        {(basedOn || variation) && (
          <label className="field">
            <span>What did you change?</span>
            <textarea value={variation} onChange={(e) => setVariation(e.target.value)} placeholder='e.g. "I added a little more chilli and used less oil."' />
          </label>
        )}
      </section>

      {error && <ErrorBox message={error} />}

      <div className="sticky-save stack">
        <button className="btn primary block" onClick={submit} disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
        <button className="btn ghost block" onClick={onCancel} disabled={saving}>{cancelLabel}</button>
      </div>
    </div>
  );
}
