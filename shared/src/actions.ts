import type { SeatId, Zone } from "./types.js";

/** All table verbs. One flat discriminated union, all handled by applyAction(). */
export type Action =
  | { t: "MOVE"; seat: SeatId; cardIds: string[]; toZone: Zone; toController?: SeatId;
      /** library placement: "top" | "bottom" | numeric index */
      placement?: "top" | "bottom" | number;
      x?: number; y?: number; faceDown?: boolean }
  | { t: "TAP"; seat: SeatId; cardIds: string[]; tapped: boolean }
  | { t: "UNTAP_ALL"; seat: SeatId }
  | { t: "FLIP_FACEDOWN"; seat: SeatId; cardIds: string[]; faceDown: boolean }
  | { t: "TRANSFORM"; seat: SeatId; cardIds: string[] }
  | { t: "SET_COUNTER"; seat: SeatId; cardId: string; key: string; value: number }
  | { t: "DRAW"; seat: SeatId; n: number }
  | { t: "SHUFFLE"; seat: SeatId }
  | { t: "MULLIGAN"; seat: SeatId; bottomCount: number }
  | { t: "SCRY"; seat: SeatId; toBottomIds: string[]; orderTopIds: string[] }
  | { t: "REVEAL"; seat: SeatId; cardIds: string[]; reveal: boolean }
  | { t: "REVEAL_HAND"; seat: SeatId; reveal: boolean }
  | { t: "CREATE_TOKEN"; seat: SeatId; oracleId: string; x?: number; y?: number }
  | { t: "SET_LIFE"; seat: SeatId; targetSeat: SeatId; value: number }
  | { t: "SET_POISON"; seat: SeatId; targetSeat: SeatId; value: number }
  | { t: "SET_ENERGY"; seat: SeatId; targetSeat: SeatId; value: number }
  | { t: "SET_SEAT_COUNTER"; seat: SeatId; targetSeat: SeatId; key: string; value: number }
  | { t: "PASS_TURN"; seat: SeatId }
  | { t: "SET_PHASE"; seat: SeatId; phase: string }
  | { t: "ROLL_DIE"; seat: SeatId; sides: number }
  | { t: "FLIP_COIN"; seat: SeatId }
  | { t: "CHAT"; seat: SeatId; text: string }
  | { t: "RENAME"; seat: SeatId; name: string }
  | { t: "UNTAP_ONE"; seat: SeatId; cardIds: string[] };

/** Payload the server needs to attach when a MOVE/token/draw creates card data. */
export interface ActionContext {
  /** RNG in [0,1); server injects a seeded one for deterministic replay/tests. */
  rng: () => number;
  /** Next monotonic log id. */
  nextLogId: () => number;
  now: () => number;
}
