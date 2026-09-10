// Core shared types for the MTG tabletop. No rules engine — this is a shared,
// authoritative document of where every card is and how it's oriented.

export type SeatId = string;

/** Lobby gamemode. Commander is a lobby preset (seats + life) for now, not rules. */
export type Gamemode = "duel" | "commander";

/** Room lobby settings, chosen at creation and carried in every broadcast. */
export interface RoomSettings {
  gamemode: Gamemode;
  /** duel: exactly 2 ; commander: 2..6 */
  maxPlayers: number;
  startingLife: number;
}

export type Zone =
  | "library"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "command"
  | "revealed";

/** Static card data resolved from Scryfall, keyed by oracleId in the card cache. */
export interface CardData {
  oracleId: string;
  name: string;
  typeLine: string;
  manaCost: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors: string[];
  cmc: number;
  layout: string;
  /** Front image (normal size). */
  image: string;
  /** For DFC / modal / flip cards: [front, back] face images + text. */
  faces?: CardFace[];
  isToken?: boolean;
}

export interface CardFace {
  name: string;
  typeLine: string;
  manaCost: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image: string;
}

/** A physical card on the table. Its identity (oracleId) may be redacted per-viewer. */
export interface CardInstance {
  id: string;
  /** Redacted to "" for cards the viewer may not see; `hidden` is then true. */
  oracleId: string;
  hidden?: boolean;
  owner: SeatId;
  /** Whose zone it currently sits in (control), usually === owner. */
  controller: SeatId;
  zone: Zone;
  /** Battlefield only: normalized 0..1 within the controller's half of the table. */
  x?: number;
  y?: number;
  tapped: boolean;
  faceDown: boolean;
  /** Individually shown to everyone (e.g. revealed from hand / library). */
  revealed?: boolean;
  /** DFC currently showing its back face. */
  flipped: boolean;
  counters: Record<string, number>;
  /** Visual attachment (auras / equipment); no rules meaning. */
  attachedTo?: string;
  /** Stacking order within a zone (higher = on top / later). */
  order: number;
}

export interface Seat {
  id: SeatId;
  name: string;
  connected: boolean;
  life: number;
  poison: number;
  energy: number;
  /** Arbitrary named counters shown by the life widget (experience, tickets…). */
  counters: Record<string, number>;
  /** Every card this seat owns, across all zones. */
  cards: CardInstance[];
  /** oracleId -> CardData for everything this seat has imported. */
  library_loaded: boolean;
}

/**
 * Structured description of what an action did, attached to the log entry it
 * produced. Purely cosmetic — the client turns these into animations. Never
 * carries anything redaction would strip: card `id`s are always public (only
 * `oracleId` is hidden), and everything else here is a seat id or a number.
 */
export type Fx =
  | { k: "shuffle"; seat: SeatId }
  | { k: "draw"; seat: SeatId; cardIds: string[] }
  | { k: "mulligan"; seat: SeatId; cardIds: string[] }
  | { k: "move"; seat: SeatId; cardIds: string[]; from: Zone; to: Zone; toController: SeatId }
  | { k: "coin"; seat: SeatId; heads: boolean }
  | { k: "die"; seat: SeatId; sides: number; value: number }
  | { k: "tap"; seat: SeatId; cardIds: string[]; tapped: boolean }
  | { k: "untapAll"; seat: SeatId; cardIds: string[] }
  | { k: "flip"; seat: SeatId; cardIds: string[]; kind: "transform" | "facedown" }
  | { k: "life"; seat: SeatId; targetSeat: SeatId; delta: number; value: number }
  | { k: "counter"; seat: SeatId; cardId: string; key: string; delta: number };

export interface LogEntry {
  id: number;
  seat: SeatId | null;
  text: string;
  ts: number;
  kind: "action" | "chat" | "system";
  /** Optional structured effect for client-side animation. */
  fx?: Fx;
}

export interface GameState {
  roomCode: string;
  settings: RoomSettings;
  seats: Seat[];
  turn: SeatId | null;
  turnNumber: number;
  activePhase: string;
  log: LogEntry[];
  /** Monotonic version, bumped on every applied action. */
  version: number;
}

/** Card data dictionary shipped alongside state (only for non-hidden cards). */
export type CardDict = Record<string, CardData>;
