import type { CityId } from '../core/campaign';

export type MusicThemeId = 'menu' | 'astana' | 'almaty' | 'shymkent';

export type PercStyle = 'light' | 'city' | 'groove' | 'folk';

export interface MusicTheme {
  id: MusicThemeId;
  bpm: number;
  leadWave: OscillatorType;
  leadFilterHz: number;
  /** Short pluck (0.4..0.7) vs legato (1.2..1.6) multiplier of an eighth note. */
  leadGate: number;
  bassWave: OscillatorType;
  /** Four 16-step (eighth-note) sections forming an A-B-A-C 64-step loop. 0 = rest. */
  sections: readonly [
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
  ];
  /** 16 bass notes (one every 4 eighth notes across the 64-step cycle). */
  bass: readonly number[];
  /** 16 soft chord roots/voicings (played gently on off-beats or half-notes). */
  chords: readonly (readonly number[])[];
  percStyle: PercStyle;
}

export const midiToHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export function themeForCity(city: CityId): MusicThemeId {
  return city;
}

/**
 * Four kid-friendly procedural themes:
 * - menu: warm marimba-like C-major tune for menus, garage, factory, and map
 * - astana: bright, bouncy C-major city drive
 * - almaty: sunny F-major mountain-breeze drive
 * - shymkent: playful D-major steppe/dombra-inspired plucked groove
 */
export const MUSIC_THEMES: Record<MusicThemeId, MusicTheme> = {
  menu: {
    id: 'menu',
    bpm: 108,
    leadWave: 'triangle',
    leadFilterHz: 1900,
    leadGate: 1.35,
    bassWave: 'sine',
    sections: [
      // A: gentle C-major motif
      [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, 0, 0],
      // B: warm lift to A & G
      [76, 0, 79, 0, 81, 0, 79, 76, 74, 0, 76, 74, 72, 0, 0, 0],
      // A': familiar return with tiny ornament
      [72, 0, 76, 79, 76, 0, 74, 72, 69, 0, 72, 0, 74, 0, 0, 0],
      // C: cozy cadence home
      [79, 0, 76, 0, 74, 72, 69, 0, 74, 0, 76, 74, 72, 0, 0, 0],
    ],
    bass: [48, 48, 45, 48, 41, 41, 43, 48, 48, 48, 45, 43, 41, 45, 43, 48],
    chords: [
      [60, 64], [60, 64], [57, 60], [60, 64],
      [53, 57], [53, 57], [55, 59], [60, 64],
      [60, 64], [60, 64], [57, 60], [55, 59],
      [53, 57], [57, 60], [55, 59], [60, 64],
    ],
    percStyle: 'light',
  },

  astana: {
    id: 'astana',
    bpm: 124,
    leadWave: 'triangle',
    leadFilterHz: 2400,
    leadGate: 1.15,
    bassWave: 'sine',
    sections: [
      // A: cheerful bouncy city ride
      [72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 74, 72, 69, 0, 72, 0],
      // B: bright climb
      [72, 0, 76, 79, 81, 0, 79, 76, 74, 0, 76, 74, 72, 0, 79, 0],
      // A: return
      [72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 79, 76, 74, 0, 0, 0],
      // C: upbeat bridge + turnaround
      [81, 0, 79, 76, 79, 0, 76, 72, 74, 76, 79, 74, 72, 0, 0, 0],
    ],
    bass: [48, 55, 45, 52, 41, 48, 43, 50, 48, 55, 45, 52, 41, 48, 43, 48],
    chords: [
      [60, 64, 67], [60, 64, 67], [57, 60, 64], [57, 60, 64],
      [53, 57, 60], [53, 57, 60], [55, 59, 62], [55, 59, 62],
      [60, 64, 67], [60, 64, 67], [57, 60, 64], [55, 59, 62],
      [53, 57, 60], [60, 64, 67], [55, 59, 62], [60, 64, 67],
    ],
    percStyle: 'city',
  },

  almaty: {
    id: 'almaty',
    bpm: 118,
    leadWave: 'triangle',
    leadFilterHz: 2100,
    leadGate: 1.4,
    bassWave: 'sine',
    sections: [
      // A: sunny F-major mountain melody (F5=77, G5=79, A5=81, C6=84, D6=86)
      [77, 0, 81, 0, 84, 81, 79, 0, 77, 79, 81, 0, 77, 0, 0, 0],
      // B: soaring over the peaks
      [81, 0, 84, 0, 86, 0, 84, 81, 79, 0, 81, 79, 77, 0, 74, 0],
      // A': breezy echo
      [77, 0, 81, 84, 81, 0, 79, 77, 74, 0, 77, 0, 79, 0, 0, 0],
      // C: apple-orchard cadence
      [84, 0, 81, 79, 81, 0, 77, 74, 79, 0, 81, 79, 77, 0, 0, 0],
    ],
    bass: [53, 53, 50, 50, 46, 46, 48, 53, 53, 53, 50, 48, 46, 50, 48, 53],
    chords: [
      [65, 69], [65, 69], [62, 65], [62, 65],
      [58, 62], [58, 62], [60, 64], [65, 69],
      [65, 69], [65, 69], [62, 65], [60, 64],
      [58, 62], [62, 65], [60, 64], [65, 69],
    ],
    percStyle: 'groove',
  },

  shymkent: {
    id: 'shymkent',
    bpm: 128,
    leadWave: 'triangle',
    leadFilterHz: 2600,
    leadGate: 0.72,
    bassWave: 'triangle',
    sections: [
      // A: lively D-major plucked steppe motif (D5=74, E5=76, F#5=78, A5=81, B5=83, D6=86)
      [74, 74, 78, 81, 78, 0, 76, 74, 78, 0, 81, 78, 76, 0, 74, 0],
      // B: festive climb
      [81, 0, 83, 81, 78, 81, 86, 0, 83, 0, 81, 78, 76, 0, 81, 0],
      // A': playful gallop
      [74, 74, 78, 81, 83, 0, 81, 78, 76, 78, 81, 76, 74, 0, 0, 0],
      // C: bright turnaround
      [86, 0, 83, 81, 78, 0, 81, 78, 76, 74, 76, 78, 74, 0, 0, 0],
    ],
    bass: [50, 57, 50, 57, 47, 54, 45, 52, 50, 57, 47, 54, 43, 50, 45, 50],
    chords: [
      [62, 69], [62, 66], [62, 69], [62, 66],
      [59, 66], [59, 62], [57, 64], [57, 61],
      [62, 69], [62, 66], [59, 66], [57, 64],
      [55, 62], [62, 69], [57, 64], [62, 69],
    ],
    percStyle: 'folk',
  },
};

export function stepNote(theme: MusicTheme, step: number): number {
  const s = ((step % 64) + 64) % 64;
  const sec = Math.floor(s / 16) as 0 | 1 | 2 | 3;
  return theme.sections[sec][s % 16] ?? 0;
}

export function stepBass(theme: MusicTheme, step: number): number | null {
  const s = ((step % 64) + 64) % 64;
  if (s % 4 !== 0) return null;
  return theme.bass[s / 4] ?? null;
}

export function stepChord(theme: MusicTheme, step: number): readonly number[] | null {
  const s = ((step % 64) + 64) % 64;
  if (s % 4 !== 2) return null;
  return theme.chords[Math.floor(s / 4)] ?? null;
}
