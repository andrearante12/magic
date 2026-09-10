import { useEffect, useState } from "react";
import { useStore } from "../store";
import { api, type DeckSummary } from "../api";
import type { DeckChoice } from "../net";
import { DecklistInput, emptyDecklist, type DecklistValue } from "./DecklistInput";

function eligible(deck: DeckSummary, gamemode: string): { ok: boolean; why?: string } {
  if (gamemode === "commander" && deck.commanderCount < 1)
    return { ok: false, why: "no commander" };
  return { ok: true };
}

export function DeckSelectScreen() {
  const pendingRoom = useStore((s) => s.pendingRoom);
  const user = useStore((s) => s.user);
  const decks = useStore((s) => s.decks);
  const refreshDecks = useStore((s) => s.refreshDecks);
  const storedName = useStore((s) => s.name);
  const setPhase = useStore((s) => s.setPhase);
  const sitDown = useStore((s) => s.sitDown);
  const joinError = useStore((s) => s.joinError);

  const [name, setName] = useState(storedName || "");
  const [tab, setTab] = useState<"saved" | "paste">(user && decks.length ? "saved" : "paste");
  const [picked, setPicked] = useState<string | null>(null);
  const [list, setList] = useState<DecklistValue>(emptyDecklist);
  const [saveIt, setSaveIt] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user) refreshDecks();
  }, [user, refreshDecks]);

  if (!pendingRoom) {
    setPhase("menu");
    return null;
  }
  const { code, settings } = pendingRoom;
  const isCommander = settings.gamemode === "commander";
  const shareUrl = `${location.origin}/?room=${code}`;

  const sit = async () => {
    setErr(null);
    if (!name.trim()) return setErr("Enter a name.");
    let choice: DeckChoice;
    try {
      setBusy(true);
      if (tab === "saved") {
        if (!picked) return setErr("Pick a deck."), setBusy(false);
        choice = { deckId: picked };
      } else {
        if (!list.text.trim()) return setErr("Paste a decklist."), setBusy(false);
        if (saveIt && user) {
          const { deck } = await api.createDeck({
            name: saveName || "Imported deck",
            text: list.text,
            gamemode: settings.gamemode,
          });
          await refreshDecks();
          choice = { deckId: deck.id };
        } else {
          choice = { text: list.text };
        }
      }
      sitDown(choice, name.trim());
      // bootstrap takes over from here; errors come back via joinError.
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  };

  return (
    <div className="join">
      <div className="join-card wide">
        <h1>Choose your deck</h1>
        <div className="room-summary">
          <span className="chip">{isCommander ? "Commander" : "Duel"}</span>
          <span className="chip">{settings.maxPlayers} players</span>
          <span className="chip">{settings.startingLife} life</span>
          <span className="chip mono">Room {code}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 14px" }}>
          Share: <span className="mono">{shareUrl}</span>
        </p>

        <label>Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Planeswalker" />

        <div className="seg" style={{ marginTop: 14 }}>
          <button
            className={tab === "saved" ? "on" : ""}
            onClick={() => setTab("saved")}
            disabled={!user}
            title={user ? "" : "Sign in to use saved decks"}
          >
            My decks
          </button>
          <button className={tab === "paste" ? "on" : ""} onClick={() => setTab("paste")}>
            Paste a list
          </button>
        </div>

        {tab === "saved" && (
          <div className="deck-grid">
            {decks.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                No saved decks yet — paste a list, or add some under “My decks”.
              </p>
            )}
            {decks.map((d) => {
              const e = eligible(d, settings.gamemode);
              return (
                <button
                  key={d.id}
                  className={"deck-tile" + (picked === d.id ? " picked" : "") + (e.ok ? "" : " disabled")}
                  disabled={!e.ok}
                  onClick={() => setPicked(d.id)}
                >
                  {d.coverImage && <img src={d.coverImage} alt="" />}
                  <div className="deck-tile-body">
                    <b>{d.name}</b>
                    <small>
                      {d.cardCount} cards
                      {d.commanderCount ? ` · ${d.commanderCount} cmdr` : ""}
                      {e.ok ? "" : ` · ${e.why}`}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {tab === "paste" && (
          <div style={{ marginTop: 12 }}>
            <DecklistInput value={list} onChange={setList} commander={isCommander} />
            {user && (
              <label className="save-row">
                <input type="checkbox" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} />
                Save to my decks
                {saveIt && (
                  <input
                    className="save-name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Deck name"
                  />
                )}
              </label>
            )}
          </div>
        )}

        {(err || joinError) && <div className="warn">{err || joinError}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={() => setPhase("menu")}>Back</button>
          <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={sit}>
            {busy ? "Sitting down…" : "Sit down"}
          </button>
        </div>
      </div>
    </div>
  );
}
