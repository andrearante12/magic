import { create } from "zustand";
import type { Action, CardData, CardDict, CardInstance, GameState, Zone } from "@mtg/shared";
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
  preview: CardInstance | null;
  hovered: string | null;
  menu: { x: number; y: number; card: CardInstance } | null;
  modal: ModalKind;
  toast: string | null;

  /** Which seat's board fills the main view. null -> resolves to `you`. */
  focus: string | null;
  castFeed: CastEvent[];

  // actions
  bootstrap(room: string, name: string, deck?: DeckChoice): void;
  joinSeat(): void;
  dispatch(a: Action): void;
  importDeck(text: string): Promise<DeckResponse>;
  setPreview(c: CardInstance | null): void;
  setHovered(id: string | null): void;
  select(id: string, additive?: boolean): void;
  clearSelection(): void;
  openMenu(x: number, y: number, card: CardInstance): void;
  closeMenu(): void;
  setModal(m: ModalKind): void;
  flash(msg: string): void;
  setFocus(id: string): void;
  dismissCast(key: string): void;
  pauseCast(key: string, paused: boolean): void;

  loadSession(): Promise<void>;
  setPhase(p: UIState["phase"]): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<void>;
  signOut(): Promise<void>;
  refreshDecks(): Promise<void>;
  createRoom(settings: import("@mtg/shared").RoomSettings): Promise<void>;
  enterRoomCode(code: string): Promise<void>;
  sitDown(deck: DeckChoice, name: string): void;

  cardData(inst: CardInstance | null | undefined): CardData | null;
  mySeat(): GameState["seats"][number] | null;
}

// Seat is remembered per-tab (survives refresh, not shared between tabs) so two
// people on one machine — or two test tabs — get distinct seats.
const seatKey = (room: string) => `mtg.seat.${room}`;
const getSeat = (room: string) => sessionStorage.getItem(seatKey(room)) ?? undefined;
const setSeat = (room: string, id: string) => sessionStorage.setItem(seatKey(room), id);
const LS_NAME = "mtg.name";

export const useStore = create<UIState>((set, get) => {
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
  preview: null,
  hovered: null,
  menu: null,
  modal: null,
  toast: null,
  focus: null,
  castFeed: [],

  bootstrap(room, name, deck) {
    room = room.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "TABLE";
    localStorage.setItem(LS_NAME, name);
    const savedSeatId = getSeat(room);
    const net = new Net(room, {
      onOpen: () => {
        set({ connected: true });
        const saved = get().savedSeatId;
        net.join(saved, get().name || "Player", saved ? undefined : deck);
      },
      onClose: () => set({ connected: false }),
      onError: (code: RoomErrorCode, message: string) => {
        net.close();
        get().flash(message);
        set((prev) => ({
          net: null,
          you: null,
          state: null,
          joinError: message,
          phase: prev.pendingRoom ? "deck" : "menu",
        }));
      },
      onState: (state, dict, you) => {
        if (you) setSeat(room, you);
        const casts = detectCasts(get().state, state, you);
        set((prev) => ({
          state,
          // keep any card data we already had; merge in the fresh slice
          dict: { ...prev.dict, ...dict },
          you,
          castFeed: casts.length ? [...prev.castFeed, ...casts].slice(-3) : prev.castFeed,
        }));
        for (const c of casts) armCastExpiry(c.key);
      },
    });
    set({ net, room, name, savedSeatId });
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

  openMenu: (x, y, card) => set({ menu: { x, y, card } }),
  closeMenu: () => set({ menu: null }),
  setModal: (m) => set({ modal: m }),
  flash: (msg) => {
    set({ toast: msg });
    setTimeout(() => set((s) => (s.toast === msg ? { toast: null } : {})), 2200);
  },
  setFocus: (id) => set({ focus: id }),
  dismissCast: (key) => set((s) => ({ castFeed: s.castFeed.filter((c) => c.key !== key) })),
  pauseCast: (key, paused) =>
    set((s) => ({
      castFeed: s.castFeed.map((c) =>
        c.key === key ? { ...c, paused, at: paused ? c.at : Date.now() } : c,
      ),
    })),

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
