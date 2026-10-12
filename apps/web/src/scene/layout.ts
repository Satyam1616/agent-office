import { AGENTS, type AgentKind } from "../agents";

export const ROOM_W = 11;
const GAP = 1.6;
const COLS = 4;
const MARGIN_BACK = 1.7;
const MARGIN_FRONT = 0.8;

/** A pod is one session's team: 3 x 2 desks. */
const POD_D = 7.2;
const SEAT_DX = 3.2;
const SEAT_DZ = 3.0;

/** Subagents sit alone in "contractor" rows at the front of the room. */
const SUB_DX = 2.6;
const SUB_PER_ROW = 4;
const SUB_ROW_D = 3.2;

/** The chair is in front (+z) of the desk; the character faces the monitor (-z). */
export const SEAT_DZ_CHAIR = 0.95;

export type Vec3 = [number, number, number];

export interface RoomPlan {
  center: Vec3;
  depth: number;
  pods: number;
  subs: number;
}

const roomDepth = (pods: number, subs: number) =>
  MARGIN_BACK + Math.max(1, pods) * POD_D + Math.ceil(subs / SUB_PER_ROW) * SUB_ROW_D + MARGIN_FRONT;

/** Rooms in a 4-wide grid; each grid row is as deep as its deepest room. */
export function planOffice(counts: Record<AgentKind, { pods: number; subs: number }>): Record<AgentKind, RoomPlan> {
  const depths = AGENTS.map((a) => roomDepth(counts[a].pods, counts[a].subs));
  const rows = Math.ceil(AGENTS.length / COLS);
  const rowDepth = Array.from({ length: rows }, (_, r) => Math.max(...depths.slice(r * COLS, (r + 1) * COLS)));
  const total = rowDepth.reduce((a, b) => a + b, 0) + GAP * (rows - 1);

  const plan = {} as Record<AgentKind, RoomPlan>;
  let z = -total / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const agent = AGENTS[i];
      if (!agent) break;
      const depth = depths[i]!;
      plan[agent] = {
        center: [(c - (COLS - 1) / 2) * (ROOM_W + GAP), 0, z + depth / 2],
        depth,
        ...counts[agent],
      };
    }
    z += rowDepth[r]! + GAP;
  }
  return plan;
}

/** Desk position of seat `seat` (0..5) in pod `pod`. */
export function podSeat(room: RoomPlan, pod: number, seat: number): Vec3 {
  const [cx, , cz] = room.center;
  const col = seat % 3;
  const row = Math.floor(seat / 3);
  return [cx + (col - 1) * SEAT_DX, 0, cz - room.depth / 2 + MARGIN_BACK + pod * POD_D + row * SEAT_DZ];
}

/** Front-left of a pod, for its name sign. */
export function podSign(room: RoomPlan, pod: number): Vec3 {
  const [x, , z] = podSeat(room, pod, 0);
  return [x - 1.3, 0.2, z + SEAT_DZ + 1.6];
}

export function subSeat(room: RoomPlan, slot: number): Vec3 {
  const [cx, , cz] = room.center;
  const col = slot % SUB_PER_ROW;
  const row = Math.floor(slot / SUB_PER_ROW);
  const top = cz - room.depth / 2 + MARGIN_BACK + Math.max(1, room.pods) * POD_D;
  return [cx + (col - (SUB_PER_ROW - 1) / 2) * SUB_DX, 0, top + row * SUB_ROW_D];
}

/** Characters walk in from here (front-right corner of the room). */
export function door(room: RoomPlan): Vec3 {
  const [cx, , cz] = room.center;
  return [cx + ROOM_W / 2 - 0.8, 0, cz + room.depth / 2 - 0.3];
}

export const chair = ([x, y, z]: Vec3): Vec3 => [x, y, z + SEAT_DZ_CHAIR];
