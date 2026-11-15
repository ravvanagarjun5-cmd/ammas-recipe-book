import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Collection } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { pending } from '../lib/pending.ts';
import { AudioCard, ErrorBox, Loading, useLoad } from '../components/ui.tsx';
import { initialFromRecipe, RecipeEditor, type EditorInitial } from '../components/RecipeEditor.tsx';

function useCollections() {
  const loaded = useLoad(() => api.collections(), []);
  const [extra, setExtra] = useState<Collection[]>([]);
  const all = [...(loaded.data ?? []), ...extra.filter((e) => !(loaded.data ?? []).some((c) => c.id === e.id))];
  return { all, loading: loaded.loading && !loaded.data, error: loaded.error, reload: loaded.reload, add: (c: Collection) => setExtra((l) => [...l, c]) };
}

export function EditRecipe() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cols = useCollections();
  const recipe = useLoad(() => api.recipe(id), [id]);

  if ((recipe.loading && !recipe.data) || cols.loading) return <Loading />;
  if (!recipe.data) return <ErrorBox message={recipe.error ?? 'Not found.'} onRetry={recipe.reload} />;
  const r = recipe.data;
  return (
    <div className="stack-lg">
      <h1>Edit recipe</h1>
      {r.recording_id && <AudioCard recordingId={r.recording_id} title="Original recording" />}
      <RecipeEditor
        initial={initialFromRecipe(r)} selfId={r.id} collections={cols.all} onCollectionAdded={cols.add}
        onSave={async (input) => { await api.updateRecipe(r.id, input); navigate(`/recipes/${r.id}`, { replace: true }); }}
        onCancel={() => navigate(`/recipes/${r.id}`)} cancelLabel="Cancel" saveLabel="Save changes"
      />
    </div>
  );
}

/** New recipe: typed from scratch, "my own version" of another recipe (?basedOn=), or written by hand for a recording (?recording=). */
export function NewRecipe() {
  const [params] = useSearchParams();
  const basedOn = params.get('basedOn');
  const recordingId = params.get('recording');
  const navigate = useNavigate();
  const cols = useCollections();
  const base = useLoad(() => (basedOn ? api.recipe(basedOn) : Promise.resolve(null)), [basedOn]);
  const spoken = useLoad(async () => (recordingId ? (await pending.get(recordingId))?.transcript ?? '' : ''), [recordingId]);

  if (base.loading || cols.loading || spoken.loading) return <Loading />;
  if (base.error) return <ErrorBox message={base.error} onRetry={base.reload} />;

  const b = base.data;
  const initial: EditorInitial = b
    ? { ...initialFromRecipe(b), title: `${b.title} (my version)`, collection_id: null, based_on_id: b.id, recording_id: null, transcript: '', variation_note: '' }
    : {
        title: '', collection_id: null, story: '', ingredients: [], steps: [], notes: '', transcript: spoken.data ?? '', variation_note: '', servings: '', time: '',
        tags: [], based_on_id: null, recording_id: recordingId, confirmations: [],
      };

  return (
    <div className="stack-lg">
      <Link to={recordingId ? '/' : '/recipes'} className="btn ghost small" style={{ alignSelf: 'flex-start' }}>← Back</Link>
      <h1>{b ? 'Your own version' : 'Write a recipe'}</h1>
      {b && <p className="muted">This is a copy of "{b.title}" that you can change. The original stays exactly as it was. Choose whose version it is and tell us what you changed.</p>}
      {recordingId && <AudioCard recordingId={recordingId} title="Your recording" />}
      {recordingId && <p className="muted small">The words you said are typed below. Fix any mistakes, then add the ingredients and steps.</p>}
      <RecipeEditor
        initial={initial} collections={cols.all} onCollectionAdded={cols.add}
        onSave={async (input) => { const r = await api.createRecipe(input); navigate(`/recipes/${r.id}`, { replace: true }); }}
        onCancel={() => navigate(-1)} cancelLabel="Cancel"
      />
    </div>
  );
}
