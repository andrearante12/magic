import type { IncomingMessage, ServerResponse } from "node:http";
import type { Gamemode } from "@mtg/shared";
import { readJson, sendJson, sendError } from "./util.js";
import { userFromRequest } from "../auth.js";
import { Decks } from "../db.js";
import { resolveDecklist } from "../deck.js";

const asGamemode = (v: unknown): Gamemode => (v === "commander" ? "commander" : "duel");

/** Resolve text once and shape the DB columns + a resolution report for the UI. */
async function buildDeckInput(name: unknown, text: unknown, gamemode: unknown) {
  const resolved = await resolveDecklist(String(text ?? ""));
  return {
    input: {
      name: String(name ?? "").trim(),
      text: String(text ?? ""),
      gamemode: asGamemode(gamemode),
      cardCount: resolved.cardCount,
      commanderCount: resolved.commanderCount,
      coverImage: resolved.coverImage,
    },
    report: { errors: resolved.errors, notFound: resolved.notFound },
  };
}

export async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/decks")) return false;

  const user = userFromRequest(req);
  if (!user) return sendError(res, 401, "Sign in to manage decks."), true;

  const m = url.pathname.match(/^\/api\/decks\/([\w-]+)$/);
  const deckId = m?.[1];

  // /api/decks
  if (!deckId) {
    if (req.method === "GET") {
      sendJson(res, 200, { decks: Decks.listFor(user.id) });
      return true;
    }
    if (req.method === "POST") {
      const { name, text, gamemode } = await readJson(req);
      if (!String(text ?? "").trim()) return sendError(res, 400, "Decklist text is required."), true;
      const { input, report } = await buildDeckInput(name || "Untitled deck", text, gamemode);
      const row = Decks.create(user.id, input);
      sendJson(res, 200, { deck: Decks.summary(row), ...report });
      return true;
    }
    return false;
  }

  // /api/decks/:id
  const existing = Decks.get(deckId);
  if (!existing || existing.userId !== user.id)
    return sendError(res, 404, "Deck not found."), true;

  if (req.method === "GET") {
    sendJson(res, 200, { deck: existing });
    return true;
  }
  if (req.method === "PUT") {
    const { name, text, gamemode } = await readJson(req);
    if (!String(text ?? "").trim()) return sendError(res, 400, "Decklist text is required."), true;
    const { input, report } = await buildDeckInput(
      name ?? existing.name,
      text,
      gamemode ?? existing.gamemode,
    );
    const row = Decks.update(deckId, input);
    sendJson(res, 200, { deck: row ? Decks.summary(row) : null, ...report });
    return true;
  }
  if (req.method === "DELETE") {
    Decks.remove(deckId);
    sendJson(res, 200, { ok: true });
    return true;
  }
  return false;
}
