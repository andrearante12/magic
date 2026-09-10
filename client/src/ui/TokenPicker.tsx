import { useState } from "react";
import { useStore } from "../store";
import type { CardData } from "@mtg/shared";

export function TokenPicker() {
  const setModal = useStore((s) => s.setModal);
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;
  const mergeDict = useStore.setState;
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<CardData[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/search?tokens=1&q=${encodeURIComponent(q)}`);
      const data = await r.json();
      setCards(data.cards ?? []);
      const add: Record<string, CardData> = {};
      for (const c of data.cards ?? []) add[c.oracleId] = c;
      mergeDict((s) => ({ dict: { ...s.dict, ...add } }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onPointerDown={() => setModal(null)}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Create token</h2>
          <button onClick={() => setModal(null)}>Close</button>
        </header>
        <div className="body">
          <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); search(); }}>
            <input placeholder="e.g. Goblin, Treasure, 1/1 Soldier" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="primary" disabled={busy}>{busy ? "…" : "Search"}</button>
          </form>
          <div className="grid-cards" style={{ marginTop: 14 }}>
            {cards.map((c) => (
              <div
                className="gc"
                key={c.oracleId}
                title={c.name}
                onClick={() => {
                  dispatch({ t: "CREATE_TOKEN", seat: you, oracleId: c.oracleId, x: 0.5, y: 0.4 });
                  setModal(null);
                }}
              >
                <img src={c.image} alt={c.name} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
