import { useState } from "react";
import { api } from "../api";

const SAMPLE = `Deck
4 Lightning Bolt
4 Monastery Swiftspear
4 Goblin Guide
2 Eidolon of the Great Revel
20 Mountain`;

const SAMPLE_EDH = `Commander
1 Krenko, Mob Boss
Deck
30 Mountain
9 Goblin Warchief`;

export interface DecklistValue {
  text: string;
  counts: { main: number; commanders: number } | null;
  errors: string[];
  notFound: string[];
}

/** Textarea + a "check" that resolves the list server-side for a preview. */
export function DecklistInput({
  value,
  onChange,
  commander,
}: {
  value: DecklistValue;
  onChange: (v: DecklistValue) => void;
  commander?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      const p = await api.previewDeck(value.text);
      onChange({ ...value, counts: p.counts, errors: p.errors, notFound: p.notFound });
    } catch (e) {
      onChange({ ...value, errors: [String(e)], notFound: [], counts: null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="decklist-input">
      <textarea
        rows={12}
        value={value.text}
        placeholder={commander ? SAMPLE_EDH : SAMPLE}
        onChange={(e) =>
          onChange({ text: e.target.value, counts: null, errors: [], notFound: [] })
        }
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="ghost"
          onClick={() => onChange({ text: commander ? SAMPLE_EDH : SAMPLE, counts: null, errors: [], notFound: [] })}
        >
          Use sample
        </button>
        <button type="button" onClick={check} disabled={busy || !value.text.trim()}>
          {busy ? "Checking…" : "Check list"}
        </button>
        {value.counts && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {value.counts.main} cards
            {value.counts.commanders ? ` + ${value.counts.commanders} in command zone` : ""}
          </span>
        )}
      </div>
      {(value.errors.length > 0 || value.notFound.length > 0) && (
        <div className="warn" style={{ marginTop: 8 }}>
          {value.notFound.length > 0 && <div>Not found: {value.notFound.join(", ")}</div>}
          {value.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export const emptyDecklist = (): DecklistValue => ({
  text: "",
  counts: null,
  errors: [],
  notFound: [],
});
