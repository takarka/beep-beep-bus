/** Logical game resolution. Phaser scales it to fit any screen (Scale.FIT). */
export const GAME_W = 1280;
export const GAME_H = 720;

export const FONT = 'Rubik, "Trebuchet MS", Arial, sans-serif';

/** Retro-flat palette. All art is drawn in code from these colours. */
export const C = {
  ink: 0x2d2a32,
  cream: 0xfff6e0,
  skyTop: 0x7cc6de,
  skyBottom: 0xfde8c4,
  sun: 0xffd166,
  hillFar: 0xb5d39a,
  hillNear: 0x8fbb73,
  road: 0x5b5f67,
  roadLine: 0xf4f1de,
  sidewalk: 0xe3d3b3,
  sidewalkJoint: 0xc9b690,
  curb: 0xb9a57f,
  grass: 0x8cc084,
  green: 0x57cc99,
  red: 0xe63946,
  yellow: 0xffd23f,
  orange: 0xf4a261,
  blue: 0x3a86ff,
  purple: 0x9b5de5,
  glass: 0xbfe6f2,
  metal: 0xc3c8cf,
  tire: 0x2d2a32,
  doorway: 0x3b3640,
  panel: 0xfff6e0,
  shadow: 0x000000,
} as const;

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** Lighten (f > 0) or darken (f < 0) an RGB integer colour. */
export function shade(c: number, f: number): number {
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

/** Blend colour a towards b (t = 0 → a, t = 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Relative luminance 0..1, used to pick contrasting decor colours. */
export function luminance(c: number): number {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
}
