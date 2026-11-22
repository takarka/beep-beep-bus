import type { Lang } from '../i18n';
import { audio } from './AudioEngine';

export type VoiceCue =
  | 'go'
  | 'stop'
  | 'redLight'
  | 'greenLight'
  | 'pedestrians'
  | 'stopSign'
  | 'children'
  | 'ambulance'
  | 'lowFuel'
  | 'wellDone'
  | 'finish';

export const VOICE_CUES: readonly VoiceCue[] = [
  'go',
  'stop',
  'redLight',
  'greenLight',
  'pedestrians',
  'stopSign',
  'children',
  'ambulance',
  'lowFuel',
  'wellDone',
  'finish',
];

const LANG_BCP47: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-US',
};

export const VOICE_PHRASES: Record<Lang, Record<VoiceCue, string>> = {
  ru: {
    go: 'Поехали!',
    stop: 'Остановка!',
    redLight: 'Красный свет! Стой!',
    greenLight: 'Зелёный! Поехали!',
    pedestrians: 'Осторожно, пешеходы!',
    stopSign: 'Знак стоп! Остановись!',
    children: 'Осторожно, дети!',
    ambulance: 'Скорая! Уступи дорогу!',
    lowFuel: 'Мало бензина! Ищи заправку!',
    wellDone: 'Молодец!',
    finish: 'Ура! Приехали!',
  },
  kk: {
    go: 'Кеттік!',
    stop: 'Аялдама!',
    redLight: 'Қызыл түс! Тоқта!',
    greenLight: 'Жасыл түс! Кеттік!',
    pedestrians: 'Абай бол, жаяу жүргіншілер!',
    stopSign: 'Тоқта белгісі! Тоқта!',
    children: 'Абай бол, балалар!',
    ambulance: 'Жедел жәрдем! Жол бер!',
    lowFuel: 'Бензин аз! Жанармай құй!',
    wellDone: 'Жарайсың!',
    finish: 'Алақай! Келдік!',
  },
  en: {
    go: "Let's go!",
    stop: 'Bus stop!',
    redLight: 'Red light! Stop!',
    greenLight: 'Green light! Go!',
    pedestrians: 'Watch out, pedestrians!',
    stopSign: 'Stop sign! Stop!',
    children: 'Careful, children!',
    ambulance: 'Ambulance! Make way!',
    lowFuel: 'Low fuel! Find a gas station!',
    wellDone: 'Well done!',
    finish: 'Hooray! We arrived!',
  },
};

export const voiceUrl = (lang: Lang, cue: VoiceCue): string => `./audio/voice/${lang}/${cue}.mp3`;

export interface VoiceLike {
  lang: string;
  name?: string;
  localService?: boolean;
}

/** Pick the best matching system speech voice for `lang` (fallback only when MP3 clip is absent). */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: Lang): T | null {
  if (voices.length === 0) return null;
  const prefix = `${lang}-`;
  const match = (code: string) =>
    voices.find((v) => v.lang.toLowerCase() === code) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(code.slice(0, 2) + '-') || v.lang.toLowerCase() === code.slice(0, 2));

  const exact = voices.find((v) => v.lang.toLowerCase().startsWith(prefix) || v.lang.toLowerCase() === lang);
  if (exact) return exact;
  if (lang === 'kk') return match('ru-ru') ?? null;
  return match(LANG_BCP47[lang].toLowerCase()) ?? null;
}

class VoiceEngine {
  private enabled = true;
  private lang: Lang = 'ru';
  private lastSpokenAt = 0;
  private lastCueAt: Partial<Record<VoiceCue, number>> = {};
  private visBound = false;
  private cache = new Map<string, AudioBuffer | 'missing'>();
  private inFlight = new Map<string, Promise<AudioBuffer | null>>();
  private currentNode: AudioBufferSourceNode | null = null;
  private speaking = false;
  private seq = 0;

  configure(enabled: boolean, lang: Lang): void {
    this.enabled = enabled;
    this.lang = lang;
    if (!enabled) this.stop();
  }

  private bindVisibility(): void {
    if (this.visBound || typeof document === 'undefined') return;
    this.visBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
    });
  }

  private synth(): SpeechSynthesis | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return null;
    }
    return window.speechSynthesis;
  }

  private async loadClip(lang: Lang, cue: VoiceCue): Promise<AudioBuffer | null> {
    if (typeof fetch === 'undefined') return null;
    const key = `${lang}/${cue}`;
    const cached = this.cache.get(key);
    if (cached === 'missing') return null;
    if (cached) return cached;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const p = fetch(voiceUrl(lang, cue))
      .then(async (res) => {
        const ct = res.headers.get('content-type') ?? '';
        if (!res.ok || ct.includes('text/html')) {
          this.cache.set(key, 'missing');
          return null;
        }
        const buf = await audio.decodeAudio(await res.arrayBuffer());
        this.cache.set(key, buf ?? 'missing');
        return buf;
      })
      .catch(() => {
        this.cache.set(key, 'missing');
        return null;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, p);
    return p;
  }

  speak(cue: VoiceCue, opts?: { priority?: boolean }): void {
    if (!this.enabled) return;
    this.bindVisibility();

    const now = Date.now();
    const priority = Boolean(opts?.priority);
    const sameGap = now - (this.lastCueAt[cue] ?? 0);
    const anyGap = now - this.lastSpokenAt;
    if (!priority && (sameGap < 2600 || anyGap < 950 || this.speaking)) return;
    if (priority && sameGap < 1200) return;

    this.lastSpokenAt = now;
    this.lastCueAt[cue] = now;
    const mySeq = ++this.seq;
    const lang = this.lang;

    void this.playClipOrFallback(lang, cue, priority, mySeq);
  }

  private async playClipOrFallback(lang: Lang, cue: VoiceCue, priority: boolean, mySeq: number): Promise<void> {
    const buf = await this.loadClip(lang, cue);
    if (!this.enabled || mySeq !== this.seq) return;

    if (buf) {
      this.stopActive();
      const node = audio.playVoiceBuffer(buf, 0.95);
      if (node) {
        this.currentNode = node;
        this.speaking = true;
        audio.duck(0.45, Math.max(0.7, buf.duration + 0.12));
        node.onended = () => {
          if (this.currentNode === node) {
            this.currentNode = null;
            this.speaking = false;
          }
        };
        return;
      }
    }

    // Fallback to browser SpeechSynthesis only if MP3 clip is unavailable.
    const synth = this.synth();
    if (!synth) return;
    try {
      if (priority || synth.speaking) synth.cancel();
      const u = new SpeechSynthesisUtterance(VOICE_PHRASES[lang][cue]);
      u.lang = LANG_BCP47[lang];
      const chosen = pickVoice(synth.getVoices(), lang);
      if (chosen) u.voice = chosen;
      u.rate = 1.02;
      u.pitch = 1.12;
      u.volume = 0.92;
      audio.duck(0.45, 1.4);
      synth.speak(u);
    } catch {
      /* ignore browser speech quirks */
    }
  }

  private stopActive(): void {
    if (this.currentNode) {
      try {
        this.currentNode.stop();
      } catch {
        /* already stopped */
      }
      this.currentNode = null;
    }
    this.speaking = false;
    const synth = this.synth();
    if (synth) {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  stop(): void {
    this.seq++;
    this.stopActive();
  }
}

export const voice = new VoiceEngine();
