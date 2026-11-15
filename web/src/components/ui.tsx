import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import type { Recipe } from '../../../shared/types.ts';
import { pending } from '../lib/pending.ts';

const PATHS: Record<string, ReactNode> = {
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  home: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  book: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></>,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  play: <path d="M8 5l11 7-11 7z" />,
  headphones: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z" />,
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fnRef.current().then(
      (data) => setState({ data, loading: false }),
      (e: Error) => setState((s) => ({ data: s.data, error: e.message, loading: false })),
    );
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, deps);
  return { ...state, reload: load };
}

export function Loading({ text = 'One moment…' }: { text?: string }) {
  return (
    <div className="center stack" style={{ padding: '48px 0' }} role="status">
      <div className="spinner" />
      <p className="muted">{text}</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice bad stack" role="alert">
      <p>{message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link to={`/recipes/${recipe.id}`} className="recipe-card">
      <h3>{recipe.title}</h3>
      <p className="meta">
        {recipe.collection_name ? `From ${recipe.collection_name}` : 'No collection yet'}
        {recipe.recording_id ? ' · 🎙️ voice saved' : ''}
      </p>
    </Link>
  );
}

/**
 * Chrome's MediaRecorder writes WebM files with no duration, so a plain <audio> reports "Infinity" and the
 * progress bar is useless. Seeking far past the end once makes the browser work out the real length.
 */
export function VoicePlayer({ src, preload = 'metadata' }: { src: string; preload?: 'none' | 'metadata' }) {
  const fix = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const a = e.currentTarget;
    if (a.duration !== Infinity) return;
    const back = () => { a.removeEventListener('timeupdate', back); a.currentTime = 0; };
    a.addEventListener('timeupdate', back);
    a.currentTime = 1e101;
  };
  return <audio controls preload={preload} src={src} onLoadedMetadata={fix}>Your browser cannot play audio.</audio>;
}

/** Plays a recording stored on this phone. */
function useVoiceUrl(id: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | undefined;
    void pending.get(id).then((r) => { if (r?.chunks.length) { u = URL.createObjectURL(pending.blob(r)); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url;
}

export function AudioCard({ recordingId, title }: { recordingId: string; title: string }) {
  const url = useVoiceUrl(recordingId);
  return (
    <div className="card stack">
      <div className="audio-card">
        <div className="glyph"><Icon name="headphones" /></div>
        <div>
          <h3>{title}</h3>
          <p className="muted small">Exactly as it was said</p>
        </div>
      </div>
      {url ? <VoicePlayer src={url} /> : <p className="muted">This recording is not on this phone.</p>}
    </div>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

/** Page frame with the bottom navigation. */
export function NavLayout() {
  const online = useOnline();
  return (
    <div className="shell">
      {!online && <div className="banner offline">You're offline. You can still read your saved recipes.</div>}
      <main className="page"><Outlet /></main>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          <NavLink to="/" end><Icon name="home" />Home</NavLink>
          <NavLink to="/recipes"><Icon name="book" />Recipes</NavLink>
          <NavLink to="/search"><Icon name="search" />Search</NavLink>
        </div>
      </nav>
    </div>
  );
}

/** Frame without navigation, for focused tasks (recording, reviewing, cooking). */
export function FocusLayout() {
  const online = useOnline();
  return (
    <div className="shell">
      {!online && <div className="banner offline">You're offline.</div>}
      <main className="page no-nav"><Outlet /></main>
    </div>
  );
}
