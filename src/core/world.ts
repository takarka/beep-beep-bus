import { mix } from '../config';

/** The setting of a route: which season, day or night, and whether it rains / snows. */
export const SEASONS = ['summer', 'autumn', 'winter', 'spring'] as const;
export const TIMES = ['day', 'night'] as const;
export type Season = (typeof SEASONS)[number];
export type TimeOfDay = (typeof TIMES)[number];

export interface Env {
  season: Season;
  time: TimeOfDay;
  /** Rain (snow in winter). */
  precip: boolean;
}

/** What the child picked on the weather screen. `auto` = the setting changes with the level. */
export interface WorldSetting extends Env {
  auto: boolean;
}

export const DEFAULT_WORLD: WorldSetting = { auto: true, season: 'summer', time: 'day', precip: false };

export const isSeason = (v: unknown): v is Season => (SEASONS as readonly string[]).includes(v as string);
export const isTime = (v: unknown): v is TimeOfDay => (TIMES as readonly string[]).includes(v as string);

export function sanitizeWorld(raw: unknown): WorldSetting {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    auto: typeof r.auto === 'boolean' ? r.auto : DEFAULT_WORLD.auto,
    season: isSeason(r.season) ? r.season : DEFAULT_WORLD.season,
    time: isTime(r.time) ? r.time : DEFAULT_WORLD.time,
    precip: typeof r.precip === 'boolean' ? r.precip : DEFAULT_WORLD.precip,
  };
}

/** Level 1 is the familiar sunny summer day, then the world keeps changing. */
const CYCLE: readonly Env[] = [
  { season: 'summer', time: 'day', precip: false },
  { season: 'autumn', time: 'day', precip: false },
  { season: 'winter', time: 'day', precip: true },
  { season: 'spring', time: 'day', precip: true },
  { season: 'summer', time: 'night', precip: false },
  { season: 'autumn', time: 'night', precip: true },
  { season: 'winter', time: 'night', precip: true },
  { season: 'spring', time: 'night', precip: false },
  { season: 'summer', time: 'day', precip: true },
  { season: 'autumn', time: 'night', precip: false },
  { season: 'winter', time: 'day', precip: false },
  { season: 'spring', time: 'day', precip: false },
];

export const envForLevel = (level: number): Env => CYCLE[(Math.max(1, Math.floor(level)) - 1) % CYCLE.length]!;

export function resolveEnv(level: number, world: WorldSetting): Env {
  return world.auto ? envForLevel(level) : { season: world.season, time: world.time, precip: world.precip };
}

export const precipKind = (env: Env): 'rain' | 'snow' => (env.season === 'winter' ? 'snow' : 'rain');

export const envKey = (env: Env): string => `${env.season}_${env.time}`;

// ---------------------------------------------------------------- colours

export interface Palette {
  skyTop: number;
  skyBottom: number;
  hillFar: number;
  hillNear: number;
  grass: number;
  sidewalk: number;
  sidewalkJoint: number;
  curb: number;
  road: number;
  roadLine: number;
  buildings: number[];
  litWindowChance: number;
  foliage: number[];
  trunk: number;
  cloudTint: number;
  sunVisible: boolean;
  moonVisible: boolean;
  /** Colour used to dim things at night. */
  ink: number;
}

const BASE: Record<Season, Omit<Palette, 'road' | 'roadLine' | 'buildings' | 'litWindowChance' | 'cloudTint' | 'sunVisible' | 'moonVisible' | 'ink' | 'trunk'>> = {
  summer: {
    skyTop: 0x7cc6de, skyBottom: 0xfde8c4, hillFar: 0xb5d39a, hillNear: 0x8fbb73,
    grass: 0x8cc084, sidewalk: 0xe3d3b3, sidewalkJoint: 0xc9b690, curb: 0xb9a57f,
    foliage: [0x6aa84f, 0x7fb069, 0x5e9c5a],
  },
  spring: {
    skyTop: 0x8fd0ea, skyBottom: 0xfdeef0, hillFar: 0xc6e2a8, hillNear: 0xa5d686,
    grass: 0x9bd68e, sidewalk: 0xe6d9bf, sidewalkJoint: 0xcdbd9c, curb: 0xbfae8c,
    foliage: [0x8fd18a, 0x9ad77f, 0xa8dd8c],
  },
  autumn: {
    skyTop: 0x8cb8cf, skyBottom: 0xffd9a8, hillFar: 0xdcb877, hillNear: 0xc98f4d,
    grass: 0xb59a55, sidewalk: 0xddc9a3, sidewalkJoint: 0xbfa77d, curb: 0xa98f66,
    foliage: [0xe07a3f, 0xd9a441, 0xc4452d, 0xe6b84a],
  },
  winter: {
    skyTop: 0xaec8da, skyBottom: 0xf1f5f8, hillFar: 0xe9f1f7, hillNear: 0xd2e1ec,
    grass: 0xf4f8fb, sidewalk: 0xeaeef2, sidewalkJoint: 0xc3ced8, curb: 0xc9d3dc,
    foliage: [0x4f7f5f, 0x3f6f55, 0x5a8a69],
  },
};

const BUILDINGS = [0xe98a6b, 0xf2c57c, 0x7fb7be, 0xd4a5a5, 0xa5b4d4, 0xe8d6a0, 0x9cc5a1];
const NIGHT_INK = 0x1b2048;

export function paletteFor(env: Env): Palette {
  const b = BASE[env.season];
  const night = env.time === 'night';
  // Everything that is not a light gets pulled towards deep blue at night.
  const dim = (c: number, t = 0.55) => (night ? mix(c, NIGHT_INK, t) : c);
  const grey = (c: number, t: number) => (env.precip ? mix(c, 0x8d98a5, t) : c);

  let skyTop = grey(b.skyTop, 0.45);
  let skyBottom = grey(b.skyBottom, 0.4);
  if (night) {
    skyTop = env.precip ? 0x20263f : 0x141a3a;
    skyBottom = env.precip ? 0x3a3d5c : 0x3b3a6a;
  }

  return {
    skyTop,
    skyBottom,
    hillFar: dim(grey(b.hillFar, 0.2), 0.5),
    hillNear: dim(grey(b.hillNear, 0.2), 0.55),
    grass: dim(b.grass),
    sidewalk: dim(b.sidewalk, 0.5),
    sidewalkJoint: dim(b.sidewalkJoint, 0.5),
    curb: dim(b.curb, 0.5),
    road: night ? 0x3b3e49 : env.precip ? 0x50545d : 0x5b5f67,
    roadLine: night ? 0xc9c6b6 : 0xf4f1de,
    buildings: BUILDINGS.map((c) => dim(grey(c, 0.15), 0.6)),
    litWindowChance: night ? 0.65 : 0.25,
    foliage: b.foliage.map((c) => dim(c, 0.5)),
    trunk: dim(0x8a5a3b, 0.5),
    cloudTint: night ? 0x4a5080 : env.precip ? 0x9aa5b1 : env.season === 'winter' ? 0xf0f5fa : 0xffffff,
    sunVisible: !night && !env.precip,
    moonVisible: night,
    ink: night ? NIGHT_INK : 0x2d2a32,
  };
}
