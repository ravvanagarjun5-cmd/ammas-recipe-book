// Runs the realistic English fixture through the REAL Claude adapter and applies the same checks the unit tests use.
// Needs ANTHROPIC_API_KEY (not required yet). Usage: npm run eval-structure
import { config } from '../server/config.ts';
import { structurers } from '../server/ai/structure.ts';
import { auditDraft } from '../server/ai/audit.ts';
import { checkDraft } from '../server/ai/evalcheck.ts';
import { EXPECTATIONS, TRANSCRIPT } from '../test/fixtures/structuring.ts';

if (!config.anthropicKey) {
  console.error('ANTHROPIC_API_KEY is not set in .env. Nothing was sent anywhere. (The offline checks run with: npm test)');
  process.exit(1);
}
const raw = await structurers.anthropic!.structure(TRANSCRIPT, ['Grandma', 'Mom', 'Sister', 'YouTube', 'My Experiments']);
const draft = auditDraft(TRANSCRIPT, raw);
console.log(JSON.stringify(draft, null, 2));
const fails = checkDraft(raw, TRANSCRIPT, EXPECTATIONS);
console.log(fails.length ? `\nFAILED CHECKS:\n- ${fails.join('\n- ')}` : '\nAll structuring checks passed.');
if (draft.needs_confirmation.length) console.log(`\nQuestions for Mom: ${draft.needs_confirmation.map((c) => c.question).join(' | ')}`);
process.exit(fails.length ? 1 : 0);
