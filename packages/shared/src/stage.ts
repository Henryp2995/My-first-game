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

export interface StageDef {
  id: string;
  name: string;
  platforms: Platform[];
  blastZone: { left: number; right: number; top: number; bottom: number };
  spawns: { x: number; y: number }[];
  respawns: { x: number; y: number }[];
}

export const SKYFALL_ARENA: StageDef = {
  id: 'skyfall',
  name: 'Skyfall Arena',
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
};

export const STAGES: Record<string, StageDef> = { [SKYFALL_ARENA.id]: SKYFALL_ARENA };
