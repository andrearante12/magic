import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { searchCards } from "./scryfall.js";
import { resolveDecklist } from "./deck.js";
import {
  getRoom,
  reapEmptyRooms,
  type DeckChoice,
} from "./rooms.js";
import { userFromRequest, publicUser } from "./auth.js";
import { readJson, sendJson } from "./api/util.js";
import * as authApi from "./api/auth.js";
import * as decksApi from "./api/decks.js";
import * as roomsApi from "./api/rooms.js";

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIST = path.resolve(process.cwd(), "client/dist");

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};

async function serveStatic(res: import("node:http").ServerResponse, urlPath: string) {
  let file = path.join(CLIENT_DIST, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(CLIENT_DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    try {
      const body = await fs.readFile(path.join(CLIENT_DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not built — run `npm run build`");
    }
  }
}

/** Credentialed CORS: echo a local/LAN origin so the session cookie is sent. */
function applyCors(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  try {
    if (
      (await authApi.handle(req, res, url)) ||
      (await decksApi.handle(req, res, url)) ||
      (await roomsApi.handle(req, res, url))
    ) {
      return;
    }

    // Decklist preview / validation (used by the deck picker before saving or
    // sitting down). Resolution only — it does not load cards into any seat.
    if (url.pathname === "/api/deck" && req.method === "POST") {
      const { text } = await readJson(req);
      const r = await resolveDecklist(String(text ?? ""));
      sendJson(res, 200, {
        dict: r.dict,
        main: r.main,
        commanders: r.commanders,
        errors: r.errors,
        notFound: r.notFound,
        counts: { main: r.cardCount, commanders: r.commanderCount },
        coverImage: r.coverImage,
      });
      return;
    }

    if (url.pathname === "/api/search" && req.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const tokens = url.searchParams.get("tokens") === "1";
      const cards = await searchCards(q, { tokens });
      sendJson(res, 200, { cards });
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: String(e) });
  }
});

// ---- WebSocket rooms ----
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url ?? "/ws", `http://${req.headers.host}`);
  const code = url.searchParams.get("room") ?? "";

  const send = (msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const room = getRoom(code);
  if (!room) {
    send({ t: "error", code: "no_such_room", message: `No room "${code}". Create one from the menu.` });
    ws.close();
    return;
  }

  const user = userFromRequest(req);
  const { clientId } = room.addClient(send, user ? publicUser(user) : null);
  send({ t: "hello", clientId, room: room.code, settings: room.settings, user: user ? publicUser(user) : null });
  room.broadcast();

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.t) {
      case "join":
        room
          .join(clientId, { name: msg.name, seatId: msg.seatId, deck: msg.deck as DeckChoice | undefined })
          .then((r) => { if (!r.ok) send({ t: "error", code: r.code, message: r.message }); })
          .catch((e) => send({ t: "error", code: "bad_request", message: String(e) }));
        break;
      case "deck":
        room
          .replaceDeck(clientId, (msg.deck ?? msg.payload) as DeckChoice)
          .then((r) => { if (!r.ok) send({ t: "error", code: r.code, message: r.message }); })
          .catch((e) => send({ t: "error", code: "bad_request", message: String(e) }));
        break;
      case "action":
        room.handleAction(clientId, msg.action);
        break;
      case "ping":
        send({ t: "pong" });
        break;
    }
  });

  ws.on("close", () => room.removeClient(clientId));
});

setInterval(reapEmptyRooms, 5 * 60_000).unref();

function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}`);
    }
  }
  return out;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  MTG tabletop server on port ${PORT}`);
  console.log(`  local:   http://localhost:${PORT}`);
  for (const u of lanUrls(PORT)) console.log(`  LAN:     ${u}   <- share this`);
  console.log("");
});
