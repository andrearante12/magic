import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, checkDeck, DEFAULT_SETTINGS } from "./settings.ts";

test("defaults pass through untouched", () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS.duel), DEFAULT_SETTINGS.duel);
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS.commander), DEFAULT_SETTINGS.commander);
});

test("unknown gamemode falls back to duel", () => {
  const s = normalizeSettings({ gamemode: "chaos", maxPlayers: 4, startingLife: 30 });
  assert.equal(s.gamemode, "duel");
  assert.equal(s.maxPlayers, 2); // duel is clamped to exactly 2
  assert.equal(s.startingLife, 30);
});

test("duel player count is clamped to 2 regardless of input", () => {
  assert.equal(normalizeSettings({ gamemode: "duel", maxPlayers: 6 }).maxPlayers, 2);
  assert.equal(normalizeSettings({ gamemode: "duel", maxPlayers: 1 }).maxPlayers, 2);
});

test("commander player count clamps to 2..6", () => {
  assert.equal(normalizeSettings({ gamemode: "commander", maxPlayers: 99 }).maxPlayers, 6);
  assert.equal(normalizeSettings({ gamemode: "commander", maxPlayers: 1 }).maxPlayers, 2);
  assert.equal(normalizeSettings({ gamemode: "commander", maxPlayers: 3 }).maxPlayers, 3);
});

test("starting life clamps to 1..200 and rounds", () => {
  assert.equal(normalizeSettings({ gamemode: "duel", startingLife: -5 }).startingLife, 1);
  assert.equal(normalizeSettings({ gamemode: "duel", startingLife: 9999 }).startingLife, 200);
  assert.equal(normalizeSettings({ gamemode: "duel", startingLife: 20.7 }).startingLife, 21);
});

test("missing / garbage input yields the duel default", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS.duel);
  assert.deepEqual(normalizeSettings("nonsense"), DEFAULT_SETTINGS.duel);
  assert.deepEqual(normalizeSettings({ maxPlayers: "abc", startingLife: null }), DEFAULT_SETTINGS.duel);
});

test("checkDeck enforces the commander requirement", () => {
  const cmdr = DEFAULT_SETTINGS.commander;
  assert.equal(checkDeck({ main: [{ count: 99, name: "x" }], commanders: [] }, cmdr).ok, false);
  assert.equal(
    checkDeck({ main: [{ count: 99, name: "x" }], commanders: [{ count: 1, name: "c" }] }, cmdr).ok,
    true,
  );
  // Duel has no commander requirement.
  assert.equal(checkDeck({ main: [{ count: 1, name: "x" }], commanders: [] }, DEFAULT_SETTINGS.duel).ok, true);
});

test("checkDeck rejects an empty deck", () => {
  assert.equal(checkDeck({ main: [], commanders: [] }, DEFAULT_SETTINGS.duel).ok, false);
});
