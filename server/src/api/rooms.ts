import type { IncomingMessage, ServerResponse } from "node:http";
import { normalizeSettings } from "@mtg/shared";
import { readJson, sendJson, sendError } from "./util.js";
import { createRoom, getRoom } from "../rooms.js";

export async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/rooms")) return false;

  if (url.pathname === "/api/rooms" && req.method === "POST") {
    const body = await readJson(req);
    const settings = normalizeSettings(body?.settings ?? body);
    const room = createRoom(settings);
    sendJson(res, 200, { code: room.code, settings });
    return true;
  }

  const m = url.pathname.match(/^\/api\/rooms\/([\w-]+)$/);
  if (m && req.method === "GET") {
    const room = getRoom(m[1]);
    if (!room) return sendJson(res, 404, { exists: false }), true;
    sendJson(res, 200, {
      exists: true,
      code: room.code,
      settings: room.settings,
      seatsUsed: room.state.seats.length,
      maxPlayers: room.settings.maxPlayers,
    });
    return true;
  }

  return false;
}
