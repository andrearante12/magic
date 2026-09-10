import type { Action, ActionContext } from "./actions.js";
import type { CardInstance, GameState, LogEntry, Seat, Zone } from "./types.js";

/** Fisher–Yates using the injected RNG so shuffles are testable / replayable. */
function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

const seatOf = (s: GameState, id: string | null | undefined) =>
  s.seats.find((x) => x.id === id);

const allCards = (s: GameState) => s.seats.flatMap((seat) => seat.cards);

const findCard = (s: GameState, cardId: string): CardInstance | undefined =>
  allCards(s).find((c) => c.id === cardId);

/** Cards in a zone for a controller, sorted by their stacking order. */
function zoneCards(s: GameState, controller: string, zone: Zone): CardInstance[] {
  return allCards(s)
    .filter((c) => c.controller === controller && c.zone === zone)
    .sort((a, b) => a.order - b.order);
}

function nextOrder(s: GameState, controller: string, zone: Zone): number {
  const cs = zoneCards(s, controller, zone);
  return cs.length ? cs[cs.length - 1].order + 1 : 0;
}

function log(
  s: GameState,
  ctx: ActionContext,
  seat: string | null,
  text: string,
  kind: LogEntry["kind"] = "action",
): void {
  s.log.push({ id: ctx.nextLogId(), seat, text, ts: ctx.now(), kind });
  if (s.log.length > 500) s.log.splice(0, s.log.length - 500);
}

const nameOf = (s: GameState, id: string | null) =>
  seatOf(s, id)?.name ?? "Someone";

/**
 * Apply an action to `state`, mutating it in place. The caller (server) is
 * responsible for cloning first if it wants immutability and for redacting the
 * result per-viewer. Returns the mutated state for convenience.
 */
export function applyAction(
  state: GameState,
  action: Action,
  ctx: ActionContext,
): GameState {
  const s = state;
  const who = nameOf(s, action.seat);

  switch (action.t) {
    case "MOVE": {
      const toController = action.toController ?? action.seat;
      const moved: string[] = [];
      for (const cardId of action.cardIds) {
        const card = findCard(s, cardId);
        if (!card) continue;
        card.zone = action.toZone;
        card.controller = toController;
        card.tapped = action.toZone === "battlefield" ? card.tapped : false;
        if (action.faceDown !== undefined) card.faceDown = action.faceDown;
        if (action.toZone !== "battlefield") {
          card.x = undefined;
          card.y = undefined;
          card.faceDown = action.toZone === "library" ? true : card.faceDown;
        }
        if (action.toZone === "battlefield") {
          card.x = action.x ?? card.x ?? 0.5;
          card.y = action.y ?? card.y ?? 0.5;
        }
        // Library placement.
        if (action.toZone === "library") {
          const lib = zoneCards(s, toController, "library");
          if (action.placement === "bottom") {
            card.order = (lib[0]?.order ?? 0) - 1;
          } else if (typeof action.placement === "number") {
            card.order = (lib[action.placement]?.order ?? 0) - 0.5;
          } else {
            card.order = nextOrder(s, toController, "library");
          }
        } else {
          card.order = nextOrder(s, toController, action.toZone);
        }
        moved.push(cardId);
      }
      if (moved.length)
        log(s, ctx, action.seat, `${who} moves ${moved.length} card(s) to ${action.toZone}`);
      break;
    }

    case "TAP": {
      for (const id of action.cardIds) {
        const c = findCard(s, id);
        if (c) c.tapped = action.tapped;
      }
      log(s, ctx, action.seat, `${who} ${action.tapped ? "taps" : "untaps"} ${action.cardIds.length} card(s)`);
      break;
    }

    case "UNTAP_ONE": {
      for (const id of action.cardIds) {
        const c = findCard(s, id);
        if (c) c.tapped = false;
      }
      break;
    }

    case "UNTAP_ALL": {
      for (const c of zoneCards(s, action.seat, "battlefield")) c.tapped = false;
      log(s, ctx, action.seat, `${who} untaps everything`);
      break;
    }

    case "FLIP_FACEDOWN": {
      for (const id of action.cardIds) {
        const c = findCard(s, id);
        if (c) c.faceDown = action.faceDown;
      }
      log(s, ctx, action.seat, `${who} turns ${action.cardIds.length} card(s) ${action.faceDown ? "face down" : "face up"}`);
      break;
    }

    case "TRANSFORM": {
      for (const id of action.cardIds) {
        const c = findCard(s, id);
        if (c) c.flipped = !c.flipped;
      }
      log(s, ctx, action.seat, `${who} transforms a card`);
      break;
    }

    case "SET_COUNTER": {
      const c = findCard(s, action.cardId);
      if (c) {
        if (action.value <= 0) delete c.counters[action.key];
        else c.counters[action.key] = action.value;
        log(s, ctx, action.seat, `${who} sets ${action.key} counters to ${action.value}`);
      }
      break;
    }

    case "DRAW": {
      const lib = zoneCards(s, action.seat, "library");
      const top = lib.slice(-action.n);
      for (const c of top) {
        c.zone = "hand";
        c.faceDown = false;
        c.order = nextOrder(s, action.seat, "hand");
      }
      log(s, ctx, action.seat, `${who} draws ${top.length}`);
      break;
    }

    case "SHUFFLE": {
      const lib = zoneCards(s, action.seat, "library");
      const orders = lib.map((c) => c.order);
      shuffleInPlace(lib, ctx.rng);
      lib.forEach((c, i) => (c.order = orders[i]));
      for (const c of lib) c.faceDown = true;
      log(s, ctx, action.seat, `${who} shuffles their library`);
      break;
    }

    case "MULLIGAN": {
      // London mulligan: everything from hand + battlefield-nothing back, reshuffle,
      // draw 7, then the player will bottom `bottomCount` via a follow-up MOVE.
      const hand = zoneCards(s, action.seat, "hand");
      for (const c of hand) {
        c.zone = "library";
        c.faceDown = true;
        c.order = nextOrder(s, action.seat, "library");
      }
      const lib = zoneCards(s, action.seat, "library");
      const orders = lib.map((c) => c.order);
      shuffleInPlace(lib, ctx.rng);
      lib.forEach((c, i) => (c.order = orders[i]));
      const draw = lib.slice(-7);
      for (const c of draw) {
        c.zone = "hand";
        c.faceDown = false;
        c.order = nextOrder(s, action.seat, "hand");
      }
      log(s, ctx, action.seat, `${who} mulligans (will bottom ${action.bottomCount})`);
      break;
    }

    case "SCRY": {
      const bottom = new Set(action.toBottomIds);
      for (const id of action.toBottomIds) {
        const c = findCard(s, id);
        if (c) c.order = (zoneCards(s, action.seat, "library")[0]?.order ?? 0) - 1 - Math.random();
      }
      action.orderTopIds.forEach((id, i) => {
        const c = findCard(s, id);
        if (c && !bottom.has(id)) {
          const libTop = nextOrder(s, action.seat, "library");
          c.order = libTop + i;
        }
      });
      log(s, ctx, action.seat, `${who} scries (${action.toBottomIds.length} to bottom)`);
      break;
    }

    case "REVEAL": {
      for (const id of action.cardIds) {
        const c = findCard(s, id);
        if (c) c.revealed = action.reveal;
      }
      log(s, ctx, action.seat, `${who} ${action.reveal ? "reveals" : "hides"} ${action.cardIds.length} card(s)`);
      break;
    }

    case "REVEAL_HAND": {
      const seat = seatOf(s, action.seat);
      if (seat) (seat as any).__revealHand = action.reveal;
      log(s, ctx, action.seat, `${who} ${action.reveal ? "reveals" : "hides"} their hand`);
      break;
    }

    case "CREATE_TOKEN": {
      const seat = seatOf(s, action.seat);
      if (seat) {
        seat.cards.push({
          id: `tok_${Math.floor(ctx.rng() * 1e9).toString(36)}`,
          oracleId: action.oracleId,
          owner: action.seat,
          controller: action.seat,
          zone: "battlefield",
          x: action.x ?? 0.5,
          y: action.y ?? 0.5,
          tapped: false,
          faceDown: false,
          flipped: false,
          counters: {},
          order: nextOrder(s, action.seat, "battlefield"),
        });
        log(s, ctx, action.seat, `${who} creates a token`);
      }
      break;
    }

    case "SET_LIFE": {
      const t = seatOf(s, action.targetSeat);
      if (t) { const d = action.value - t.life; t.life = action.value;
        log(s, ctx, action.seat, `${nameOf(s, action.targetSeat)} life ${d >= 0 ? "+" : ""}${d} → ${action.value}`); }
      break;
    }
    case "SET_POISON": {
      const t = seatOf(s, action.targetSeat);
      if (t) { t.poison = action.value;
        log(s, ctx, action.seat, `${nameOf(s, action.targetSeat)} poison → ${action.value}`); }
      break;
    }
    case "SET_ENERGY": {
      const t = seatOf(s, action.targetSeat);
      if (t) { t.energy = action.value;
        log(s, ctx, action.seat, `${nameOf(s, action.targetSeat)} energy → ${action.value}`); }
      break;
    }
    case "SET_SEAT_COUNTER": {
      const t = seatOf(s, action.targetSeat);
      if (t) {
        if (action.value <= 0) delete t.counters[action.key];
        else t.counters[action.key] = action.value;
        log(s, ctx, action.seat, `${nameOf(s, action.targetSeat)} ${action.key} → ${action.value}`);
      }
      break;
    }

    case "PASS_TURN": {
      const idx = s.seats.findIndex((x) => x.id === s.turn);
      const next = s.seats[(idx + 1) % s.seats.length] ?? s.seats[0];
      s.turn = next?.id ?? null;
      s.turnNumber += 1;
      s.activePhase = "Untap";
      if (next) for (const c of zoneCards(s, next.id, "battlefield")) c.tapped = false;
      log(s, ctx, action.seat, `— Turn ${s.turnNumber}: ${next?.name ?? "?"} —`, "system");
      break;
    }
    case "SET_PHASE": {
      s.activePhase = action.phase;
      break;
    }

    case "ROLL_DIE": {
      const r = 1 + Math.floor(ctx.rng() * action.sides);
      log(s, ctx, action.seat, `${who} rolls d${action.sides}: ${r}`);
      break;
    }
    case "FLIP_COIN": {
      log(s, ctx, action.seat, `${who} flips a coin: ${ctx.rng() < 0.5 ? "Heads" : "Tails"}`);
      break;
    }

    case "CHAT": {
      log(s, ctx, action.seat, action.text, "chat");
      break;
    }
    case "RENAME": {
      const seat = seatOf(s, action.seat);
      if (seat) { const old = seat.name; seat.name = action.name.slice(0, 24);
        log(s, ctx, action.seat, `${old} is now ${seat.name}`, "system"); }
      break;
    }
  }

  s.version += 1;
  return s;
}

export { shuffleInPlace, zoneCards };
