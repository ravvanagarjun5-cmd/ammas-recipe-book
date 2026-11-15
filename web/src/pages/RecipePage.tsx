import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { AudioCard, ErrorBox, Loading, useLoad } from '../components/ui.tsx';

export function RecipePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: r, error, loading, reload } = useLoad(() => api.recipe(id), [id]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [removeError, setRemoveError] = useState('');

  if (loading && !r) return <Loading />;
  if (!r) return <ErrorBox message={error ?? 'Not found.'} onRetry={reload} />;

  const remove = async () => {
    if (!window.confirm(`Remove "${r.title}" from your recipe book? Your original recording will be kept.`)) return;
    try { await api.deleteRecipe(r.id); navigate('/recipes', { replace: true }); } catch (e) { setRemoveError((e as Error).message); }
  };
  const toggle = (i: number) => setDone((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const date = new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="stack-lg">
      <Link to="/recipes" className="btn ghost small" style={{ alignSelf: 'flex-start' }}>← My Recipes</Link>

      <header className="stack">
        {r.collection_name && <p className="eyebrow">From {r.collection_name}</p>}
        <h1 className="recipe-title">{r.title}</h1>
        {r.based_on_id && r.based_on_title && (
          <p className="muted">A variation of <Link to={`/recipes/${r.based_on_id}`}><strong>{r.based_on_title}</strong></Link>
            {r.variation_note ? <><br />“{r.variation_note}”</> : null}</p>
        )}
        {!r.based_on_id && r.variation_note && <p className="muted">“{r.variation_note}”</p>}
        {(r.servings || r.time) && <p className="muted">{[r.servings && `Serves ${r.servings}`, r.time].filter(Boolean).join(' · ')}</p>}
      </header>

      {r.steps.length > 0 && <Link className="btn primary block" to={`/recipes/${r.id}/cook`}>Start cooking</Link>}

      {r.story && <p className="story">{r.story}</p>}

      {r.recording_id && <AudioCard recordingId={r.recording_id} title="Listen to the original recording" />}

      {r.ingredients.length > 0 && (
        <section>
          <h2>Ingredients</h2>
          {r.ingredients.map((ing, i) => (
            <label key={i} className={`ingredient ${done.has(i) ? 'done' : ''}`}>
              <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} />
              <span className="text">
                {ing.quantity && <span className="qty">{ing.quantity} </span>}{ing.item}
                {ing.note && <span className="muted"> — {ing.note}</span>}
              </span>
            </label>
          ))}
        </section>
      )}

      {r.steps.length > 0 && (
        <section>
          <h2>Method</h2>
          <ol className="steps">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      )}

      {r.transcript && <section className="stack"><h2>What was said</h2><p style={{ whiteSpace: 'pre-wrap' }}>{r.transcript}</p></section>}

      {r.notes && <section className="stack"><h2>Notes</h2><p style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</p></section>}

      <p className="muted small">Saved {date}</p>

      <section className="stack">
        <Link className="btn block" to={`/recipes/new?basedOn=${r.id}`}>Make my own version</Link>
        <Link className="btn block" to={`/recipes/${r.id}/edit`}>Edit this recipe</Link>
        {removeError && <ErrorBox message={removeError} />}
        <button className="btn danger block" onClick={remove}>Remove this recipe</button>
      </section>
    </div>
  );
}
