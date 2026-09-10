// The turn's phases/steps as shown in the TurnBar segmented track and the
// turn-start walkthrough. Client-only: the reducer treats `activePhase` as an
// opaque string (SET_PHASE just assigns it), so nothing here needs to be shared
// with the server. Promote a bare id list to `shared/` only if the server ever
// drives phase order itself.

export interface PhaseDef {
  /** Canonical string stored in state.activePhase and sent via SET_PHASE. */
  id: string;
  /** Segment label. */
  short: string;
  /** Hover tooltip — plain-language "what happens here". */
  description: string;
}

export const PHASES: PhaseDef[] = [
  { id: "Untap",  short: "Untap",  description: "Untap your permanents. No player gets priority." },
  { id: "Upkeep", short: "Upkeep", description: "Upkeep triggers go on the stack; players may respond." },
  { id: "Draw",   short: "Draw",   description: "Draw for the turn, then players may cast instants." },
  { id: "Main 1", short: "Main 1", description: "Play a land; cast sorceries, creatures, and other non-instants." },
  { id: "Combat", short: "Combat", description: "Declare attackers and blockers, then deal combat damage." },
  { id: "Main 2", short: "Main 2", description: "Second main phase — remaining lands and spells." },
  { id: "End",    short: "End",    description: "End-step triggers, then discard to hand size and cleanup." },
];

/** Phases the turn-start walkthrough steps through before handing back control. */
export const PRECOMBAT_PHASE_IDS = ["Untap", "Upkeep", "Draw", "Main 1"] as const;

// The server inits activePhase to "Main"; PASS_TURN sets "Untap". Map any stray
// spellings onto a canonical id so the sliding highlight always has a home.
const ALIASES: Record<string, string> = {
  Main: "Main 1",
  Main1: "Main 1",
  Main2: "Main 2",
  Beginning: "Untap",
  Cleanup: "End",
};

/** Index into PHASES for a raw activePhase string. Never returns -1. */
export function phaseIndex(raw: string | null | undefined): number {
  if (!raw) return 0;
  const i = PHASES.findIndex((p) => p.id === (ALIASES[raw] ?? raw));
  return i < 0 ? 0 : i;
}
