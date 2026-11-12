import type { BusDesign } from './design';

/**
 * Pure bus layout maths (no Phaser). Coordinates are local to the bus:
 * x = 0 is the middle of the bus, y = 0 is the road (wheels touch it), up is negative.
 * The bus faces right (+x), driving left → right; doors are on the visible side.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BusLayout {
  backX: number;
  frontX: number;
  /** Front of the passenger box (differs from frontX only for the school bus hood). */
  boxFrontX: number;
  bottom: number;
  top: number;
  height: number;
  hood: { x0: number; x1: number; top: number } | null;
  /** The accordion between the two sections of the articulated ("bendy") bus. */
  joint: { x0: number; x1: number } | null;
  /** y of the floor between decks for the double-decker. */
  deckY: number | null;
  wheelR: number;
  wheelXs: number[];
  doors: Rect[];
  windows: Rect[];
  windshield: Rect;
  routeSign: Rect;
  numberBadge: { x: number; y: number; r: number };
  headlight: { x: number; y: number };
  taillight: { x: number; y: number };
}

export const BODY_SIZE = {
  city: { L: 480, H: 190 },
  bendy: { L: 800, H: 190 },
  double: { L: 500, H: 330 },
  school: { L: 500, H: 190 },
} as const;

/** How big each body is drawn on the road, so the long bus doesn't hide the street ahead. */
export const DRIVE_SCALE = { city: 0.8, bendy: 0.62, double: 0.7, school: 0.8 } as const;

export const WHEEL_RADIUS = { classic: 36, sport: 36, big: 46, retro: 38 } as const;

export const DOOR_W = 62;
const HOOD_LEN = 80;
const GAP = 12;
const WIN_GAP = 8;
const WIN_TARGET_W = 84;
const JOINT_W = 48;
/** Distance from the back of the bus to the start of the accordion. */
const JOINT_AT = 360;

function splitWindows(a: number, b: number, y: number, h: number, out: Rect[]): void {
  const span = b - a;
  if (span < 36) return;
  const n = Math.max(1, Math.round(span / WIN_TARGET_W));
  const w = (span - (n - 1) * WIN_GAP) / n;
  for (let i = 0; i < n; i++) out.push({ x: a + i * (w + WIN_GAP), y, w, h });
}

export function computeLayout(d: Pick<BusDesign, 'body' | 'doors' | 'wheels'>): BusLayout {
  const { L, H } = BODY_SIZE[d.body];
  const r = WHEEL_RADIUS[d.wheels];
  const school = d.body === 'school';
  const double = d.body === 'double';
  const bendy = d.body === 'bendy';

  const backX = -L / 2;
  const frontX = L / 2;
  const boxFrontX = school ? frontX - HOOD_LEN : frontX;
  const bottom = -Math.round(r * 0.6);
  const top = bottom - H;
  const deckY = double ? bottom - Math.round(H * 0.5) : null;
  const lowerTop = deckY ?? top;
  const joint = bendy ? { x0: backX + JOINT_AT, x1: backX + JOINT_AT + JOINT_W } : null;

  // Wheels: the articulated bus has a middle axle just behind the front section's doors.
  const rearWheel = backX + 82;
  const frontWheel = school ? frontX - 46 : frontX - 140;
  const wheelXs = [rearWheel];
  if (joint) wheelXs.push(joint.x1 + 70);
  wheelXs.push(frontWheel);
  const rearWheelEdge = rearWheel + r;

  // Doors: the front door is always right behind the windshield, others fill the middle.
  const doorTop = lowerTop + (double ? 24 : 38);
  const doorBottom = bottom - 4;
  const doorH = doorBottom - doorTop;
  const frontDoorX = boxFrontX - (school ? 14 : 26) - DOOR_W;
  const slot = (a: number, b: number): Rect => ({ x: (a + b) / 2 - DOOR_W / 2, y: doorTop, w: DOOR_W, h: doorH });

  const doors: Rect[] = [];
  if (joint) {
    // Rear section, then front section (between the middle and front axles).
    if (d.doors >= 2) doors.push(slot(rearWheelEdge + GAP, joint.x0 - GAP));
    if (d.doors === 3) doors.push(slot(wheelXs[1]! + r + 4, frontWheel - r - 4));
  } else {
    const regionStart = rearWheelEdge + GAP;
    const regionEnd = school ? frontDoorX - GAP : frontWheel - r - GAP;
    if (d.doors === 3) {
      doors.push({ x: regionStart, y: doorTop, w: DOOR_W, h: doorH });
      const a = regionStart + DOOR_W + GAP;
      doors.push({ x: (a + regionEnd) / 2 - DOOR_W / 2, y: doorTop, w: DOOR_W, h: doorH });
    } else if (d.doors === 2) {
      doors.push({ x: (regionStart + regionEnd) / 2 - DOOR_W / 2, y: doorTop, w: DOOR_W, h: doorH });
    }
  }
  doors.push({ x: frontDoorX, y: doorTop, w: DOOR_W, h: doorH });

  // Windows fill the gaps between doors (and the accordion) on the lower deck,
  // and run in a full row on the upper deck.
  const numberPanelW = 70;
  const winTop = lowerTop + (double ? 18 : 40);
  const winH = double ? Math.round(H * 0.5) - 66 : Math.round(H * 0.42);
  const windows: Rect[] = [];
  const obstacles = doors.map((door) => ({ x0: door.x, x1: door.x + door.w }));
  if (joint) obstacles.push(joint);
  obstacles.sort((p, q) => p.x0 - q.x0);
  let cursor = backX + numberPanelW;
  for (const o of obstacles) {
    splitWindows(cursor, o.x0 - WIN_GAP, winTop, winH, windows);
    cursor = o.x1 + WIN_GAP;
  }
  if (double) {
    const upTop = top + 36;
    const upH = (deckY as number) - 18 - upTop;
    splitWindows(backX + 18, boxFrontX - 30, upTop, upH, windows);
  }

  const shieldTop = top + (double ? 36 : 18);
  const windshield: Rect = { x: boxFrontX - 22, y: shieldTop, w: 16, h: winTop + winH + 12 - shieldTop };
  const routeSign: Rect = { x: boxFrontX - 196, y: top + 8, w: 150, h: 24 };
  const numberBadge = { x: backX + 38, y: winTop + winH / 2, r: 26 };

  return {
    backX,
    frontX,
    boxFrontX,
    bottom,
    top,
    height: H,
    hood: school ? { x0: boxFrontX, x1: frontX, top: bottom - Math.round(H * 0.48) } : null,
    joint,
    deckY,
    wheelR: r,
    wheelXs,
    doors,
    windows,
    windshield,
    routeSign,
    numberBadge,
    headlight: { x: frontX - 14, y: bottom - 34 },
    taillight: { x: backX + 8, y: bottom - 36 },
  };
}
