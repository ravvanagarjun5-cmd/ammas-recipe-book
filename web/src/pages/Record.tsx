import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { pending } from '../lib/pending.ts';
import { formatDuration, MicError, Recorder, type MicProblem } from '../lib/recorder.ts';
import { useWakeLock } from '../lib/wakelock.ts';
import { ErrorBox, Icon, Loading, VoicePlayer } from '../components/ui.tsx';

type Phase = 'loading' | 'idle' | 'recording' | 'paused' | 'stopped';

const MIC_HELP: Record<MicProblem, { title: string; body: string }> = {
  denied: {
    title: "The microphone is turned off",
    body: 'To fix it: tap the small lock (or settings) icon next to the web address at the top, choose "Permissions", turn on "Microphone", then come back and tap the button again.',
  },
  'no-mic': { title: "I can't find a microphone", body: 'Please check that your phone microphone is working, then try again.' },
  insecure: { title: 'This web address is not secure', body: "The phone only lets an app use the microphone on a secure (https) address. Please open the recipe book using the https link you were given. You can still write a recipe by typing." },
  unsupported: { title: 'Recording is not available here', body: 'Please open this app in Chrome on your phone. You can also write the recipe yourself.' },
  other: { title: "I couldn't start the microphone", body: 'Please close other apps that might be using it, then try again.' },
};

export function RecordPage() {
  const { id: resumeId } = useParams();
  const navigate = useNavigate();
  const recorder = useRef<Recorder | null>(null);
  const [phase, setPhase] = useState<Phase>(resumeId ? 'loading' : 'idle');
  const [elapsed, setElapsed] = useState(0);
  const [mic, setMic] = useState<MicProblem | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ id: string; durationMs: number; url: string } | null>(null);
  const orb = useRef<HTMLButtonElement>(null);

  useWakeLock(phase === 'recording' || phase === 'paused');

  // Coming back to a recording that is safe on this phone (app closed, or upload failed earlier).
  useEffect(() => {
    if (!resumeId) return;
    pending.get(resumeId).then((r) => {
      if (!r || r.chunks.length === 0) { navigate('/', { replace: true }); return; }
      setSaved({ id: r.id, durationMs: r.durationMs, url: URL.createObjectURL(pending.blob(r)) });
      setPhase('stopped');
    }, () => navigate('/', { replace: true }));
  }, [resumeId, navigate]);

  // Timer + loudness ring.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    let raf = 0;
    const tick = () => {
      const r = recorder.current;
      if (r) {
        setElapsed(r.elapsedMs());
        orb.current?.style.setProperty('--level', phase === 'recording' ? String(r.level()) : '0');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Leaving mid-recording must never lose audio: finish and keep it on the phone.
  useEffect(() => () => {
    const r = recorder.current;
    if (r && (r.state === 'recording' || r.state === 'paused')) void r.stop();
  }, []);

  const start = async () => {
    setMic(null); setError('');
    const r = new Recorder();
    try {
      await r.start();
      recorder.current = r;
      setElapsed(0);
      setPhase('recording');
    } catch (e) {
      r.release();
      setMic(e instanceof MicError ? e.kind : 'other');
    }
  };

  const stop = async () => {
    const r = recorder.current;
    if (!r) return;
    const done = await r.stop();
    const rec = await pending.get(done.id);
    if (!rec || rec.chunks.length === 0) { setError('Nothing was recorded. Please try again.'); setPhase('idle'); return; }
    setSaved({ id: done.id, durationMs: done.durationMs, url: URL.createObjectURL(pending.blob(rec)) });
    setPhase('stopped');
  };

  const next = () => saved && navigate(`/recipes/new?recording=${saved.id}`, { replace: true });

  const startOver = async () => {
    if (!saved) return;
    if (!window.confirm('Throw this recording away and start again?')) return;
    await pending.remove(saved.id);
    URL.revokeObjectURL(saved.url);
    setSaved(null); setElapsed(0); setPhase('idle');
  };

  if (phase === 'loading') return <Loading />;

  return (
    <div className="stack-lg">
      <Link to="/" className="btn ghost small" style={{ alignSelf: 'flex-start' }}>← Back</Link>

      {phase === 'idle' && (
        <div className="rec-stage stack-lg">
          <div className="stack">
            <h1>Tell me the recipe</h1>
            <p className="muted">Speak the way you normally do. Your voice is kept with the recipe.</p>
          </div>
          <button className="rec-orb" onClick={start} aria-label="Start recording"><Icon name="mic" /></button>
          <p><strong>Tap the button to start</strong></p>
          {mic && (
            <div className="notice bad stack" role="alert" style={{ textAlign: 'left' }}>
              <h3>{MIC_HELP[mic].title}</h3>
              <p>{MIC_HELP[mic].body}</p>
              <div className="row wrap">
                {mic !== 'unsupported' && mic !== 'insecure' && <button className="btn" onClick={start}>Try again</button>}
                <Link className="btn" to="/recipes/new">Write it myself</Link>
              </div>
            </div>
          )}
          {error && <ErrorBox message={error} />}
          {!mic && <p className="muted small">Keep the phone screen on while you talk. I'll keep it awake for you.</p>}
        </div>
      )}

      {(phase === 'recording' || phase === 'paused') && (
        <div className="rec-stage">
          <p className="eyebrow">{phase === 'recording' ? '● Listening' : 'Paused'}</p>
          <div className="rec-timer" role="timer" aria-live="off">{formatDuration(elapsed)}</div>
          <button ref={orb} className={`rec-orb ${phase === 'recording' ? 'live' : 'paused'}`} aria-label={phase === 'recording' ? 'Pause' : 'Keep going'}
            onClick={() => { const r = recorder.current!; if (phase === 'recording') { r.pause(); setPhase('paused'); } else { r.resume(); setPhase('recording'); } }}>
            <Icon name={phase === 'recording' ? 'pause' : 'mic'} />
          </button>
          <p className="muted" style={{ marginTop: 14 }}>{phase === 'recording' ? 'Tap the circle to pause' : 'Tap the circle to keep going'}</p>
          <div className="rec-actions" style={{ gridTemplateColumns: '1fr' }}>
            <button className="btn primary" onClick={stop}><Icon name="stop" />I'm done</button>
          </div>
        </div>
      )}

      {phase === 'stopped' && saved && (
        <div className="stack-lg">
          <div className="stack">
            <h1>Got it, {formatDuration(saved.durationMs)}</h1>
            <p className="muted">Your recording is saved on this phone. Listen if you like, then write the recipe.</p>
          </div>
          <VoicePlayer src={saved.url} />
          <div className="stack">
            <button className="btn primary block" onClick={next}>Next: write the recipe</button>
            <button className="btn block" onClick={startOver}>Record again</button>
            <Link className="btn ghost block" to="/">Finish later</Link>
          </div>
        </div>
      )}
    </div>
  );
}
