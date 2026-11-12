export const BODY_TYPES = ['city', 'bendy', 'double', 'school'] as const;
export const DOOR_COUNTS = [1, 2, 3] as const;
export const WHEEL_TYPES = ['classic', 'sport', 'big', 'retro'] as const;
export const LIGHT_TYPES = ['round', 'square', 'eyes', 'star'] as const;
export const DECOR_TYPES = ['none', 'stripe', 'dots', 'stars'] as const;
export const BUS_COLORS = [
  0xe63946, 0xf4a261, 0xffd23f, 0x57cc99, 0x3a86ff, 0x9b5de5, 0xf15bb5, 0xf1ead8,
] as const;

export type BodyType = (typeof BODY_TYPES)[number];
export type DoorCount = (typeof DOOR_COUNTS)[number];
export type WheelType = (typeof WHEEL_TYPES)[number];
export type LightType = (typeof LIGHT_TYPES)[number];
export type DecorType = (typeof DECOR_TYPES)[number];

export interface BusDesign {
  body: BodyType;
  doors: DoorCount;
  wheels: WheelType;
  color: number;
  lights: LightType;
  decor: DecorType;
  /** Bus number painted on the side and shown on the route board: 1–3 digits. */
  number: string;
}

export const MAX_NUMBER_DIGITS = 3;

export const DEFAULT_DESIGN: Readonly<BusDesign> = {
  body: 'city',
  doors: 2,
  wheels: 'classic',
  color: 0xffd23f,
  lights: 'round',
  decor: 'stripe',
  number: '7',
};

function oneOf<T>(list: readonly T[], v: unknown, fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

export function normalizeNumber(v: unknown): string {
  const digits = String(v ?? '').replace(/\D/g, '').slice(0, MAX_NUMBER_DIGITS);
  return digits.length > 0 ? digits : DEFAULT_DESIGN.number;
}

/** Turns anything (e.g. old/corrupt saved JSON) into a valid design. */
export function sanitizeDesign(raw: unknown): BusDesign {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const color =
    typeof r.color === 'number' && Number.isInteger(r.color) && r.color >= 0 && r.color <= 0xffffff
      ? r.color
      : DEFAULT_DESIGN.color;
  return {
    // Older saves used a plain "long" bus, which became the articulated one.
    body: oneOf(BODY_TYPES, r.body === 'long' ? 'bendy' : r.body, DEFAULT_DESIGN.body),
    doors: oneOf(DOOR_COUNTS, r.doors, DEFAULT_DESIGN.doors),
    wheels: oneOf(WHEEL_TYPES, r.wheels, DEFAULT_DESIGN.wheels),
    color,
    lights: oneOf(LIGHT_TYPES, r.lights, DEFAULT_DESIGN.lights),
    decor: oneOf(DECOR_TYPES, r.decor, DEFAULT_DESIGN.decor),
    number: normalizeNumber(r.number),
  };
}
