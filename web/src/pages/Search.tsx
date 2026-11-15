import { useEffect, useState } from 'react';
import type { Recipe } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { ErrorBox, Loading, RecipeCard } from '../components/ui.tsx';

export function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Recipe[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults(null); setError(''); return; }
    setBusy(true);
    let stale = false;
    const t = setTimeout(() => {
      api.recipes({ q }).then(
        (r) => { if (!stale) { setResults(r); setError(''); setBusy(false); } },
        (e: Error) => { if (!stale) { setError(e.message); setBusy(false); } },
      );
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);

  return (
    <div className="stack-lg">
      <h1>Find a recipe</h1>
      <label className="field">
        <span className="sr">Search</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “potato” or “Grandma”" autoFocus enterKeyHint="search" />
      </label>

      {!q.trim() && <p className="muted">Type a dish, an ingredient, or whose recipe it is.</p>}
      {busy && !results && <Loading text="Looking…" />}
      {error && <ErrorBox message={error} />}
      {results && results.length === 0 && !error && (
        <div className="empty card flat">
          <div className="big">🔍</div>
          <h3>I couldn't find “{q.trim()}”</h3>
          <p className="muted">Try a shorter word, like just the main ingredient.</p>
        </div>
      )}
      <div className="stack">{(results ?? []).map((r) => <RecipeCard key={r.id} recipe={r} />)}</div>
    </div>
  );
}
