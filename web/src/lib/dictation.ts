// Types out what Mom says while the recorder keeps her voice. Uses Chrome's built-in speech typing (needs internet).
// shortcut: if the phone refuses to share the mic with the recorder, text stays empty and she types/dictates it in the form.
type Rec = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void };
const Ctor = (): (new () => Rec) | undefined => (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export class Dictation {
  private rec?: Rec;
  private on = false;
  text = '';

  static supported() { return !!Ctor(); }

  start() {
    const C = Ctor();
    if (!C || this.on) return;
    this.on = true;
    const r = new C();
    r.lang = 'en-IN'; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) this.text += `${e.results[i][0].transcript.trim()}. `;
    };
    r.onerror = () => undefined;
    r.onend = () => { if (this.on) try { r.start(); } catch { /* already running */ } }; // Chrome stops after a pause in speech
    this.rec = r;
    try { r.start(); } catch { this.on = false; }
  }

  stop() {
    this.on = false;
    try { this.rec?.stop(); } catch { /* not running */ }
  }
}
