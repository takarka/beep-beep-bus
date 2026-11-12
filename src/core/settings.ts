import { detectLang, isLang, setLang, type Lang } from '../i18n';
import { loadJSON, saveJSON } from './storage';

const KEY = 'bbbus.settings.v1';

export interface Settings {
  lang: Lang;
  sound: boolean;
  music: boolean;
  /** "Helper" mode: the bus brakes by itself at red lights and bus stops. */
  assist: boolean;
}

type Listener = (s: Settings) => void;
const listeners: Listener[] = [];

function load(): Settings {
  const raw = loadJSON(KEY) as Partial<Settings> | null;
  const navLangs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  return {
    lang: raw && isLang(raw.lang) ? raw.lang : detectLang(navLangs),
    sound: raw?.sound ?? true,
    music: raw?.music ?? true,
    assist: raw?.assist ?? false,
  };
}

let current: Settings = load();
setLang(current.lang);

export const getSettings = (): Settings => current;

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  setLang(current.lang);
  saveJSON(KEY, current);
  listeners.forEach((l) => l(current));
  return current;
}

export function onSettingsChange(l: Listener): void {
  listeners.push(l);
}
