import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDecklist } from "./decklist.ts";

test("plain counts", () => {
  const d = parseDecklist("4 Lightning Bolt\n1 Sol Ring\n");
  assert.equal(d.main.length, 2);
  assert.deepEqual(d.main[0], { count: 4, name: "Lightning Bolt", set: undefined, collectorNumber: undefined });
});

test("4x form and comments", () => {
  const d = parseDecklist("// my deck\n4x Opt\n\n# note\n2X Negate\n");
  assert.equal(d.main.length, 2);
  assert.equal(d.main[1].name, "Negate");
});

test("arena export with set + collector number", () => {
  const d = parseDecklist("4 Lightning Bolt (MSC) 806\n");
  assert.deepEqual(d.main[0], { count: 4, name: "Lightning Bolt", set: "MSC", collectorNumber: "806" });
});

test("section headers route entries", () => {
  const d = parseDecklist("Deck\n60 Island\nSideboard\n2 Negate\nCommander\n1 Niv-Mizzet\n");
  assert.equal(d.main[0].name, "Island");
  assert.equal(d.sideboard[0].name, "Negate");
  assert.equal(d.commanders[0].name, "Niv-Mizzet");
});

test("SB: prefix", () => {
  const d = parseDecklist("4 Bolt\nSB: 2 Negate\n");
  assert.equal(d.sideboard[0].name, "Negate");
});

test("malformed lines collected as errors", () => {
  const d = parseDecklist("4 Bolt\ngarbage line here\n");
  assert.equal(d.main.length, 1);
  assert.equal(d.errors.length, 1);
});

test("foil marker tolerated", () => {
  const d = parseDecklist("1 Sol Ring (LTC) 275 *F*\n");
  assert.equal(d.main[0].name, "Sol Ring");
  assert.equal(d.main[0].set, "LTC");
});
