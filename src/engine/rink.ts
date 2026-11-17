/**
 * Shared rink layout in simulation metres (x along the length, z across).
 * Used by the spatial engine for faceoff dots and stoppage choreography and by
 * the 3D arena for benches, penalty boxes and markings, so both always agree.
 */
export const RINK = {
  /** Half length / half width of the playable surface the engine clamps to. */
  halfLength: 29,
  halfWidth: 12,
  /** Boards (visual) half length / half width. */
  boardsX: 30.5,
  boardsZ: 13.2,
  /** Goal line and goalie crease position. */
  goalLine: 26,
  goalieX: 25,
  /** End-zone faceoff dots and blue lines. */
  dotX: 20.5,
  dotZ: 6.7,
  blueLine: 9,
} as const;

/** Player benches sit behind the boards on the -z side: home left, away right. */
export const BENCH = {
  centerX: [-8.5, 8.5],
  halfLength: 6.2,
  /** Line on the ice just in front of the bench, used for fist-bump lines. */
  frontZ: -11.4,
  /** Gate where players step on and off the ice. */
  doorZ: -12.4,
  seatZ: -14.55,
  seatY: 0.48,
} as const;

/** Penalty boxes sit across the ice from the benches. */
export const PENALTY_BOX = {
  centerX: [-3.2, 3.2],
  seatZ: 14.55,
  doorZ: 12.4,
} as const;

export type Dot = { x: number; z: number };
export const CENTER_DOT: Dot = { x: 0, z: 0 };
