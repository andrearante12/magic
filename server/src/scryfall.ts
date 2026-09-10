import { promises as fs } from "node:fs";
import path from "node:path";
import type { CardData, CardFace } from "@mtg/shared";
import type { DeckEntry } from "@mtg/shared";

const CACHE_DIR = path.resolve(process.cwd(), "server/.cache");
const CACHE_FILE = path.join(CACHE_DIR, "cards.json");
const UA = "magic-tabletop/0.1 (LAN playtest tool)";
const API = "https://api.scryfall.com";

type RawCard = any;

let cache: Record<string, CardData> = {};
let cacheLoaded = false;

async function loadCache() {
  if (cacheLoaded) return;
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    cache = {};
  }
  cacheLoaded = true;
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
    } catch (e) {
      console.warn("card cache save failed:", e);
    }
  }, 500);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function face(f: RawCard): CardFace {
  return {
    name: f.name ?? "",
    typeLine: f.type_line ?? "",
    manaCost: f.mana_cost ?? "",
    oracleText: f.oracle_text ?? "",
    power: f.power,
    toughness: f.toughness,
    loyalty: f.loyalty,
    image: f.image_uris?.normal ?? f.image_uris?.large ?? "",
  };
}

function normalize(raw: RawCard): CardData {
  const faces: CardFace[] | undefined = Array.isArray(raw.card_faces)
    ? raw.card_faces.map(face)
    : undefined;
  const topImage =
    raw.image_uris?.normal ??
    raw.image_uris?.large ??
    faces?.[0]?.image ??
    "";
  return {
    oracleId: raw.oracle_id ?? raw.id,
    name: raw.name ?? "",
    typeLine: raw.type_line ?? "",
    manaCost: raw.mana_cost ?? "",
    oracleText: raw.oracle_text ?? "",
    power: raw.power,
    toughness: raw.toughness,
    loyalty: raw.loyalty,
    colors: raw.colors ?? raw.color_identity ?? [],
    cmc: raw.cmc ?? 0,
    layout: raw.layout ?? "normal",
    image: topImage,
    faces: faces && faces.some((f) => f.image) ? faces : undefined,
    isToken: raw.layout === "token" || /Token/.test(raw.type_line ?? ""),
  };
}

/** cache key for a deck entry */
const keyOf = (e: { name: string; set?: string; collectorNumber?: string }) =>
  e.set && e.collectorNumber
    ? `${e.set}/${e.collectorNumber}`.toLowerCase()
    : e.name.toLowerCase();

export interface ResolveResult {
  /** oracleId -> CardData */
  dict: Record<string, CardData>;
  /** deck entry (by input order) -> oracleId, or null if unresolved */
  resolved: (string | null)[];
  notFound: string[];
}

/** Resolve a list of deck entries to CardData, batching Scryfall collection calls. */
export async function resolveEntries(entries: DeckEntry[]): Promise<ResolveResult> {
  await loadCache();
  const dict: Record<string, CardData> = {};
  const resolved: (string | null)[] = new Array(entries.length).fill(null);
  const notFound: string[] = [];

  // Which entries still need a network lookup.
  const pending: { idx: number; entry: DeckEntry }[] = [];
  entries.forEach((entry, idx) => {
    const cached = cache[keyOf(entry)];
    if (cached) {
      dict[cached.oracleId] = cached;
      resolved[idx] = cached.oracleId;
    } else {
      pending.push({ idx, entry });
    }
  });

  for (let i = 0; i < pending.length; i += 75) {
    const chunk = pending.slice(i, i + 75);
    const identifiers = chunk.map(({ entry }) =>
      entry.set && entry.collectorNumber
        ? { set: entry.set.toLowerCase(), collector_number: String(entry.collectorNumber) }
        : { name: entry.name },
    );
    let data: any;
    try {
      const res = await fetch(`${API}/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
        body: JSON.stringify({ identifiers }),
      });
      data = await res.json();
    } catch (e) {
      console.warn("scryfall fetch failed:", e);
      chunk.forEach(({ entry }) => notFound.push(entry.name));
      continue;
    }

    const returned: RawCard[] = data?.data ?? [];
    // Match returned cards back to requests by name (case-insensitive) or set/cn.
    for (const { idx, entry } of chunk) {
      let raw: RawCard | undefined;
      if (entry.set && entry.collectorNumber) {
        raw = returned.find(
          (r) =>
            r.set?.toLowerCase() === entry.set!.toLowerCase() &&
            String(r.collector_number) === String(entry.collectorNumber),
        );
      }
      raw ??= returned.find(
        (r) =>
          r.name?.toLowerCase() === entry.name.toLowerCase() ||
          r.name?.toLowerCase().startsWith(entry.name.toLowerCase() + " //"),
      );
      if (!raw) {
        notFound.push(entry.name);
        continue;
      }
      const card = normalize(raw);
      dict[card.oracleId] = card;
      cache[keyOf(entry)] = card;
      resolved[idx] = card.oracleId;
    }
    if (i + 75 < pending.length) await sleep(120);
  }

  scheduleSave();
  return { dict, resolved, notFound };
}

/** Look up token / arbitrary single cards by fuzzy name (for the token picker). */
export async function searchCards(query: string, opts: { tokens?: boolean } = {}) {
  await loadCache();
  const q = opts.tokens ? `${query} type:token` : query;
  try {
    const res = await fetch(`${API}/cards/search?q=${encodeURIComponent(q)}&unique=cards`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    const data = await res.json();
    const cards: CardData[] = (data?.data ?? []).slice(0, 40).map(normalize);
    for (const c of cards) cache[c.oracleId] = c;
    scheduleSave();
    return cards;
  } catch (e) {
    console.warn("scryfall search failed:", e);
    return [];
  }
}

/** Fetch a single card by oracleId if the server doesn't have it cached. */
export function getCached(oracleId: string): CardData | undefined {
  return cache[oracleId];
}
