import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { ErrorBox, Loading, RecipeCard, useLoad } from '../components/ui.tsx';
import { restoreBackup, saveBackup } from '../lib/backup.ts';

export function Recipes() {
  const [collection, setCollection] = useState<string | null>(null);
  const collections = useLoad(() => api.collections(), []);
  const recipes = useLoad(() => api.recipes({ collection: collection ?? undefined }), [collection]);
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const run = async (job: () => Promise<string>) => { try { setNote(await job()); recipes.reload(); } catch (e) { setNote((e as Error).message); } };

  return (
    <div className="stack-lg">
      <h1>My Recipes</h1>

      <div className="chips" role="group" aria-label="Whose recipes">
        <button className="chip" aria-pressed={collection === null} onClick={() => setCollection(null)}>All</button>
        {(collections.data ?? []).map((c) => (
          <button key={c.id} className="chip" aria-pressed={collection === c.id} onClick={() => setCollection(c.id)}>{c.name}</button>
        ))}
      </div>

      {recipes.loading && !recipes.data && <Loading text="Opening your recipes…" />}
      {recipes.error && !recipes.data && <ErrorBox message={recipes.error} onRetry={recipes.reload} />}

      {recipes.data && recipes.data.length === 0 && (
        <div className="empty card flat stack">
          <div className="big">📖</div>
          <h3>{collection ? 'Nothing here yet' : 'No recipes yet'}</h3>
          <p className="muted">{collection ? 'Recipes you save under this name will appear here.' : 'Tell your first recipe and it will appear here.'}</p>
          <Link className="btn primary" to="/record">Tell a Recipe</Link>
        </div>
      )}

      <div className="stack">
        {(recipes.data ?? []).map((r) => <RecipeCard key={r.id} recipe={r} />)}
      </div>

      <Link className="btn block" to="/recipes/new">Write a recipe by typing</Link>

      <section className="stack card flat">
        <h3>Keep my recipes safe</h3>
        <p className="muted small">Your recipes and voices live only on this phone. Save a backup file now and then, and send it to yourself on WhatsApp or Drive.</p>
        <button className="btn block" onClick={() => run(async () => { await saveBackup(); return 'Backup ready. Send it somewhere safe.'; })}>Save a backup</button>
        <button className="btn block" onClick={() => file.current?.click()}>Restore from a backup</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(async () => `Restored ${await restoreBackup(f)} recipes.`); }} />
        {note && <p role="status">{note}</p>}
      </section>
    </div>
  );
}
