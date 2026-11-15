import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { pending } from '../lib/pending.ts';
import { formatDuration } from '../lib/recorder.ts';
import { Icon, RecipeCard, useLoad } from '../components/ui.tsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function Home({ appName }: { appName: string }) {
  const recipes = useLoad(() => api.recipes(), []);
  const local = useLoad(async () => { const used = await api.attachedRecordingIds(); return (await pending.list()).filter((r) => !used.has(r.id)); }, []);
  const recent = (recipes.data ?? []).slice(0, 3);

  return (
    <div className="stack-lg">
      <header className="stack">
        <p className="eyebrow">{appName}</p>
        <h1>{greeting()} ❤️<br />What are we saving today?</h1>
      </header>

      <Link to="/record" className="tell-btn">
        <span className="mic"><Icon name="mic" /></span>
        <span>
          <strong>Tell a Recipe</strong>
          <span className="sub">Record your voice, then save the recipe.</span>
        </span>
      </Link>

      {(local.data ?? []).map((r) => (
        <Link key={r.id} to={`/record/${r.id}`} className="notice good" style={{ display: 'block', textDecoration: 'none' }}>
          <strong>You have a recording without a recipe</strong>
          <p>{formatDuration(r.durationMs)} · Tap to write its recipe.</p>
        </Link>
      ))}
      <section className="stack">
        <div className="row">
          <h2 className="grow">Recent recipes</h2>
          {recent.length > 0 && <Link to="/recipes" className="btn ghost small">See all</Link>}
        </div>
        {recipes.loading && !recipes.data && <p className="muted">Opening your recipes…</p>}
        {recipes.data && recent.length === 0 && (
          <div className="empty card flat">
            <div className="big">🍛</div>
            <h3>Your recipe book is empty</h3>
            <p className="muted">Tap "Tell a Recipe" and say your first one out loud.</p>
          </div>
        )}
        {recent.map((r) => <RecipeCard key={r.id} recipe={r} />)}
      </section>
    </div>
  );
}
