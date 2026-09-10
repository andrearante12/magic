import { randomUUID } from "node:crypto";
import {
  applyAction,
  redactFor,
  checkDeck,
  PUBLIC_ROOM_CODE,
  PUBLIC_ROOM_SETTINGS,
  type Action,
  type ActionContext,
  type CardData,
  type CardInstance,
  type GameState,
  type RoomSettings,
  type Seat,
} from "@mtg/shared";
import { resolveDecklist, type ResolvedDeck } from "./deck.js";
import { Decks } from "./db.js";
import type { UserRow } from "./db.js";

export type ClientUser = Pick<UserRow, "id" | "displayName" | "email">;

interface Client {
  id: string;
  seatId: string | null;
  user: ClientUser | null;
  send: (msg: unknown) => void;
}

/** How a player picks their deck when sitting down. */
export type DeckChoice = { deckId: string } | { text: string };

export type JoinResult =
  | { ok: true; seatId: string }
  | { ok: false; code: "room_full" | "deck_invalid" | "unauthorized" | "bad_request"; message: string };

/** Seeded RNG (mulberry32) so a room's shuffles are reproducible for debugging. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Room {
  code: string;
  state: GameState;
  /** full, unredacted card dictionary for every card in the room */
  dict: Record<string, CardData> = {};
  clients = new Map<string, Client>();
  readonly createdAt = Date.now();
  everJoined = false;
  emptySince: number | null = Date.now();
  /** Seeded rooms that must stay available across idle periods (never reaped). */
  persistent = false;
  private logSeq = 1;
  private seatSeq = 1; // monotonic — never reused, so a freed seat's id can't collide
  private rng: () => number;
  private history: string[] = []; // JSON snapshots for UNDO

  constructor(code: string, settings: RoomSettings) {
    this.code = code;
    this.rng = mulberry32(
      [...code].reduce((a, c) => a * 33 + c.charCodeAt(0), 7) >>> 0,
    );
    this.state = {
      roomCode: code,
      settings,
      seats: [],
      turn: null,
      turnNumber: 0,
      activePhase: "Main",
      log: [],
      version: 0,
    };
  }

  get settings(): RoomSettings {
    return this.state.settings;
  }

  private ctx(): ActionContext {
    return {
      rng: this.rng,
      nextLogId: () => this.logSeq++,
      now: () => Date.now(),
    };
  }

  addClient(send: (msg: unknown) => void, user: ClientUser | null): { clientId: string } {
    const id = randomUUID();
    this.clients.set(id, { id, seatId: null, user, send });
    this.emptySince = null;
    return { clientId: id };
  }

  removeClient(clientId: string) {
    const c = this.clients.get(clientId);
    if (c?.seatId) {
      const seat = this.seat(c.seatId);
      if (seat) seat.connected = false;
    }
    this.clients.delete(clientId);
    if (this.clients.size === 0) this.emptySince = Date.now();
    this.broadcast();
  }

  /**
   * A seated client leaves the table for good: the seat and its cards are
   * removed so someone else can sit down. The client stays connected as a
   * spectator until its socket closes.
   */
  leaveSeat(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client?.seatId) return;
    const seatId = client.seatId;
    const seat = this.seat(seatId);
    client.seatId = null;
    if (!seat) {
      this.broadcast();
      return;
    }
    this.state.seats = this.state.seats.filter((s) => s.id !== seatId);
    // Hand the turn to whoever's left (or nobody) if the leaver was active.
    if (this.state.turn === seatId) {
      this.state.turn = this.state.seats[0]?.id ?? null;
    }
    this.state.log.push({
      id: this.logSeq++,
      seat: null,
      text: `${seat.name} left the table`,
      ts: Date.now(),
      kind: "system",
    });
    this.broadcast();
  }

  private seat(id: string | null) {
    return this.state.seats.find((s) => s.id === id);
  }

  private seatCount() {
    return this.state.seats.length;
  }

  /**
   * Sit a client down. Reconnects by seatId if one is supplied and still exists
   * (deck choice ignored). Otherwise resolves the chosen deck server-side,
   * validates it against the room's gamemode, and builds a fresh library.
   */
  async join(
    clientId: string,
    opts: { name?: string; seatId?: string; deck?: DeckChoice },
  ): Promise<JoinResult> {
    const client = this.clients.get(clientId);
    if (!client) return { ok: false, code: "bad_request", message: "Unknown client." };

    // Reconnect path.
    if (opts.seatId) {
      const existing = this.seat(opts.seatId);
      if (existing) {
        existing.connected = true;
        if (opts.name) existing.name = opts.name.slice(0, 24);
        client.seatId = existing.id;
        this.everJoined = true;
        this.broadcast();
        return { ok: true, seatId: existing.id };
      }
    }

    if (this.seatCount() >= this.settings.maxPlayers)
      return { ok: false, code: "room_full", message: "This room is full." };

    if (!opts.deck)
      return { ok: false, code: "deck_invalid", message: "Choose a deck before sitting down." };

    // --- resolve the deck, server-side ---
    let resolved: ResolvedDeck;
    let deckText: string;
    if ("deckId" in opts.deck) {
      if (!client.user)
        return { ok: false, code: "unauthorized", message: "Sign in to use a saved deck." };
      const row = Decks.get(opts.deck.deckId);
      if (!row || row.userId !== client.user.id)
        return { ok: false, code: "unauthorized", message: "That deck isn't yours." };
      deckText = row.text;
    } else {
      deckText = String(opts.deck.text ?? "");
    }
    resolved = await resolveDecklist(deckText);

    const verdict = checkDeck(resolved.parsed, this.settings);
    if (!verdict.ok)
      return { ok: false, code: "deck_invalid", message: verdict.reason ?? "Invalid deck." };
    if (resolved.main.length + resolved.commanders.length === 0)
      return { ok: false, code: "deck_invalid", message: "No cards in that decklist could be resolved." };

    // Capacity can have changed while we awaited Scryfall — re-check.
    if (this.seatCount() >= this.settings.maxPlayers)
      return { ok: false, code: "room_full", message: "This room filled up while your deck was loading." };
    // A racing call may have claimed our reconnect seat; re-check that too.
    if (client.seatId && this.seat(client.seatId))
      return { ok: true, seatId: client.seatId };

    const seatId = `seat_${this.seatSeq++}`;
    const seat: Seat = {
      id: seatId,
      name: opts.name?.slice(0, 24) || client.user?.displayName || `Player ${this.seatCount() + 1}`,
      connected: true,
      life: this.settings.startingLife,
      poison: 0,
      energy: 0,
      counters: {},
      cards: [],
      library_loaded: false,
    };
    this.state.seats.push(seat);
    client.seatId = seatId;
    this.everJoined = true;
    if (!this.state.turn) {
      this.state.turn = seatId;
      this.state.turnNumber = 1;
    }
    this.state.log.push({
      id: this.logSeq++,
      seat: null,
      text: `${seat.name} sat down`,
      ts: Date.now(),
      kind: "system",
    });

    this.buildLibrary(seat, resolved);
    this.snapshot();
    this.broadcast();
    return { ok: true, seatId };
  }

  /** Re-deck an already-seated player (the in-game "Deck" button). */
  async replaceDeck(clientId: string, choice: DeckChoice): Promise<JoinResult> {
    const client = this.clients.get(clientId);
    const seat = this.seat(client?.seatId ?? null);
    if (!client || !seat) return { ok: false, code: "bad_request", message: "Not seated." };

    let deckText: string;
    if ("deckId" in choice) {
      if (!client.user)
        return { ok: false, code: "unauthorized", message: "Sign in to use a saved deck." };
      const row = Decks.get(choice.deckId);
      if (!row || row.userId !== client.user.id)
        return { ok: false, code: "unauthorized", message: "That deck isn't yours." };
      deckText = row.text;
    } else {
      deckText = String(choice.text ?? "");
    }
    const resolved = await resolveDecklist(deckText);
    const verdict = checkDeck(resolved.parsed, this.settings);
    if (!verdict.ok)
      return { ok: false, code: "deck_invalid", message: verdict.reason ?? "Invalid deck." };
    if (resolved.main.length + resolved.commanders.length === 0)
      return { ok: false, code: "deck_invalid", message: "No cards in that decklist could be resolved." };

    this.buildLibrary(seat, resolved);
    this.snapshot();
    this.broadcast();
    return { ok: true, seatId: seat.id };
  }

  /** Wipe a seat's cards and rebuild library + command zone from a resolved deck. */
  private buildLibrary(seat: Seat, deck: ResolvedDeck) {
    Object.assign(this.dict, deck.dict);
    seat.cards = [];
    let order = 0;
    const mk = (oracleId: string, zone: CardInstance["zone"]): CardInstance => ({
      id: `c_${randomUUID().slice(0, 8)}`,
      oracleId,
      owner: seat.id,
      controller: seat.id,
      zone,
      tapped: false,
      faceDown: zone === "library",
      flipped: false,
      counters: {},
      order: order++,
    });
    for (const oid of deck.main) seat.cards.push(mk(oid, "library"));
    for (const oid of deck.commanders) seat.cards.push(mk(oid, "command"));

    applyAction(this.state, { t: "SHUFFLE", seat: seat.id } as Action, this.ctx());
    // Deal the opening hand automatically so a fresh player starts ready.
    applyAction(this.state, { t: "DRAW", seat: seat.id, n: 7 } as Action, this.ctx());
    seat.library_loaded = true;
    this.state.log.push({
      id: this.logSeq++,
      seat: null,
      text: `${seat.name} loaded a ${deck.main.length}-card deck`,
      ts: Date.now(),
      kind: "system",
    });
  }

  handleAction(clientId: string, action: Action) {
    const client = this.clients.get(clientId);
    if (!client?.seatId) return;
    // A client may only act as its own seat (except targeting life on others).
    if (action.seat !== client.seatId) return;

    if ((action as any).t === "UNDO") {
      this.undo();
      return;
    }

    applyAction(this.state, action, this.ctx());
    this.snapshot();
    this.broadcast();
  }

  private snapshot() {
    this.history.push(JSON.stringify(this.state));
    if (this.history.length > 40) this.history.shift();
  }

  private undo() {
    if (this.history.length < 2) return;
    this.history.pop();
    const prev = this.history[this.history.length - 1];
    this.state = JSON.parse(prev);
    this.state.log.push({
      id: this.logSeq++,
      seat: null,
      text: "Undo",
      ts: Date.now(),
      kind: "system",
    });
    this.broadcast();
  }

  /** Send each client a view redacted for its own seat. */
  broadcast() {
    for (const client of this.clients.values()) {
      const viewer = client.seatId ?? "__spectator__";
      const { state, dict } = redactFor(this.state, this.dict, viewer);
      client.send({ t: "state", state, dict, you: client.seatId });
    }
  }

  isEmpty() {
    return this.clients.size === 0;
  }

  /** Reapable once empty for a while, or created-but-never-joined and stale. */
  reapable(now: number): boolean {
    if (this.persistent) return false;
    if (this.clients.size > 0) return false;
    if (this.everJoined) return this.emptySince != null && now - this.emptySince > 10 * 60_000;
    return now - this.createdAt > 15 * 60_000;
  }
}

const rooms = new Map<string, Room>();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
function randomCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++)
    c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/** Explicitly create a new room with settings; returns it with a fresh code. */
export function createRoom(settings: RoomSettings): Room {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const room = new Room(code, settings);
  rooms.set(code, room);
  return room;
}

/** Look up an existing room. Returns undefined for unknown codes — rooms are no
 *  longer conjured on connect, except the always-open public room, which
 *  self-heals so a reload or restart can always rejoin it. */
export function getRoom(code: string): Room | undefined {
  const norm = normalizeCode(code);
  if (norm === PUBLIC_ROOM_CODE) return ensurePublicRoom();
  return rooms.get(norm);
}

/** Create the well-known public room if it isn't already in the registry. */
export function ensurePublicRoom(): Room {
  let room = rooms.get(PUBLIC_ROOM_CODE);
  if (!room) {
    room = new Room(PUBLIC_ROOM_CODE, PUBLIC_ROOM_SETTINGS);
    room.persistent = true;
    rooms.set(PUBLIC_ROOM_CODE, room);
  }
  return room;
}

export function reapEmptyRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) if (room.reapable(now)) rooms.delete(code);
}
