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

test("DRAW n larger than the library draws only what's left, no duplication", () => {
  const s = mkState(); // Alice: 3 in library, 1 in hand
  const before = s.seats.flatMap((x) => x.cards).length;
  applyAction(s, { t: "DRAW", seat: "A", n: 7 } as Action, ctx());
  const hand = s.seats[0].cards.filter((c) => c.zone === "hand");
  const lib = s.seats[0].cards.filter((c) => c.zone === "library");
  assert.equal(hand.length, 4);
  assert.equal(lib.length, 0);
  assert.equal(s.seats.flatMap((x) => x.cards).length, before);
  assert.ok(hand.every((c) => !c.faceDown));
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

// ---- fx payloads (drive client-side animation; must not lie about outcomes) ----

const lastFx = (s: GameState) => s.log[s.log.length - 1].fx;

test("FLIP_COIN fx.heads agrees with the log text", () => {
  for (let i = 0; i < 50; i++) {
    const s = mkState();
    applyAction(s, { t: "FLIP_COIN", seat: "A" } as Action, ctx());
    const line = s.log[s.log.length - 1];
    assert.equal(line.fx?.k, "coin");
    const heads = line.fx?.k === "coin" && line.fx.heads;
    assert.equal(line.text.endsWith(heads ? "Heads" : "Tails"), true);
  }
});

test("ROLL_DIE fx.value is in range and matches the log text", () => {
  for (let sides of [2, 6, 20, 100]) {
    for (let i = 0; i < 25; i++) {
      const s = mkState();
      applyAction(s, { t: "ROLL_DIE", seat: "A", sides } as Action, ctx());
      const line = s.log[s.log.length - 1];
      assert.equal(line.fx?.k, "die");
      if (line.fx?.k !== "die") continue;
      assert.ok(line.fx.value >= 1 && line.fx.value <= sides, `value ${line.fx.value} out of 1..${sides}`);
      assert.equal(line.fx.sides, sides);
      assert.equal(line.text, `Alice rolls d${sides}: ${line.fx.value}`);
    }
  }
});

test("DRAW fx.cardIds are exactly the cards that landed in hand", () => {
  const s = mkState();
  const libIds = s.seats[0].cards.filter(c => c.zone === "library")
    .sort((a, b) => a.order - b.order).map(c => c.id);
  applyAction(s, { t: "DRAW", seat: "A", n: 2 } as Action, ctx());
  const fx = lastFx(s);
  assert.equal(fx?.k, "draw");
  if (fx?.k !== "draw") return;
  assert.deepEqual([...fx.cardIds].sort(), libIds.slice(-2).sort());
  // every id it names is now in hand
  for (const id of fx.cardIds)
    assert.equal(s.seats[0].cards.find(c => c.id === id)!.zone, "hand");
});

test("MOVE fx.from is the pre-move zone, not the destination", () => {
  const s = mkState(); // a4 starts in hand
  applyAction(s, { t: "MOVE", seat: "A", cardIds: ["a4"], toZone: "battlefield", x: 0.5, y: 0.5 } as Action, ctx());
  const fx = lastFx(s);
  assert.equal(fx?.k, "move");
  if (fx?.k !== "move") return;
  assert.equal(fx.from, "hand");
  assert.equal(fx.to, "battlefield");
  assert.deepEqual(fx.cardIds, ["a4"]);
});

test("SHUFFLE and MULLIGAN emit an fx for the acting seat", () => {
  const sh = mkState();
  applyAction(sh, { t: "SHUFFLE", seat: "A" } as Action, ctx());
  assert.deepEqual(lastFx(sh), { k: "shuffle", seat: "A" });

  const mu = mkState();
  applyAction(mu, { t: "MULLIGAN", seat: "A", bottomCount: 1 } as Action, ctx());
  const fx = lastFx(mu);
  assert.equal(fx?.k, "mulligan");
  if (fx?.k !== "mulligan") return;
  assert.equal(fx.seat, "A");
  assert.equal(fx.cardIds.length, mu.seats[0].cards.filter(c => c.zone === "hand").length);
});

test("SET_LIFE fx.delta matches the change from the previous total", () => {
  const s = mkState(); // Alice at 20
  applyAction(s, { t: "SET_LIFE", seat: "A", targetSeat: "A", value: 17 } as Action, ctx());
  assert.deepEqual(lastFx(s), { k: "life", seat: "A", targetSeat: "A", delta: -3, value: 17 });
});

test("fx is trimmed from old log entries but kept on recent ones", () => {
  const s = mkState();
  const c = ctx();
  for (let i = 0; i < 40; i++) applyAction(s, { t: "FLIP_COIN", seat: "A" } as Action, c);
  const withFx = s.log.filter((e) => e.fx);
  assert.ok(withFx.length <= 33, `expected <=33 fx entries, got ${withFx.length}`);
  assert.ok(s.log[s.log.length - 1].fx, "newest entry must still carry fx");
  assert.ok(!s.log[0].fx, "oldest entry must have had its fx trimmed");
});

test("UNTAP_ALL fx lists only the cards that were actually tapped", () => {
  const s = mkState();
  s.seats[0].cards.push(
    { id: "t1", oracleId: "o_t1", owner: "A", controller: "A", zone: "battlefield",
      tapped: true, faceDown: false, flipped: false, counters: {}, order: 0 },
    { id: "t2", oracleId: "o_t2", owner: "A", controller: "A", zone: "battlefield",
      tapped: false, faceDown: false, flipped: false, counters: {}, order: 1 },
  );
  applyAction(s, { t: "UNTAP_ALL", seat: "A" } as Action, ctx());
  const fx = lastFx(s);
  assert.equal(fx?.k, "untapAll");
  if (fx?.k !== "untapAll") return;
  assert.deepEqual(fx.cardIds, ["t1"]);
});
