import path from 'node:path';

const env = process.env;
const production = env.NODE_ENV === 'production';

export const config = {
  production,
  port: Number(env.PORT ?? 8787),
  appName: env.APP_NAME ?? "Amma's Recipe Book",
  dataDir: path.resolve(env.DATA_DIR ?? './data'),
  passphraseHash: env.FAMILY_PASSPHRASE_HASH ?? '',
  sttProvider: (env.STT_PROVIDER ?? 'mock') as 'mock' | 'none' | 'openai' | 'sarvam',
  llmProvider: (env.LLM_PROVIDER ?? 'mock') as 'mock' | 'none' | 'anthropic',
  openaiKey: env.OPENAI_API_KEY ?? '',
  openaiTranscribeModel: env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-transcribe',
  sarvamKey: env.SARVAM_API_KEY ?? '',
  anthropicKey: env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
  maxAudioBytes: 60 * 1024 * 1024,
};

/** Thrown when an adapter is selected but its credentials are missing. The message is for developers. */
export class ProviderConfigError extends Error {}

export function startupProblems(): string[] {
  const problems: string[] = [];
  if (production && !config.passphraseHash) problems.push('FAMILY_PASSPHRASE_HASH is required in production. Run: npm run hash-passphrase');
  if (production && ['mock', 'none'].some((m) => config.sttProvider === m || config.llmProvider === m)) {
    problems.push('Mock/none speech and AI adapters are not allowed in production. Set STT_PROVIDER and LLM_PROVIDER.');
  }
  return problems;
}
