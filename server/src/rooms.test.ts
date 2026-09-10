import { test } from "node:test";
import assert from "node:assert/strict";
import type { Seat } from "@mtg/shared";
import { createRoom, getRoom, normalizeCode, Room } from "./rooms.ts";
import { DEFAULT_SETTINGS } from "@mtg/shared";

const mkSeat = (id: string): Seat => ({
  id, name: id, connected: false, life: 40, poison: 0, energy: 0,
  counters: {}, cards: [], library_loaded: true,
});

test("createRoom returns a fresh 6-char code and carries settings", () => {
  const a = createRoom(DEFAULT_SETTINGS.commander);
  const b = createRoom(DEFAULT_SETTINGS.commander);
  assert.match(a.code, /^[A-Z0-9]{6}$/);
  assert.notEqual(a.code, b.code);
  assert.equal(a.settings.startingLife, 40);
  assert.equal(getRoom(a.code), a);
});

test("getRoom returns undefined for unknown codes (no implicit creation)", () => {
  assert.equal(getRoom("ZZZZZZ"), undefined);
  assert.equal(normalizeCode(" ab-cd!ef2 "), "ABCDEF");
});

test("join rejects a full room before any deck resolution", async () => {
  const room = createRoom({ gamemode: "duel", maxPlayers: 2, startingLife: 20 });
  room.state.seats.push(mkSeat("seat_1"), mkSeat("seat_2"));
  const { clientId } = room.addClient(() => {}, null);
  const r = await room.join(clientId, { name: "Third", deck: { text: "4 Lightning Bolt" } });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "room_full");
});

test("join reconnects by seatId without needing a deck", async () => {
  const room = createRoom(DEFAULT_SETTINGS.commander);
  room.state.seats.push(mkSeat("seat_1"));
  const { clientId } = room.addClient(() => {}, null);
  const r = await room.join(clientId, { name: "Back", seatId: "seat_1" });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.seatId, "seat_1");
  assert.equal(room.state.seats[0].connected, true);
});

test("join without a deck choice is rejected for a new seat", async () => {
  const room = createRoom(DEFAULT_SETTINGS.duel);
  const { clientId } = room.addClient(() => {}, null);
  const r = await room.join(clientId, { name: "NoDeck" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, "deck_invalid");
});

test("reapable: empty+joined after 10m, never-joined after 15m", () => {
  const room = new Room("ABCDEF", DEFAULT_SETTINGS.duel);
  const t0 = room.createdAt;
  assert.equal(room.reapable(t0 + 60_000), false); // fresh, never joined
  assert.equal(room.reapable(t0 + 16 * 60_000), true); // never joined, stale
  room.everJoined = true;
  room.emptySince = t0 + 20 * 60_000;
  assert.equal(room.reapable(t0 + 25 * 60_000), false); // only 5m empty
  assert.equal(room.reapable(t0 + 31 * 60_000), true); // >10m empty
});
