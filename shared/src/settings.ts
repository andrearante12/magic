// Lobby configuration for a room. The room creator picks a gamemode and a couple
// of knobs; the server is the single validation point via normalizeSettings().

import type { Gamemode, RoomSettings } from "./types.js";
import type { ParsedDeck } from "./decklist.js";

export const GAMEMODES: Gamemode[] = ["duel", "commander"];

/** Per-gamemode defaults, also used to re-seed the form when the mode changes. */
export const DEFAULT_SETTINGS: Record<Gamemode, RoomSettings> = {
  duel: { gamemode: "duel", maxPlayers: 2, startingLife: 20 },
  commander: { gamemode: "commander", maxPlayers: 4, startingLife: 40 },
};

/** Legal player-count range for a gamemode. Duel is exactly 2. */
export function playerRange(mode: Gamemode): { min: number; max: number } {
  return mode === "commander" ? { min: 2, max: 6 } : { min: 2, max: 2 };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Coerce arbitrary client input into a valid RoomSettings. Anything missing or
 * malformed falls back to the gamemode default; numbers are clamped to their
 * legal range. This is the ONLY place settings are validated — client-side
 * constraints are cosmetic.
 */
export function normalizeSettings(input: unknown): RoomSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  const gamemode: Gamemode = raw.gamemode === "commander" ? "commander" : "duel";
  const def = DEFAULT_SETTINGS[gamemode];
  const range = playerRange(gamemode);

  const maxPlayers =
    raw.maxPlayers == null || Number.isNaN(Number(raw.maxPlayers))
      ? def.maxPlayers
      : clamp(Math.round(Number(raw.maxPlayers)), range.min, range.max);

  const startingLife =
    raw.startingLife == null || Number.isNaN(Number(raw.startingLife))
      ? def.startingLife
      : clamp(Math.round(Number(raw.startingLife)), 1, 200);

  return { gamemode, maxPlayers, startingLife };
}

export interface DeckRequirements {
  minCards: number;
  requiresCommander: boolean;
}

export function deckRequirementsFor(settings: RoomSettings): DeckRequirements {
  return settings.gamemode === "commander"
    ? { minCards: 1, requiresCommander: true }
    : { minCards: 1, requiresCommander: false };
}

/** Validate a parsed decklist against a room's requirements. */
export function checkDeck(
  parsed: Pick<ParsedDeck, "main" | "commanders">,
  settings: RoomSettings,
): { ok: boolean; reason?: string } {
  const req = deckRequirementsFor(settings);
  const mainCount = parsed.main.reduce((n, e) => n + e.count, 0);
  const cmdCount = parsed.commanders.reduce((n, e) => n + e.count, 0);
  if (mainCount + cmdCount < req.minCards) return { ok: false, reason: "Deck is empty." };
  if (req.requiresCommander && cmdCount < 1)
    return {
      ok: false,
      reason: "Commander games need at least one card under a 'Commander' header.",
    };
  return { ok: true };
}
