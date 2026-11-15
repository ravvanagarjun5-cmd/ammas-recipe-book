# Amma's Recipe Book

A simple recipe book that lives **on the phone**. Record your voice, write the recipe (dictate with the keyboard microphone), keep both together. No server, no account, no API keys, no cost.

- Recipes, collections and voice recordings are stored in the phone's browser storage (IndexedDB). Everything works offline after the first visit.
- **Back up often:** Recipes -> "Save a backup" makes one file (recipes + voices) to send to WhatsApp or Drive. "Restore from a backup" puts it back. Clearing browser data or losing the phone without a backup loses the recipes.

## Run it locally
```bash
npm install
npm run dev:web       # http://localhost:5173 (the microphone works on localhost)
```

## Put it on GitHub Pages (free, permanent address)
1. Push this folder to a **public** GitHub repo named e.g. `ammas-recipe-book` (branch `main`). It contains no secrets.
2. Repo Settings -> Pages -> Source: **GitHub Actions**. `.github/workflows/pages.yml` builds and deploys on every push.
3. Open `https://<your-name>.github.io/<repo>/` in Chrome on the phone -> menu -> **Add to Home screen / Install app**.

## Layout
`web/` the app (React, Vite, installable PWA) · `shared/` types and recipe validation · `test/`

## Not used right now
`server/`, `scripts/` and `docs/` are the earlier server version (voice-to-text with Sarvam, recipe writing with Claude, login, hosting notes). Nothing in the phone app uses them; `npm test` still tests them.
