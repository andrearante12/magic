import { test } from "node:test";
import assert from "node:assert/strict";
import { db, Users, Sessions } from "./db.ts";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  loginThrottled,
  noteLoginFailure,
  clearLoginFailures,
} from "./auth.ts";

test("password hash round-trips and rejects wrong input", async () => {
  const { hash, salt } = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", hash, salt), true);
  assert.equal(await verifyPassword("Correct Horse Battery", hash, salt), false);
  assert.equal(await verifyPassword("", hash, salt), false);
});

test("a distinct salt is used per hash", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test("expired sessions resolve to undefined and are deleted", async () => {
  const { hash, salt } = await hashPassword("pw-abcdefgh");
  const u = Users.create("expiry@test.dev", hash, salt, "Exp");
  const token = newSessionToken();
  Sessions.create(u.id, token);
  assert.equal(Sessions.resolve(token)?.id, u.id);
  db.prepare("UPDATE sessions SET expiresAt = ? WHERE token = ?").run(Date.now() - 1000, token);
  assert.equal(Sessions.resolve(token), undefined);
  assert.equal(db.prepare("SELECT * FROM sessions WHERE token = ?").get(token), undefined);
});

test("login throttle trips after 10 failures and clears on success", () => {
  const key = "throttle@test.dev|1.2.3.4";
  for (let i = 0; i < 9; i++) noteLoginFailure(key);
  assert.equal(loginThrottled(key), false);
  noteLoginFailure(key);
  assert.equal(loginThrottled(key), true);
  clearLoginFailures(key);
  assert.equal(loginThrottled(key), false);
});
