import type { IncomingMessage, ServerResponse } from "node:http";
import { readJson, sendJson, sendError, isEmail } from "./util.js";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  setSessionCookie,
  clearSessionCookie,
  userFromRequest,
  tokenFromRequest,
  publicUser,
  loginThrottled,
  noteLoginFailure,
  clearLoginFailures,
  Users,
  Sessions,
} from "../auth.js";

const clientIp = (req: IncomingMessage) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "?";

export async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/auth/")) return false;

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const user = userFromRequest(req);
    sendJson(res, 200, { user: user ? publicUser(user) : null });
    return true;
  }

  if (url.pathname === "/api/auth/register" && req.method === "POST") {
    const { email, password, displayName } = await readJson(req);
    if (!isEmail(email)) return sendError(res, 400, "A valid email is required."), true;
    if (typeof password !== "string" || password.length < 8)
      return sendError(res, 400, "Password must be at least 8 characters."), true;
    if (Users.byEmail(email))
      return sendError(res, 409, "An account with that email already exists."), true;

    const { hash, salt } = await hashPassword(password);
    const user = Users.create(email, hash, salt, String(displayName ?? "").trim() || email.split("@")[0]);
    const token = newSessionToken();
    Sessions.create(user.id, token);
    setSessionCookie(res, token);
    sendJson(res, 200, { user: publicUser(user) });
    return true;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const { email, password } = await readJson(req);
    if (!isEmail(email) || typeof password !== "string")
      return sendError(res, 400, "Email and password are required."), true;

    const throttleKey = `${email.toLowerCase()}|${clientIp(req)}`;
    if (loginThrottled(throttleKey))
      return sendError(res, 429, "Too many attempts. Try again in a few minutes."), true;

    const user = Users.byEmail(email);
    const ok = user && (await verifyPassword(password, user.passwordHash, user.passwordSalt));
    if (!ok || !user) {
      noteLoginFailure(throttleKey);
      return sendError(res, 401, "Wrong email or password."), true;
    }
    clearLoginFailures(throttleKey);
    const token = newSessionToken();
    Sessions.create(user.id, token);
    setSessionCookie(res, token);
    sendJson(res, 200, { user: publicUser(user) });
    return true;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    Sessions.destroy(tokenFromRequest(req));
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
