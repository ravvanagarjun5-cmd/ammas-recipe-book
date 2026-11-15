# Backup plan (design only, not built yet)

The recordings are irreplaceable, so **the production server's disk must never be the only copy.**

## What must be backed up
1. `recipes.db` (SQLite: recipes, original transcripts, corrected words, collections, sessions).
2. `audio/` (every original recording).

## Plan
- **Nightly off-server copy.** A scheduled job on the server (a small `npm run backup` script) takes a consistent SQLite snapshot (`VACUUM INTO`, safe while the app runs), then uploads the snapshot **and any new audio files** to a storage bucket in a *different* provider/account than the host (for example Backblaze B2 or Cloudflare R2, a few cents a month at this size). Audio files never change once written, so the upload is incremental and cheap.
- **Keep history.** Keep daily snapshots for 14 days and weekly for 3 months, so a bad edit or accidental delete can be undone.
- **Host snapshots are a second layer, not the plan.** Railway/Fly volume snapshots help, but they live with the same provider.
- **Family export (the "own your data" copy).** `npm run export` writes one ZIP: a folder per recipe containing a readable `recipe.md`, the original `audio.webm`, `transcript-original.txt` and `transcript-corrected.txt`, plus a `recipes.json`. It must open without this app. Run it monthly and keep a copy on a family laptop or drive.
- **Restore procedure (must be tested before launch).** Stop the app, put `recipes.db` back in `DATA_DIR`, copy `audio/` back, start the app, open a recipe and play its recording. A restore that has never been rehearsed is not a backup.

## Already in place
- Audio is written to a temp file then renamed, so a crash never leaves a half-written recording.
- Recipes are soft-deleted; recordings are never deleted by any button in the app.
- The audio storage and the database sit behind small interfaces (`server/storage.ts`, `server/db.ts`), so moving storage later does not touch the rest of the app.
