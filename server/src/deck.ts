// Server-side decklist resolution. Turns raw decklist text into expanded oracleId
// lists + a card dictionary, entirely from the server's own Scryfall layer — the
// client never supplies card data. Shared by the save-deck endpoint and by
// seating a player at the table.

import { parseDecklist, type CardData } from "@mtg/shared";
import { resolveEntries } from "./scryfall.js";

export interface ResolvedDeck {
  /** oracleId -> CardData, for every resolved card */
  dict: Record<string, CardData>;
  /** main-deck oracleIds, in list order, duplicates expanded */
  main: string[];
  /** command-zone oracleIds, expanded */
  commanders: string[];
  cardCount: number;
  commanderCount: number;
  coverImage: string | null;
  errors: string[];
  notFound: string[];
  /** parsed entry counts, before resolution — for deck-requirement checks */
  parsed: { main: { count: number; name: string }[]; commanders: { count: number; name: string }[] };
}

export async function resolveDecklist(text: string): Promise<ResolvedDeck> {
  const parsed = parseDecklist(String(text ?? ""));
  const entries = [...parsed.main, ...parsed.commanders];
  const { dict, resolved, notFound } = await resolveEntries(entries);

  const main: string[] = [];
  const commanders: string[] = [];
  entries.forEach((entry, i) => {
    const oid = resolved[i];
    if (!oid) return;
    const target = i < parsed.main.length ? main : commanders;
    for (let k = 0; k < entry.count; k++) target.push(oid);
  });

  const coverImage =
    (commanders[0] && dict[commanders[0]]?.image) ||
    (main.find((o) => dict[o]?.image) && dict[main.find((o) => dict[o]?.image)!]?.image) ||
    null;

  return {
    dict,
    main,
    commanders,
    cardCount: main.length,
    commanderCount: commanders.length,
    coverImage,
    errors: parsed.errors,
    notFound,
    parsed: {
      main: parsed.main.map((e) => ({ count: e.count, name: e.name })),
      commanders: parsed.commanders.map((e) => ({ count: e.count, name: e.name })),
    },
  };
}
