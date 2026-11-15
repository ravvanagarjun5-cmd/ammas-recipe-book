// Usage: npm run hash-passphrase -- "your family passphrase"
import { hashPassphrase } from '../server/auth.ts';

const phrase = process.argv[2];
if (!phrase || phrase.length < 6) {
  console.error('Usage: npm run hash-passphrase -- "a passphrase of at least 6 characters"');
  process.exit(1);
}
console.log('\nPut this line in your .env file (or your host\'s environment variables). Do not store the passphrase itself:\n');
console.log(`FAMILY_PASSPHRASE_HASH=${hashPassphrase(phrase)}\n`);
