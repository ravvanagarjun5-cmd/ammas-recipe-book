import { pending } from './pending.ts';

export type MicProblem = 'denied' | 'no-mic' | 'unsupported' | 'insecure' | 'other';

export class MicError extends Error {
  kind: MicProblem;
  constructor(kind: MicProblem) { super(kind); this.kind = kind; }
}

const MIME_CHOICES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function pickMime(): string {
  return MIME_CHOICES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Records from the microphone, saving every second of audio to the phone as it goes. */
export class Recorder {
  readonly id = crypto.randomUUID();
  private rec!: MediaRecorder;
  private stream!: MediaStream;
  private audioCtx?: AudioContext;
  private analyser?: AnalyserNode;
  private elapsedBefore = 0;
  private resumedAt = 0;
  private writes: Promise<unknown> = Promise.resolve();
  mime = '';

  static supported() {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    // Phones only allow the microphone on HTTPS (or localhost). A plain http:// address on the home network is blocked.
    if (!window.isSecureContext) throw new MicError('insecure');
    if (!Recorder.supported()) throw new MicError('unsupported');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('no-mic');
      throw new MicError('other');
    }
    const mime = pickMime();
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.mime = this.rec.mimeType || mime || 'audio/webm';
    await pending.create(this.id, this.mime);
    this.rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.writes = this.writes.then(() => pending.append(this.id, ev.data)).catch(() => undefined);
    };
    this.rec.start(1000);
    this.resumedAt = performance.now();
    try {
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.audioCtx.createMediaStreamSource(this.stream).connect(this.analyser);
    } catch { /* the level ring is a nicety; recording works without it */ }
  }

  elapsedMs() {
    return this.elapsedBefore + (this.rec?.state === 'recording' ? performance.now() - this.resumedAt : 0);
  }

  /** 0..1 loudness, so Mom can see the phone is hearing her. */
  level(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
    return Math.min(1, peak * 2);
  }

  get state() { return this.rec?.state ?? 'inactive'; }

  pause() {
    if (this.rec.state !== 'recording') return;
    this.elapsedBefore += performance.now() - this.resumedAt;
    this.rec.pause();
  }

  resume() {
    if (this.rec.state !== 'paused') return;
    this.resumedAt = performance.now();
    this.rec.resume();
  }

  async stop(): Promise<{ id: string; durationMs: number }> {
    const durationMs = Math.round(this.elapsedMs());
    await new Promise<void>((resolve) => {
      this.rec.onstop = () => resolve();
      if (this.rec.state !== 'inactive') this.rec.stop(); else resolve();
    });
    this.stream.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close();
    await this.writes; // every chunk is on the phone before we say "done"
    await pending.finish(this.id, durationMs);
    return { id: this.id, durationMs };
  }

  /** Release the mic without keeping anything (used only if the screen is closed before any audio exists). */
  release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close();
  }
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
