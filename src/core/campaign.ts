/** The campaign: a route through Astana. Each level is a landmark on the map. */
export const LEVEL_COUNT = 12;

export const LANDMARKS = [
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
] as const;
export type LandmarkId = (typeof LANDMARKS)[number];

export interface MapNode {
  landmark: LandmarkId;
  /** Position on the 1280×720 map. */
  x: number;
  y: number;
}

/** The landmark of a level; if there are ever more levels than landmarks, they start over. */
export const landmarkForLevel = (level: number): LandmarkId =>
  MAP_NODES[(((Math.floor(level) - 1) % MAP_NODES.length) + MAP_NODES.length) % MAP_NODES.length]!.landmark;

/** The path snakes from the railway station (bottom left) to the airport (top right). */
export const MAP_NODES: readonly MapNode[] = [
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
];
