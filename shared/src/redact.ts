import type { CardDict, CardInstance, GameState, SeatId } from "./types.js";

/**
 * Return a copy of `state` safe to send to `viewer`, plus the card-data dict for
 * exactly the cards that viewer is allowed to identify. Redaction happens here,
 * server-side, and never on the client — a client physically never receives a
 * hidden card's oracleId.
 *
 * Visible to a viewer:
 *  - any card on the battlefield / graveyard / exile / command that is face up
 *  - the viewer's own hand (always) and own library order is hidden but face-up
 *    identity of library cards is NOT sent
 *  - another seat's hand only if that seat revealed it
 *  - any card individually revealed (faceDown === false in a hidden zone)
 */
export function redactFor(
  state: GameState,
  fullDict: CardDict,
  viewer: SeatId,
): { state: GameState; dict: CardDict } {
  const dict: CardDict = {};
  const seats = state.seats.map((seat) => {
    const handRevealed = (seat as any).__revealHand === true;
    const cards = seat.cards.map((c): CardInstance => {
      const visible = isVisible(c, viewer, seat.id, handRevealed);
      if (visible && c.oracleId) {
        const d = fullDict[c.oracleId];
        if (d) dict[c.oracleId] = d;
        return { ...c };
      }
      // Redact identity; keep position / orientation / counters.
      return { ...c, oracleId: "", hidden: true };
    });
    const { __revealHand, ...cleanSeat } = seat as any;
    return { ...cleanSeat, cards };
  });

  return { state: { ...state, seats }, dict };
}

function isVisible(
  c: CardInstance,
  viewer: SeatId,
  seatId: SeatId,
  handRevealed: boolean,
): boolean {
  switch (c.zone) {
    case "library":
      return false; // order is authoritative on server; identity never shipped
    case "hand":
      return seatId === viewer || handRevealed || c.revealed === true;
    case "battlefield":
      // Face-down permanents: only the controller/owner may see identity.
      if (c.faceDown) return c.owner === viewer || c.controller === viewer;
      return true;
    case "graveyard":
    case "exile":
    case "command":
    case "revealed":
      return !c.faceDown || c.revealed === true || c.owner === viewer;
    default:
      return false;
  }
}
