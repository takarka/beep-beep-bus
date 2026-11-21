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

export interface VoiceLike {
  lang: string;
  name?: string;
  localService?: boolean;
}

/** Pick the best matching system speech voice for `lang`. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: Lang): T | null {
  if (voices.length === 0) return null;
  const prefix = `${lang}-`;
  const match = (code: string) =>
    voices.find((v) => v.lang.toLowerCase() === code) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(code.slice(0, 2) + '-') || v.lang.toLowerCase() === code.slice(0, 2));

  const exact = voices.find((v) => v.lang.toLowerCase().startsWith(prefix) || v.lang.toLowerCase() === lang);
  if (exact) return exact;
  // Many desktop OSes lack a dedicated kk-KZ voice; ru-RU reads Cyrillic Kazakh cleanly as a fallback.
  if (lang === 'kk') return match('ru-ru') ?? null;
  return match(LANG_BCP47[lang].toLowerCase()) ?? null;
}

class VoiceEngine {
  private enabled = true;
  private lang: Lang = 'ru';
  private lastSpokenAt = 0;
  private lastCueAt: Partial<Record<VoiceCue, number>> = {};
  private visBound = false;

  configure(enabled: boolean, lang: Lang): void {
    this.enabled = enabled;
    this.lang = lang;
    if (!enabled) this.stop();
  }

  private synth(): SpeechSynthesis | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return null;
    }
    if (!this.visBound && typeof document !== 'undefined') {
      this.visBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stop();
      });
    }
    return window.speechSynthesis;
  }

  speak(cue: VoiceCue, opts?: { priority?: boolean }): void {
    if (!this.enabled) return;
    const synth = this.synth();
    if (!synth) return;

    const now = Date.now();
    const priority = Boolean(opts?.priority);
    const sameGap = now - (this.lastCueAt[cue] ?? 0);
    const anyGap = now - this.lastSpokenAt;
    if (!priority && (sameGap < 2600 || anyGap < 950 || synth.speaking)) return;
    if (priority && sameGap < 1200) return;

    try {
      if (priority || synth.speaking) synth.cancel();
      const text = VOICE_PHRASES[this.lang][cue];
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANG_BCP47[this.lang];
      const chosen = pickVoice(synth.getVoices(), this.lang);
      if (chosen) u.voice = chosen;
      u.rate = 1.02;
      u.pitch = 1.12;
      u.volume = 0.92;
      audio.duck(0.45, 1.4);
      synth.speak(u);
      this.lastSpokenAt = now;
      this.lastCueAt[cue] = now;
    } catch {
      /* ignore browser speech quirks */
    }
  }

  stop(): void {
    const synth = this.synth();
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
  }
}

export const voice = new VoiceEngine();
