/** The campaign: routes through Astana, Almaty, and Shymkent. Each level is a landmark on the map. */
export const CITIES = ['astana', 'almaty', 'shymkent'] as const;
export type CityId = (typeof CITIES)[number];

export const LANDMARKS = [
  // Astana (1–12)
  'station',
  'concert',
  'triumph',
  'shatyr',
  'peace',
  'baiterek',
  'akorda',
  'mosque',
  'kazakheli',
  'nuralem',
  'arena',
  'airport',
  // Almaty (13–18)
  'koktobe',
  'medeu',
  'shymbulak',
  'circus',
  'panfilov',
  'almaty_station',
  // Shymkent (19–24)
  'dendropark',
  'baidibek',
  'citadel',
  'tulip',
  'shymkent_zoo',
  'shymkent_airport',
] as const;
export type LandmarkId = (typeof LANDMARKS)[number];

export const LEVEL_COUNT = LANDMARKS.length;

export interface MapNode {
  landmark: LandmarkId;
  /** Position on the 1280×720 map. */
  x: number;
  y: number;
}

export const CITY_RANGES: Record<CityId, { start: number; end: number }> = {
  astana: { start: 1, end: 12 },
  almaty: { start: 13, end: 18 },
  shymkent: { start: 19, end: 24 },
};

export function cityForLevel(level: number): CityId {
  if (level <= 12) return 'astana';
  if (level <= 18) return 'almaty';
  return 'shymkent';
}

/** The landmark of a level; if there are ever more levels than landmarks, they start over. */
export const landmarkForLevel = (level: number): LandmarkId =>
  MAP_NODES[(((Math.floor(level) - 1) % MAP_NODES.length) + MAP_NODES.length) % MAP_NODES.length]!.landmark;

export const MAP_NODES: readonly MapNode[] = [
  // Astana (1–12)
  { landmark: 'station', x: 130, y: 590 },
  { landmark: 'concert', x: 380, y: 540 },
  { landmark: 'triumph', x: 640, y: 600 },
  { landmark: 'shatyr', x: 900, y: 545 },
  { landmark: 'peace', x: 1140, y: 465 },
  { landmark: 'baiterek', x: 880, y: 375 },
  { landmark: 'akorda', x: 620, y: 425 },
  { landmark: 'mosque', x: 360, y: 370 },
  { landmark: 'kazakheli', x: 130, y: 275 },
  { landmark: 'nuralem', x: 370, y: 180 },
  { landmark: 'arena', x: 650, y: 235 },
  { landmark: 'airport', x: 940, y: 175 },
  // Almaty (13–18)
  { landmark: 'almaty_station', x: 160, y: 560 },
  { landmark: 'panfilov', x: 420, y: 490 },
  { landmark: 'circus', x: 680, y: 550 },
  { landmark: 'koktobe', x: 960, y: 430 },
  { landmark: 'medeu', x: 740, y: 270 },
  { landmark: 'shymbulak', x: 420, y: 210 },
  // Shymkent (19–24)
  { landmark: 'shymkent_airport', x: 170, y: 555 },
  { landmark: 'citadel', x: 440, y: 480 },
  { landmark: 'tulip', x: 700, y: 545 },
  { landmark: 'dendropark', x: 950, y: 430 },
  { landmark: 'shymkent_zoo', x: 720, y: 265 },
  { landmark: 'baidibek', x: 400, y: 210 },
];
