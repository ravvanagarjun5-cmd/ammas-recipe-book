# Testing on a real Android phone (before hosting)

## Why HTTPS matters
Chrome on Android only lets a web page use the **microphone** on a secure origin: `https://…` or `http://localhost`.
A plain `http://192.168.x.x:8787` address on your home Wi-Fi is **blocked**; the app will say "This web address is not secure". Do not try to work around this; use one of the options below.

## Recommended: Cloudflare quick tunnel (HTTPS, nothing to install on the phone)

One-time on your PC (PowerShell):
```bash
winget install Cloudflare.cloudflared
npm run hash-passphrase -- "choose a passphrase"
```
Put the `FAMILY_PASSPHRASE_HASH=...` line it prints into a new file called `.env` in the project folder.

Every test session, two terminals:

```bash
npm run phone
```
```bash
cloudflared tunnel --url http://localhost:8787
```

The second terminal prints an address like `https://random-words.trycloudflare.com`. Open it in **Chrome** on the phone and sign in with the passphrase.

- Needs no Cloudflare account. The address changes every time you restart the tunnel.
- The app server still listens on `localhost` only. The tunnel is the only way in, and it exists only while that terminal is open (Ctrl+C closes it).
- Anyone who guesses the random address still needs the passphrase (login attempts are rate limited). `npm run phone` refuses to start without your own passphrase hash.
- **Privacy:** traffic, including the recordings, passes through Cloudflare while the tunnel is open. Fine for test recordings of a recipe; do not use it for anything private.
- Because the address changes, **installing the app to the home screen from a quick tunnel is only good for that session.** Install testing needs a stable address (see below).

`npm run phone` starts in **recording-only mode**: no API keys needed. Real voice is recorded, saved, and played back; the transcription step honestly says it is not connected yet.

## Alternatives
| Option | HTTPS | Setup | Notes |
|---|---|---|---|
| USB cable + `adb reverse tcp:8787 tcp:8787`, then open `http://localhost:8787` in phone Chrome | Not needed (`localhost` counts as secure) | Developer options + USB debugging on the phone; `adb` is already on this PC | Nothing is exposed to the internet. Works only while the cable is connected, so it suits your own phone, not Mom's. |
| Tailscale (`tailscale serve`) | Yes, automatic `*.ts.net` certificate | Tailscale on PC **and** phone, account, enable HTTPS in its admin console | Private and stable address, so good for install testing. More setup. |
| mkcert on the home network | Yes, with a local certificate | Install a custom root certificate on the phone | Fiddly and weakens the phone's trust store. Not recommended. |

## What to do on the phone (checklist)
1. Open the https link in **Chrome**, sign in.
2. Home → **Tell a Recipe**. Chrome asks to use the microphone: tap **Allow**.
3. Speak for about 20 seconds in your normal way. Try **pausing** and **resuming** once. Watch the timer.
4. Tap **I'm done**, then play it back in the player. Check the length shown is right and the audio is clear.
5. Tap **Write down my recipe**. Expected: a friendly message that the voice is saved but speech isn't connected, with the recording playable. This is correct in recording-only mode.
6. Turn on airplane mode and repeat step 3 to 5 (record, stop, try to send). Expected: a clear message, and the recording is still on the phone. Turn Wi-Fi back on and tap again; it should go through.
7. Lock the screen mid-recording for a few seconds and see what happens (report it).
8. Close Chrome completely, reopen the link: you should still be signed in, and any unsent recording shows on Home.
9. Try denying the microphone once (lock icon next to the address → Permissions) and read the message.
10. Open the **Chrome menu → "Add to Home screen" / "Install app"** and note whether Chrome offers install (only meaningful on a stable address).

## Getting recordings to the comparison tool
Use the app's own recording (recordings are stored in `data/audio/` as `.webm`), or record with any Android recorder app. Then:
```bash
npm run compare-stt -- data/audio/<file>.webm --duration 90
```
