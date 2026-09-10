import { useEffect, useState } from "react";
import type { Gamemode } from "@mtg/shared";
import { useStore } from "../store";
import { api } from "../api";
import { DecklistInput, emptyDecklist, type DecklistValue } from "./DecklistInput";

type Editing = { id: string | null; name: string; gamemode: Gamemode; list: DecklistValue };

const blank = (): Editing => ({ id: null, name: "", gamemode: "duel", list: emptyDecklist() });

export function DeckManager() {
  const decks = useStore((s) => s.decks);
  const refreshDecks = useStore((s) => s.refreshDecks);
  const setPhase = useStore((s) => s.setPhase);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    refreshDecks();
  }, [refreshDecks]);

  const openNew = () => setEditing(blank());
  const openEdit = async (id: string) => {
    setErr(null);
    try {
      const { deck } = await api.getDeck(id);
      setEditing({
        id: deck.id,
        name: deck.name,
        gamemode: deck.gamemode,
        list: { text: deck.text, counts: null, errors: [], notFound: [] },
      });
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    try {
      const body = { name: editing.name || "Untitled deck", text: editing.list.text, gamemode: editing.gamemode };
      if (editing.id) await api.updateDeck(editing.id, body);
      else await api.createDeck(body);
      await refreshDecks();
      setEditing(null);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteDeck(id);
    await refreshDecks();
  };

  return (
    <div className="join">
      <div className="join-card wide">
        <h1>My decks</h1>

        {!editing && (
          <>
            <div className="deck-grid">
              {decks.map((d) => (
                <div key={d.id} className="deck-tile static">
                  {d.coverImage && <img src={d.coverImage} alt="" />}
                  <div className="deck-tile-body">
                    <b>{d.name}</b>
                    <small>
                      {d.gamemode} · {d.cardCount} cards
                      {d.commanderCount ? ` · ${d.commanderCount} cmdr` : ""}
                    </small>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button className="ghost" onClick={() => openEdit(d.id)}>Edit</button>
                      <button className="ghost" onClick={() => remove(d.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {decks.length === 0 && (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>No decks yet.</p>
              )}
            </div>
            {err && <div className="warn">{err}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setPhase("menu")}>Back</button>
              <button className="primary" style={{ flex: 1 }} onClick={openNew}>
                New deck
              </button>
            </div>
          </>
        )}

        {editing && (
          <>
            <label>Deck name</label>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Mono-Red Aggro"
            />
            <label>Built for</label>
            <div className="seg">
              <button
                className={editing.gamemode === "duel" ? "on" : ""}
                onClick={() => setEditing({ ...editing, gamemode: "duel" })}
              >
                Duel
              </button>
              <button
                className={editing.gamemode === "commander" ? "on" : ""}
                onClick={() => setEditing({ ...editing, gamemode: "commander" })}
              >
                Commander
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <DecklistInput
                value={editing.list}
                onChange={(list) => setEditing({ ...editing, list })}
                commander={editing.gamemode === "commander"}
              />
            </div>
            {err && <div className="warn">{err}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="primary"
                style={{ flex: 1 }}
                disabled={busy || !editing.list.text.trim()}
                onClick={save}
              >
                {busy ? "Saving…" : "Save deck"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
