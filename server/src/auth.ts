// Authentication helpers: scrypt password hashing, opaque session tokens carried
// in an httpOnly cookie, and a small in-memory brute-force throttle. No
// third-party auth library — same hand-rolled style as the rest of the server.

import {
  scrypt as scryptCb,
  randomBytes,
  timingSafeEqual,
  type BinaryLike,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Users, Sessions, type UserRow } from "./db.js";

const scrypt = (pw: BinaryLike, salt: BinaryLike, len: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(pw, salt, len, (err, dk) => (err ? reject(err) : resolve(dk))),
  );

const KEYLEN = 64;

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const dk = await scrypt(password, salt, KEYLEN);
  return { hash: dk.toString("hex"), salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const dk = await scrypt(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== dk.length) return false;
  return timingSafeEqual(dk, expected);
}

export const SESSION_COOKIE = "mtg_session";

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

// --- cookies ----------------------------------------------------------
export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setSessionCookie(res: ServerResponse, token: string): void {
  // No Secure flag: this tool runs over plain http on a LAN.
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`,
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/** Resolve the current user from a request's session cookie (HTTP or WS upgrade). */
export function userFromRequest(req: IncomingMessage): UserRow | undefined {
  const token = parseCookies(req)[SESSION_COOKIE];
  return Sessions.resolve(token);
}

export function tokenFromRequest(req: IncomingMessage): string | undefined {
  return parseCookies(req)[SESSION_COOKIE];
}

/** Strip a user row down to what is safe to send to the client. */
export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, displayName: u.displayName };
}

// --- brute-force throttle ------------------------------------------
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function loginThrottled(key: string): boolean {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

export function noteLoginFailure(key: string): void {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count++;
  }
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

export { Users, Sessions };
