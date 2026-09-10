// Tolerant decklist parser covering the formats every deck site can export to.
//
//   4 Lightning Bolt
//   4x Lightning Bolt
//   4 Lightning Bolt (MSC) 806      <- Arena / Moxfield export with set + collector no.
//   Deck / Sideboard / Commander / Maybeboard   <- section headers
//   // comments, # comments, and blank lines are ignored
//   SB: 2 Negate                    <- MTGO-style sideboard prefix

export interface DeckEntry {
  count: number;
  name: string;
  set?: string;
  collectorNumber?: string;
}

export interface ParsedDeck {
  main: DeckEntry[];
  sideboard: DeckEntry[];
  commanders: DeckEntry[];
  errors: string[];
}

type Section = "main" | "sideboard" | "commanders";

const SECTION_HEADERS: Record<string, Section> = {
  deck: "main",
  main: "main",
  mainboard: "main",
  sideboard: "sideboard",
  side: "sideboard",
  sb: "sideboard",
  commander: "commanders",
  commanders: "commanders",
  companion: "commanders",
};

// "4 Name", "4x Name", optional "(SET) 123" / "(SET) 123 *F*" suffix.
const LINE_RE =
  /^(\d+)\s*[xX]?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)\s+([A-Za-z0-9-]+))?\s*(?:\*[^*]*\*\s*)?$/;

export function parseDecklist(input: string): ParsedDeck {
  const out: ParsedDeck = { main: [], sideboard: [], commanders: [], errors: [] };
  let section: Section = "main";
  const lines = input.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i].trim();
    if (!raw || raw.startsWith("//") || raw.startsWith("#")) continue;

    // Inline MTGO-style "SB: 2 Card"
    const sbPrefix = raw.match(/^SB:\s*(.+)$/i);
    let forceSection: Section | null = null;
    if (sbPrefix) {
      forceSection = "sideboard";
      raw = sbPrefix[1].trim();
    }

    // Section header line (no leading count).
    const headerKey = raw.replace(/[:\-\s]+$/, "").toLowerCase();
    if (!/^\d/.test(raw) && SECTION_HEADERS[headerKey]) {
      section = SECTION_HEADERS[headerKey];
      continue;
    }
    // "About" / "Name ..." metadata blocks from Arena exports — skip quietly.
    if (!/^\d/.test(raw)) {
      if (/^(about|name)\b/i.test(raw)) continue;
      out.errors.push(`Line ${i + 1}: could not parse "${lines[i].trim()}"`);
      continue;
    }

    const m = raw.match(LINE_RE);
    if (!m) {
      out.errors.push(`Line ${i + 1}: could not parse "${lines[i].trim()}"`);
      continue;
    }
    const entry: DeckEntry = {
      count: parseInt(m[1], 10),
      name: m[2].trim(),
      set: m[3]?.toUpperCase(),
      collectorNumber: m[4],
    };
    if (!entry.count || !entry.name) {
      out.errors.push(`Line ${i + 1}: could not parse "${lines[i].trim()}"`);
      continue;
    }
    (out[forceSection ?? section] as DeckEntry[]).push(entry);
  }

  return out;
}
