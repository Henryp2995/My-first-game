export interface Platform {
  id: string;
  x1: number;
  x2: number;
  /** y of the walkable top surface (y grows downward). */
  y: number;
  /** Thickness used for solid collision. */
  height: number;
  /** One-way platforms can be jumped through from below and dropped through with down. */
  oneWay: boolean;
}

export type StageId = 'skyfall' | 'corneria' | 'final';

/** Which procedural backdrop/platform art the client draws. Rendering-only; the sim ignores it. */
export type StageTheme = 'skyfall' | 'corneria' | 'final';

export interface StageCamera {
  /** Default framing point (also the parallax reference). */
  centerX: number;
  centerY: number;
  /** The camera center is clamped to this box. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZoom: number;
  maxZoom: number;
}

/** Reserved for future stage hazards (none are implemented yet). */
export interface StageHazard {
  type: string;
  params?: Record<string, number | string | boolean>;
}

export interface StageDef {
  id: StageId;
  name: string;
  description: string;
  theme: StageTheme;
  /** Collision geometry. Solid platforms block from every side; one-way platforms only from above. */
  platforms: Platform[];
  blastZone: { left: number; right: number; top: number; bottom: number };
  /** Starting positions (feet), one per player slot. Each must sit on a platform top. */
  spawns: { x: number; y: number }[];
  /** Respawn platform positions (feet), one per player slot. */
  respawns: { x: number; y: number }[];
  camera: StageCamera;
  hazards: StageHazard[];
}

export const SKYFALL_ARENA: StageDef = {
  id: 'skyfall',
  name: 'Skyfall Arena',
  description: 'Floating island with two soft platforms. The classic.',
  theme: 'skyfall',
  platforms: [
    { id: 'main', x1: -440, x2: 440, y: 0, height: 90, oneWay: false },
    { id: 'left', x1: -340, x2: -140, y: -175, height: 14, oneWay: true },
    { id: 'right', x1: 140, x2: 340, y: -175, height: 14, oneWay: true },
  ],
  blastZone: { left: -1150, right: 1150, top: -980, bottom: 680 },
  spawns: [
    { x: -260, y: 0 },
    { x: 260, y: 0 },
    { x: -90, y: 0 },
    { x: 90, y: 0 },
  ],
  respawns: [
    { x: -180, y: -400 },
    { x: 180, y: -400 },
    { x: -60, y: -440 },
    { x: 60, y: -440 },
  ],
  camera: { centerX: 0, centerY: -180, minX: -620, maxX: 620, minY: -560, maxY: 60, minZoom: 0.55, maxZoom: 1.05 },
  hazards: [],
};

/**
 * A long starship cruising over a city. The deck steps down at the nose and up at the rear —
 * built from flat solid platforms (steps of 40px, which fighters walk up automatically).
 */
export const CORNERIA: StageDef = {
  id: 'corneria',
  name: 'Corneria',
  description: 'A long starship deck with a lower nose, raised rear deck and a tail fin.',
  theme: 'corneria',
  platforms: [
    { id: 'nose', x1: -720, x2: -560, y: 40, height: 50, oneWay: false },
    { id: 'deck', x1: -560, x2: 260, y: 0, height: 80, oneWay: false },
    { id: 'rear', x1: 260, x2: 470, y: -40, height: 120, oneWay: false },
    { id: 'cockpit', x1: -320, x2: -120, y: -165, height: 14, oneWay: true },
    { id: 'fin', x1: 310, x2: 440, y: -235, height: 14, oneWay: true },
  ],
  blastZone: { left: -1380, right: 1150, top: -1020, bottom: 700 },
  spawns: [
    { x: -380, y: 0 },
    { x: 160, y: 0 },
    { x: -150, y: 0 },
    { x: 360, y: -40 },
  ],
  respawns: [
    { x: -300, y: -420 },
    { x: 100, y: -420 },
    { x: -180, y: -460 },
    { x: 260, y: -460 },
  ],
  camera: { centerX: -125, centerY: -180, minX: -760, maxX: 520, minY: -580, maxY: 60, minZoom: 0.52, maxZoom: 1.05 },
  hazards: [],
};

/** One big flat symmetrical platform floating in space. No platforms, no hazards. */
export const FINAL_DESTINATION: StageDef = {
  id: 'final',
  name: 'Final Destination',
  description: 'One wide flat platform in deep space. No platforms, no excuses.',
  theme: 'final',
  platforms: [
    { id: 'main', x1: -520, x2: 520, y: 0, height: 110, oneWay: false },
  ],
  blastZone: { left: -1250, right: 1250, top: -1050, bottom: 720 },
  spawns: [
    { x: -280, y: 0 },
    { x: 280, y: 0 },
    { x: -100, y: 0 },
    { x: 100, y: 0 },
  ],
  respawns: [
    { x: -200, y: -400 },
    { x: 200, y: -400 },
    { x: -70, y: -440 },
    { x: 70, y: -440 },
  ],
  camera: { centerX: 0, centerY: -170, minX: -660, maxX: 660, minY: -580, maxY: 60, minZoom: 0.52, maxZoom: 1.05 },
  hazards: [],
};

export const STAGES: Record<StageId, StageDef> = {
  skyfall: SKYFALL_ARENA,
  corneria: CORNERIA,
  final: FINAL_DESTINATION,
};
export const STAGE_ORDER: StageId[] = ['skyfall', 'corneria', 'final'];

export function getStage(id: string | undefined): StageDef {
  return (id && STAGES[id as StageId]) || SKYFALL_ARENA;
}

/** Left/right extent of all solid ground (the "stage" you can be knocked off of). */
export function solidExtent(stage: StageDef): { x1: number; x2: number } {
  let x1 = Infinity;
  let x2 = -Infinity;
  for (const p of stage.platforms) {
    if (p.oneWay) continue;
    x1 = Math.min(x1, p.x1);
    x2 = Math.max(x2, p.x2);
  }
  return { x1, x2 };
}

/** Top of the highest solid surface covering x (smallest y), or null over a gap. */
export function solidSurfaceAt(stage: StageDef, x: number): number | null {
  let top: number | null = null;
  for (const p of stage.platforms) {
    if (p.oneWay || x < p.x1 || x > p.x2) continue;
    if (top === null || p.y < top) top = p.y;
  }
  return top;
}
