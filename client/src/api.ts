// Thin REST client for accounts, saved decks, and room creation. Cookies carry
// the session, so every call uses credentials: "include".
import type { Gamemode, RoomSettings } from "@mtg/shared";
import type { PublicUser } from "./net";

export interface DeckSummary {
  id: string;
  name: string;
  gamemode: Gamemode;
  cardCount: number;
  commanderCount: number;
  coverImage: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface DeckFull extends DeckSummary {
  text: string;
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  me: () => j<{ user: PublicUser | null }>("/api/auth/me"),
  register: (body: { email: string; password: string; displayName?: string }) =>
    j<{ user: PublicUser }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    j<{ user: PublicUser }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => j<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  listDecks: () => j<{ decks: DeckSummary[] }>("/api/decks"),
  getDeck: (id: string) => j<{ deck: DeckFull }>(`/api/decks/${id}`),
  createDeck: (body: { name: string; text: string; gamemode: Gamemode }) =>
    j<{ deck: DeckSummary; errors: string[]; notFound: string[] }>("/api/decks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDeck: (id: string, body: { name: string; text: string; gamemode: Gamemode }) =>
    j<{ deck: DeckSummary; errors: string[]; notFound: string[] }>(`/api/decks/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteDeck: (id: string) => j<{ ok: true }>(`/api/decks/${id}`, { method: "DELETE" }),

  createRoom: (settings: RoomSettings) =>
    j<{ code: string; settings: RoomSettings }>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ settings }),
    }),
  lookupRoom: async (code: string) => {
    // A 404 here is a valid answer ("no such room"), not a transport error.
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) return { exists: false as const };
    if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
    return data as {
      exists: boolean;
      code?: string;
      settings?: RoomSettings;
      seatsUsed?: number;
      maxPlayers?: number;
    };
  },

  /** Resolve a decklist for preview (counts + errors), without saving. */
  previewDeck: (text: string) =>
    j<{ counts: { main: number; commanders: number }; errors: string[]; notFound: string[]; coverImage: string | null }>(
      "/api/deck",
      { method: "POST", body: JSON.stringify({ text }) },
    ),
};
