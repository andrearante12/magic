import { create } from "zustand";
import { PUBLIC_ROOM_CODE } from "@mtg/shared";
import type { Action, CardData, CardDict, CardInstance, Fx, GameState, Zone } from "@mtg/shared";
import { Net } from "./net";
import type { DeckChoice, PublicUser, RoomErrorCode } from "./net";
import { api, type DeckSummary } from "./api";
import { normalizeCode } from "./menu-util";

export interface DeckResponse {
  dict: Record<string, CardData>;
  main: string[];
  commanders: string[];
  errors: string[];
  notFound: string[];
  counts: { main: number; commanders: number };
}

type ModalKind = null | "import" | "token" | { browse: { controller: string; zone: Zone } };

/** A card another seat just put onto the battlefield from hand — shown briefly so
 *  you can read it. Detected purely by diffing consecutive state snapshots. */
export interface CastEvent {
  key: string;
  inst: CardInstance;
  controllerName: string;
  at: number;
  paused?: boolean;
}

const CAST_TTL = 4000;

/** Cards that moved hand -> battlefield, controlled by someone other than `you`. */
function detectCasts(
  prev: GameState | null,
  next: GameState,
  you: string | null,
): CastEvent[] {
  if (!prev) return []; // first snapshot / reconnect resync — not fresh casts
  const prevZone = new Map<string, Zone>();
  for (const seat of prev.seats) for (const c of seat.cards) prevZone.set(c.id, c.zone);
  const out: CastEvent[] = [];
  for (const seat of next.seats) {
    for (const c of seat.cards) {
      if (c.zone !== "battlefield" || c.faceDown || !c.oracleId) continue;
      if (c.controller === you) continue;
      if (prevZone.get(c.id) !== "hand") continue;
      const name = next.seats.find((s) => s.id === c.controller)?.name ?? "Someone";
      out.push({ key: `${c.id}-${next.version}`, inst: c, controllerName: name, at: Date.now() });
    }
  }
  return out;
}

/** A structured effect pulled off the game log, waiting for FxLayer to play it. */
export interface FxEvent {
  key: string;
  fx: Fx;
  at: number;
  /**
   * Source geometry for cards whose on-screen position is about to vanish when
   * React commits the new snapshot — measured against the OLD DOM in `onState`.
   * Keyed by card id. Absent for effects that fly from a fixed anchor (a pile).
   */
  pre?: Record<string, { rect: DOMRect; img: string | null }>;
}

/** Snapshot each named card's current rect + face image before the re-render. */
function measurePre(events: FxEvent[]): void {
  for (const e of events) {
    const ids =
      e.fx.k === "move" || e.fx.k === "flip"
        ? e.fx.cardIds
        : null;
    if (!ids) continue;
    const pre: Record<string, { rect: DOMRect; img: string | null }> = {};
    for (const id of ids) {
      const el = document.querySelector<HTMLElement>(
        `[data-card-id="${(window.CSS?.escape ?? ((s: string) => s))(id)}"]`,
      );
      if (!el || el.offsetParent === null) continue;
      pre[id] = {
        rect: el.getBoundingClientRect(),
        img: el.querySelector("img")?.getAttribute("src") ?? null,
      };
    }
    if (Object.keys(pre).length) e.pre = pre;
  }
}

/**
 * New fx-bearing log entries since `cursor`. On the very first snapshot
 * (`cursor === null`) it primes the cursor and emits nothing, so a fresh join or
 * a reconnect resync never replays the backlog — same guard `detectCasts` uses.
 * Log ids are monotonic and never reused, so a duplicate or out-of-order
 * snapshot can only produce entries we've already passed (i.e. none).
 */
function drainFx(
  log: GameState["log"],
  cursor: number | null,
): { events: FxEvent[]; cursor: number } {
  const newest = log.length ? log[log.length - 1].id : 0;
  if (cursor === null) return { events: [], cursor: newest };
  const events: FxEvent[] = [];
  for (const e of log) {
    if (e.id > cursor && e.fx) events.push({ key: `fx${e.id}`, fx: e.fx, at: Date.now() });
  }
  return { events, cursor: Math.max(cursor, newest) };
}

/** Fires once when `you` become the active player (start of your turn). Mirrors
 *  the diff-based detection used for casts. */
function detectTurnStart(
  prev: GameState | null,
  next: GameState,
  you: string | null,
): { turnNumber: number; at: number } | null {
  if (!prev || !you) return null; // first snapshot / reconnect resync / spectator
  if (next.turn !== you) return null;
  if (prev.turn == null) return null; // spectator -> just-seated, not a hand-off
  const advanced = next.turnNumber > prev.turnNumber;
  if (prev.turn === you && !advanced) return null; // SET_PHASE / DRAW echo, not a fresh turn
  return { turnNumber: next.turnNumber, at: Date.now() };
}

interface UIState {
  net: Net | null;
  connected: boolean;
  room: string;
  you: string | null; // seat id
  savedSeatId: string | undefined;
  name: string;

  /** Which pre-game screen is showing (ignored once seated at a table). */
  phase: "loading" | "menu" | "create" | "join" | "deck" | "decks";
  user: PublicUser | null;
  authBusy: boolean;
  decks: DeckSummary[];
  pendingRoom: { code: string; settings: import("@mtg/shared").RoomSettings } | null;
  joinError: string | null;

  state: GameState | null;
  dict: CardDict;

  selected: Set<string>;
  /** Card ids currently being dragged — their source render is hidden. */
  dragging: Set<string>;
  preview: CardInstance | null;
  hovered: string | null;
  menu: { x: number; y: number; card: CardInstance } | null;
  modal: ModalKind;
  toast: string | null;

  /** Which seat's board fills the main view. null -> resolves to `you`. */
  focus: string | null;
  castFeed: CastEvent[];
  /** Structured table effects pending animation, newest last. Drained by FxLayer. */
  fxQueue: FxEvent[];

  /** Armed at the start of your turn; the turn-start prompt consumes it. */
  turnStart: { turnNumber: number; at: number } | null;
  /** Persisted preference: walk me through the start of each of my turns. */
  walkTurns: boolean;
  /** Persisted preference: right rail hidden, card info only peeks on hover. */
  railCollapsed: boolean;
  /** Persisted preference: play table animations (shuffle, draw, coin, …). */
  animations: boolean;

  // actions
  bootstrap(room: string, name: string, deck?: DeckChoice): void;
  joinSeat(): void;
  dispatch(a: Action): void;
  importDeck(text: string): Promise<DeckResponse>;
  setPreview(c: CardInstance | null): void;
  setHovered(id: string | null): void;
  select(id: string, additive?: boolean): void;
  clearSelection(): void;
  setDragging(ids: string[] | null): void;
  openMenu(x: number, y: number, card: CardInstance): void;
  closeMenu(): void;
  setModal(m: ModalKind): void;
  flash(msg: string): void;
  setFocus(id: string): void;
  dismissCast(key: string): void;
  pauseCast(key: string, paused: boolean): void;
  dismissFx(key: string): void;
  consumeTurnStart(): void;
  setWalkTurns(v: boolean): void;
  setAnimations(v: boolean): void;
  toggleRail(): void;

  loadSession(): Promise<void>;
  setPhase(p: UIState["phase"]): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<void>;
  signOut(): Promise<void>;
  refreshDecks(): Promise<void>;
  createRoom(settings: import("@mtg/shared").RoomSettings): Promise<void>;
  enterRoomCode(code: string): Promise<void>;
  sitDown(deck: DeckChoice, name: string): void;
  /** On boot: silently rejoin the last room if this tab still has a seat there. */
  resumeLastRoom(): void;
  /** Stand up, disconnect, and return to the menu. Frees the seat for others. */
  leaveRoom(): void;
  /** Menu shortcut into the always-open public room. */
  joinPublicTable(): Promise<void>;

  cardData(inst: CardInstance | null | undefined): CardData | null;
  mySeat(): GameState["seats"][number] | null;
}

// Seat is remembered per-tab (survives refresh, not shared between tabs) so two
// people on one machine — or two test tabs — get distinct seats.
const seatKey = (room: string) => `mtg.seat.${room}`;
const getSeat = (room: string) => sessionStorage.getItem(seatKey(room)) ?? undefined;
const setSeat = (room: string, id: string) => sessionStorage.setItem(seatKey(room), id);
const clearSeat = (room: string) => sessionStorage.removeItem(seatKey(room));
const LS_NAME = "mtg.name";

// Turn-start walkthrough preference ("0" = opted out, anything else = on).
const LS_WALK = "mtg.walkThroughTurns";
const getWalk = () => localStorage.getItem(LS_WALK) !== "0";

// Table-animations preference. Explicit "0"/"1" wins; with nothing stored the
// default follows the OS "reduce motion" setting.
const LS_ANIM = "mtg.animations";
const getAnimations = () => {
  const v = localStorage.getItem(LS_ANIM);
  if (v === "0") return false;
  if (v === "1") return true;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
};

// Right rail collapsed preference ("1" = collapsed, otherwise open).
const LS_RAIL = "mtg.railCollapsed";
const getRail = () => localStorage.getItem(LS_RAIL) === "1";

// Last room we connected to, so a browser reload can rejoin it automatically
// (paired with the per-tab seat above, the reconnect needs no deck).
const LS_ROOM = "mtg.room";
const getLastRoom = () => localStorage.getItem(LS_ROOM) ?? undefined;
const setLastRoom = (room: string) => localStorage.setItem(LS_ROOM, room);
const clearLastRoom = () => localStorage.removeItem(LS_ROOM);

export const useStore = create<UIState>((set, get) => {
  // Highest game-log id already turned into an fx event. null until the first
  // snapshot lands, so a resync doesn't replay history.
  let fxCursor: number | null = null;

  // Re-checks a cast popup until its lifetime elapses, skipping while hovered.
  const armCastExpiry = (key: string) => {
    const tick = () => {
      const ev = get().castFeed.find((c) => c.key === key);
      if (!ev) return;
      const remaining = CAST_TTL - (Date.now() - ev.at);
      if (ev.paused || remaining > 0) {
        setTimeout(tick, ev.paused ? 600 : remaining);
        return;
      }
      get().dismissCast(key);
    };
    setTimeout(tick, CAST_TTL);
  };

  return {
  net: null,
  connected: false,
  room: "TABLE",
  you: null,
  savedSeatId: undefined,
  name: localStorage.getItem(LS_NAME) ?? "",

  phase: "loading",
  user: null,
  authBusy: false,
  decks: [],
  pendingRoom: null,
  joinError: null,

  state: null,
  dict: {},
  selected: new Set(),
  dragging: new Set(),
  preview: null,
  hovered: null,
  menu: null,
  modal: null,
  toast: null,
  focus: null,
  castFeed: [],
  fxQueue: [],
  turnStart: null,
  walkTurns: getWalk(),
  railCollapsed: getRail(),
  animations: getAnimations(),

  bootstrap(room, name, deck) {
    room = room.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "TABLE";
    localStorage.setItem(LS_NAME, name);
    setLastRoom(room);
    const savedSeatId = getSeat(room);
    const net = new Net(room, {
      onOpen: () => {
        set({ connected: true });
        const saved = get().savedSeatId;
        net.join(saved, get().name || "Player", saved ? undefined : deck);
      },
      onClose: () => {
        fxCursor = null; // the post-reconnect resync must not replay animations
        set({ connected: false });
      },
      onError: (code: RoomErrorCode, message: string) => {
        net.close();
        // A deck-less reconnect that fails means our per-tab seat is gone (server
        // restarted / seat reclaimed). Without dropping it, every reload and
        // "join" retries the same dead seat and loops on this error.
        const staleSeat =
          !!get().savedSeatId && (code === "deck_invalid" || code === "bad_request");
        if (code === "no_such_room" || code === "room_full" || staleSeat) {
          clearSeat(room);
          clearLastRoom();
        }
        get().flash(staleSeat ? "Your seat expired — pick a deck to rejoin." : message);
        set((prev) => ({
          net: null,
          you: null,
          savedSeatId: undefined,
          state: null,
          joinError: staleSeat ? null : message,
          phase: prev.pendingRoom ? "deck" : "menu",
        }));
      },
      onState: (state, dict, you) => {
        if (you) setSeat(room, you);
        const casts = detectCasts(get().state, state, you);
        const ts = detectTurnStart(get().state, state, you);
        const drained = drainFx(state.log, fxCursor);
        fxCursor = drained.cursor;
        // Measure now, while the pre-move DOM is still on screen (FLIP "First").
        if (drained.events.length) measurePre(drained.events);
        set((prev) => ({
          state,
          // keep any card data we already had; merge in the fresh slice
          dict: { ...prev.dict, ...dict },
          you,
          castFeed: casts.length ? [...prev.castFeed, ...casts].slice(-3) : prev.castFeed,
          // cap the backlog so a burst catch-up can't animate for ten seconds
          fxQueue: drained.events.length
            ? [...prev.fxQueue, ...drained.events].slice(-24)
            : prev.fxQueue,
          // never clobber an un-consumed turn start with a later plain snapshot
          turnStart: ts ?? prev.turnStart,
        }));
        for (const c of casts) armCastExpiry(c.key);
      },
    });
    set({ net, room, name, savedSeatId, connected: false });
    net.connect();
  },

  joinSeat() {
    get().net?.join(undefined, get().name || "Player");
  },

  dispatch(a) {
    get().net?.send(a);
  },

  async importDeck(text) {
    // Server resolves + rebuilds the library; the client never ships card data.
    const p = await api.previewDeck(text);
    get().net?.loadDeck({ text });
    return {
      dict: {}, main: [], commanders: [],
      errors: p.errors, notFound: p.notFound, counts: p.counts,
    };
  },

  setPreview: (c) => set({ preview: c }),
  setHovered: (id) => set({ hovered: id }),

  select: (id, additive) =>
    set((s) => {
      const next = new Set(additive ? s.selected : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  clearSelection: () => set({ selected: new Set() }),
  setDragging: (ids) =>
    set((s) => {
      if (!ids || ids.length === 0) return s.dragging.size ? { dragging: new Set() } : {};
      return { dragging: new Set(ids) };
    }),

  openMenu: (x, y, card) => set({ menu: { x, y, card } }),
  closeMenu: () => set({ menu: null }),
  setModal: (m) => set({ modal: m }),
  flash: (msg) => {
    set({ toast: msg });
    setTimeout(() => set((s) => (s.toast === msg ? { toast: null } : {})), 2200);
  },
  setFocus: (id) => set({ focus: id }),
  dismissCast: (key) => set((s) => ({ castFeed: s.castFeed.filter((c) => c.key !== key) })),
  dismissFx: (key) => set((s) => ({ fxQueue: s.fxQueue.filter((e) => e.key !== key) })),
  pauseCast: (key, paused) =>
    set((s) => ({
      castFeed: s.castFeed.map((c) =>
        c.key === key ? { ...c, paused, at: paused ? c.at : Date.now() } : c,
      ),
    })),
  consumeTurnStart: () => set({ turnStart: null }),
  setWalkTurns: (v) => {
    localStorage.setItem(LS_WALK, v ? "1" : "0");
    set({ walkTurns: v });
  },
  setAnimations: (v) => {
    localStorage.setItem(LS_ANIM, v ? "1" : "0");
    set({ animations: v, ...(v ? {} : { fxQueue: [] }) });
  },
  toggleRail: () => {
    const v = !get().railCollapsed;
    localStorage.setItem(LS_RAIL, v ? "1" : "0");
    set({ railCollapsed: v });
  },

  loadSession: async () => {
    try {
      const { user } = await api.me();
      set({ user, phase: "menu" });
      if (user) await get().refreshDecks();
    } catch {
      set({ phase: "menu" });
    }
  },
  setPhase: (p) => set({ phase: p, joinError: null }),
  signIn: async (email, password) => {
    set({ authBusy: true });
    try {
      const { user } = await api.login({ email, password });
      set({ user });
      await get().refreshDecks();
    } finally {
      set({ authBusy: false });
    }
  },
  signUp: async (email, password, displayName) => {
    set({ authBusy: true });
    try {
      const { user } = await api.register({ email, password, displayName });
      set({ user });
      if (displayName) { localStorage.setItem(LS_NAME, displayName); set({ name: displayName }); }
      await get().refreshDecks();
    } finally {
      set({ authBusy: false });
    }
  },
  signOut: async () => {
    try { await api.logout(); } catch { /* ignore */ }
    set({ user: null, decks: [] });
  },
  refreshDecks: async () => {
    if (!get().user) { set({ decks: [] }); return; }
    try { const { decks } = await api.listDecks(); set({ decks }); } catch { /* ignore */ }
  },
  createRoom: async (settings) => {
    const { code, settings: applied } = await api.createRoom(settings);
    set({ pendingRoom: { code, settings: applied }, phase: "deck", joinError: null });
  },
  enterRoomCode: async (code) => {
    const norm = normalizeCode(code);
    const info = await api.lookupRoom(norm);
    if (!info.exists || !info.settings) throw new Error(`No room "${norm}".`);
    set({ pendingRoom: { code: info.code ?? norm, settings: info.settings }, phase: "deck", joinError: null });
  },
  sitDown: (deck, name) => {
    const pr = get().pendingRoom;
    if (!pr) return;
    if (name) { localStorage.setItem(LS_NAME, name); }
    set({ name: name || get().name, joinError: null });
    get().bootstrap(pr.code, name || get().name || "Player", deck);
  },
  resumeLastRoom: () => {
    const room = getLastRoom();
    if (!room || get().net) return;
    // Without a per-tab seat the reconnect would need a deck — send them through
    // the menu instead of bouncing off an error.
    if (!getSeat(room)) return;
    get().bootstrap(room, get().name || "Player", undefined);
  },
  leaveRoom: () => {
    const { net, room } = get();
    net?.leave();
    net?.close();
    clearSeat(room);
    clearLastRoom();
    fxCursor = null;
    set({
      net: null,
      connected: false,
      you: null,
      savedSeatId: undefined,
      state: null,
      dict: {},
      selected: new Set(),
      dragging: new Set(),
      preview: null,
      hovered: null,
      menu: null,
      modal: null,
      castFeed: [],
      fxQueue: [],
      turnStart: null,
      pendingRoom: null,
      joinError: null,
      phase: "menu",
    });
  },
  joinPublicTable: async () => {
    if (getSeat(PUBLIC_ROOM_CODE)) {
      get().bootstrap(PUBLIC_ROOM_CODE, get().name || "Player", undefined);
    } else {
      await get().enterRoomCode(PUBLIC_ROOM_CODE); // -> deck picker, then sitDown
    }
  },
  cardData: (inst) => {
    if (!inst || !inst.oracleId) return null;
    return get().dict[inst.oracleId] ?? null;
  },
  mySeat: () => {
    const s = get();
    return s.state?.seats.find((x) => x.id === s.you) ?? null;
  },
  };
});
