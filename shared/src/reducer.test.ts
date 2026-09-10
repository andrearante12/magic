import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "./reducer.ts";
import { redactFor } from "./redact.ts";
import type { Action, ActionContext, CardDict, GameState } from "./index.ts";

function mkState(): GameState {
  const mk = (id: string, owner: string, zone: any, order: number) => ({
    id, oracleId: `o_${id}`, owner, controller: owner, zone,
    tapped: false, faceDown: zone === "library", flipped: false, counters: {}, order,
  });
  return {
    roomCode: "TEST",
    settings: { gamemode: "duel", maxPlayers: 2, startingLife: 20 },
    version: 0, turn: "A", turnNumber: 1, activePhase: "Main", log: [],
    seats: [
      { id: "A", name: "Alice", connected: true, life: 20, poison: 0, energy: 0, counters: {},
        library_loaded: true,
        cards: [mk("a1","A","library",0), mk("a2","A","library",1), mk("a3","A","library",2),
                mk("a4","A","hand",0)] },
      { id: "B", name: "Bob", connected: true, life: 20, poison: 0, energy: 0, counters: {},
        library_loaded: true,
        cards: [mk("b1","B","library",0), mk("b2","B","hand",0)] },
    ],
  };
}

const ctx = (): ActionContext => {
  let n = 1; let seed = 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  return { rng, nextLogId: () => n++, now: () => 0 };
};

test("DRAW moves top of library to hand, preserving total count", () => {
  const s = mkState();
  const before = s.seats.flatMap(x => x.cards).length;
  applyAction(s, { t: "DRAW", seat: "A", n: 2 } as Action, ctx());
  const hand = s.seats[0].cards.filter(c => c.zone === "hand");
  assert.equal(hand.length, 3);
  assert.equal(s.seats.flatMap(x => x.cards).length, before);
});

test("SHUFFLE is a permutation of the same card ids", () => {
  const s = mkState();
  const ids = new Set(s.seats[0].cards.filter(c => c.zone === "library").map(c => c.id));
  applyAction(s, { t: "SHUFFLE", seat: "A" } as Action, ctx());
  const after = new Set(s.seats[0].cards.filter(c => c.zone === "library").map(c => c.id));
  assert.deepEqual([...after].sort(), [...ids].sort());
});

test("MOVE to battlefield sets normalized coords and clears library face-down", () => {
  const s = mkState();
  applyAction(s, { t: "MOVE", seat: "A", cardIds: ["a4"], toZone: "battlefield", x: 0.3, y: 0.7 } as Action, ctx());
  const c = s.seats[0].cards.find(x => x.id === "a4")!;
  assert.equal(c.zone, "battlefield");
  assert.equal(c.x, 0.3);
});

test("redaction never leaks a hidden card's oracleId", () => {
  const s = mkState();
  const dict: CardDict = {};
  for (const seat of s.seats) for (const c of seat.cards)
    dict[`o_${c.id}`] = { oracleId: `o_${c.id}`, name: c.id, typeLine: "", manaCost: "",
      oracleText: "", colors: [], cmc: 0, layout: "normal", image: "" };
  const view = redactFor(s, dict, "B"); // Bob viewing
  const aliceHand = view.state.seats[0].cards.filter(c => c.zone === "hand");
  assert.ok(aliceHand.every(c => c.oracleId === "" && c.hidden));
  const aliceLib = view.state.seats[0].cards.filter(c => c.zone === "library");
  assert.ok(aliceLib.every(c => c.oracleId === ""));
  assert.ok(!("o_a4" in view.dict), "hidden card must not appear in shipped dict");
  // Bob still sees his own hand.
  assert.equal(view.state.seats[1].cards.find(c => c.zone === "hand")!.oracleId, "o_b2");
});

test("PASS_TURN advances seat and untaps next player", () => {
  const s = mkState();
  s.seats[1].cards.push({ id: "b3", oracleId: "o_b3", owner: "B", controller: "B",
    zone: "battlefield", tapped: true, faceDown: false, flipped: false, counters: {}, order: 0 });
  applyAction(s, { t: "PASS_TURN", seat: "A" } as Action, ctx());
  assert.equal(s.turn, "B");
  assert.equal(s.seats[1].cards.find(c => c.id === "b3")!.tapped, false);
});
