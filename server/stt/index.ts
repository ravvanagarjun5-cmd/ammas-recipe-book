import { config, ProviderConfigError } from '../config.ts';

export interface SttInput {
  audio: Buffer;
  mime: string;
  durationMs: number;
}

export interface SttResult {
  text: string;
  /** Provider's language guess, if it gives one. Informational only. */
  language: string | null;
}

/** One speech-to-text provider. Add a new file implementing this, then register it below. */
export interface SttProvider {
  name: string;
  /** Simulated adapters must say so; the UI shows a banner. */
  simulated: boolean;
  /** Facts for the comparison tool. Rates are as published when written; always re-check before relying on them. */
  info: { maxDuration: string; usdPerMinute: number | null; costNote: string };
  transcribe(input: SttInput): Promise<SttResult>;
}

/** The provider failed in a way worth retrying or reporting. */
export class SttError extends Error {}

export function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'bin';
}

// ---------- mock (development only) ----------

export const MOCK_TRANSCRIPT =
  "This is Amma's tomato gojju. I learned it from my mother. Take three tomatoes and two onions. " +
  'Add mustard and curry leaves. My mother uses less chilli, but I add a little more. Cook everything until soft.';

const mock: SttProvider = {
  name: 'mock',
  simulated: true,
  info: { maxDuration: 'n/a', usdPerMinute: 0, costNote: 'free (simulated)' },
  async transcribe() {
    await new Promise((r) => setTimeout(r, 600));
    return { text: MOCK_TRANSCRIPT, language: 'en' };
  },
};

// ---------- none: recording-only test mode ----------

/** Used for phone testing before any speech key exists. Real recordings are saved; transcription says "not connected". */
const none: SttProvider = {
  name: 'none',
  simulated: false,
  info: { maxDuration: 'n/a', usdPerMinute: 0, costNote: 'no speech service connected' },
  async transcribe() {
    throw new ProviderConfigError('No speech-to-text provider is connected (STT_PROVIDER=none: recording-only test mode).');
  },
};

// ---------- OpenAI ----------

const openai: SttProvider = {
  name: 'openai',
  simulated: false,
  info: { maxDuration: 'file size limit 25 MB (roughly 25+ min of compressed audio); not independently verified', usdPerMinute: 0.006, costNote: 'about $0.006/min for gpt-4o-transcribe, from memory: CHECK openai.com/api/pricing' },
  async transcribe({ audio, mime }) {
    if (!config.openaiKey) throw new ProviderConfigError('OPENAI_API_KEY is not set (STT_PROVIDER=openai).');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `recording.${extensionFor(mime)}`);
    form.append('model', config.openaiTranscribeModel);
    form.append('language', 'en');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openaiKey}` },
      body: form,
    });
    if (!res.ok) throw new SttError(`OpenAI transcription failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? '').trim(), language: null };
  },
};

// ---------- Sarvam ----------

const SARVAM_BASE = 'https://api.sarvam.ai';
/** Sarvam's simple REST endpoint is meant for clips under ~30 s; longer audio goes through their batch-job API (up to 2 h per file). */
const SARVAM_REST_LIMIT_MS = 29_000;

async function sarvamJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SARVAM_BASE}${path}`, {
    method,
    headers: { 'api-subscription-key': config.sarvamKey, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new SttError(`Sarvam ${method} ${path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/**
 * Batch flow, written from Sarvam's official SDK source (sarvamai 1.1.11):
 * create job -> get presigned upload URL -> PUT file -> start -> poll status -> get presigned download URL -> read JSON.
 * NOT yet run against the live service (no key). The first real run may need small fixes.
 */
async function sarvamBatch(audio: Buffer, mime: string): Promise<SttResult> {
  const fileName = `recording.${extensionFor(mime)}`;
  const init = await sarvamJson<{ job_id: string }>('POST', '/speech-to-text/job/v1', {
    job_parameters: { model: 'saaras:v3', mode: 'transcribe', language_code: 'en-IN', with_diarization: false, with_timestamps: false },
  });
  const jobId = init.job_id;
  const up = await sarvamJson<{ upload_urls: Record<string, { file_url: string }> }>('POST', '/speech-to-text/job/v1/upload-files', { job_id: jobId, files: [fileName] });
  const put = await fetch(up.upload_urls[fileName]!.file_url, {
    method: 'PUT', body: new Uint8Array(audio), headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': mime },
  });
  if (!put.ok) throw new SttError(`Sarvam upload failed: HTTP ${put.status}`);
  await sarvamJson('POST', `/speech-to-text/job/v1/${encodeURIComponent(jobId)}/start`, undefined);

  type Status = { job_state: string; job_details?: { state?: string; error_message?: string; outputs?: { file_name: string }[] }[] };
  const deadline = Date.now() + 10 * 60_000;
  let status: Status;
  for (;;) {
    status = await sarvamJson<Status>('GET', `/speech-to-text/job/v1/${encodeURIComponent(jobId)}/status`);
    const state = status.job_state.toLowerCase();
    if (state === 'completed') break;
    if (state === 'failed') throw new SttError(`Sarvam job failed: ${status.job_details?.[0]?.error_message ?? 'no detail'}`);
    if (Date.now() > deadline) throw new SttError('Sarvam job timed out after 10 minutes.');
    await new Promise((r) => setTimeout(r, 4000));
  }
  const output = status.job_details?.find((d) => d.outputs?.length)?.outputs?.[0]?.file_name;
  if (!output) throw new SttError('Sarvam job finished without an output file.');
  const dl = await sarvamJson<{ download_urls: Record<string, { file_url: string }> }>('POST', '/speech-to-text/job/v1/download-files', { job_id: jobId, files: [output] });
  const out = await fetch(dl.download_urls[output]!.file_url);
  if (!out.ok) throw new SttError(`Sarvam download failed: HTTP ${out.status}`);
  const json = (await out.json()) as { transcript?: string; language_code?: string | null };
  return { text: (json.transcript ?? '').trim(), language: json.language_code ?? null };
}

const sarvam: SttProvider = {
  name: 'sarvam',
  simulated: false,
  info: { maxDuration: 'REST: under ~30 s. Batch API: up to 2 h per file', usdPerMinute: 30 / 60 / 85, costNote: 'Rs 30 per hour of audio (published). Converted at about Rs 85 per USD' },
  async transcribe({ audio, mime, durationMs }) {
    if (!config.sarvamKey) throw new ProviderConfigError('SARVAM_API_KEY is not set (STT_PROVIDER=sarvam).');
    if (durationMs > SARVAM_REST_LIMIT_MS || durationMs === 0) return sarvamBatch(audio, mime);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `recording.${extensionFor(mime)}`);
    form.append('model', 'saaras:v3');
    form.append('mode', 'transcribe');
    form.append('language_code', 'en-IN');
    const res = await fetch(`${SARVAM_BASE}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': config.sarvamKey }, body: form });
    if (!res.ok) throw new SttError(`Sarvam transcription failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { transcript?: string; language_code?: string | null };
    return { text: (json.transcript ?? '').trim(), language: json.language_code ?? null };
  },
};

export const sttProviders: Record<string, SttProvider> = { mock, none, openai, sarvam };

export function getSttProvider(name: string = config.sttProvider): SttProvider {
  const p = sttProviders[name];
  if (!p) throw new ProviderConfigError(`Unknown STT_PROVIDER "${name}". Use one of: ${Object.keys(sttProviders).join(', ')}.`);
  return p;
}
