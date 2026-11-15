import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { ErrorBox, Loading, useLoad } from '../components/ui.tsx';
import { useWakeLock } from '../lib/wakelock.ts';

export function Cook() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: r, error, loading, reload } = useLoad(() => api.recipe(id), [id]);
  const [i, setI] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  useWakeLock(true); // the screen stays on while cooking

  if (loading && !r) return <Loading />;
  if (!r) return <ErrorBox message={error ?? 'Not found.'} onRetry={reload} />;
  if (r.steps.length === 0) return <ErrorBox message="This recipe has no steps yet." />;
  const last = i === r.steps.length - 1;

  return (
    <div className="stack-lg">
      <div className="row">
        <Link to={`/recipes/${r.id}`} className="btn ghost small">← Leave cooking</Link>
        <span className="grow" />
        <button className="btn small" onClick={() => setShowIngredients((s) => !s)}>{showIngredients ? 'Hide ingredients' : 'Ingredients'}</button>
      </div>

      {showIngredients && (
        <div className="card">
          {r.ingredients.map((ing, k) => <p key={k} style={{ padding: '6px 0' }}><strong>{ing.quantity}</strong> {ing.item}{ing.note ? <span className="muted"> — {ing.note}</span> : null}</p>)}
        </div>
      )}

      <div>
        <p className="eyebrow">Step {i + 1} of {r.steps.length}</p>
        <p className="cook-step" aria-live="polite">{r.steps[i]}</p>
      </div>

      <div className="rec-actions" style={{ marginTop: 0 }}>
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
        {last
          ? <button className="btn primary" onClick={() => navigate(`/recipes/${r.id}`)}>All done 🎉</button>
          : <button className="btn primary" onClick={() => setI(i + 1)}>Next →</button>}
      </div>
    </div>
  );
}
