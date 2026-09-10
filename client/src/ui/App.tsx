import { useEffect, useState } from "react";
import { useStore } from "../store";
import { MenuScreen } from "./MenuScreen";
import { CreateRoomScreen } from "./CreateRoomScreen";
import { DeckSelectScreen } from "./DeckSelectScreen";
import { DeckManager } from "./DeckManager";
import { Table } from "./Table";

export function App() {
  const phase = useStore((s) => s.phase);
  const state = useStore((s) => s.state);
  const you = useStore((s) => s.you);
  const connected = useStore((s) => s.connected);
  const net = useStore((s) => s.net);
  const loadSession = useStore((s) => s.loadSession);
  const resumeLastRoom = useStore((s) => s.resumeLastRoom);

  // Resolve the current account once on boot (cookie -> /api/auth/me), then
  // silently rejoin the last room if this tab still has a seat there.
  useEffect(() => {
    loadSession().then(() => resumeLastRoom());
  }, [loadSession, resumeLastRoom]);

  // Auto-reconnect indicator only; net handles retries.
  useEffect(() => () => net?.close(), [net]);

  // Seated at a table.
  if (net && state && you) {
    return (
      <>
        {!connected && (
          <div className="conn-dot">
            <b>reconnecting…</b>
          </div>
        )}
        <Table />
      </>
    );
  }

  // Connecting to a room we just chose a deck for.
  if (net && !you) return <Connecting />;

  // Pre-game screens.
  if (phase === "loading") {
    return (
      <div className="join">
        <div className="join-card">
          <h1>MTG <span>Tabletop</span></h1>
        </div>
      </div>
    );
  }
  if (phase === "create") return <CreateRoomScreen />;
  if (phase === "deck") return <DeckSelectScreen />;
  if (phase === "decks") return <DeckManager />;
  return <MenuScreen />;
}

/** Shown while the socket is opening / the deck is loading. Becomes an
 *  escape hatch if the server can't be reached, instead of spinning forever. */
function Connecting() {
  const connected = useStore((s) => s.connected);
  const leaveRoom = useStore((s) => s.leaveRoom);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const unreachable = slow && !connected;

  return (
    <div className="join">
      <div className="join-card">
        <h1>{unreachable ? "Can't reach the server" : "Sitting down…"}</h1>
        <p style={{ color: "var(--muted)" }}>
          {unreachable
            ? "The table server isn't responding — it may be down. Still retrying."
            : connected
              ? "Loading your deck and joining the table."
              : "Connecting to the table…"}
        </p>
        <button className="ghost" style={{ marginTop: 12 }} onClick={() => leaveRoom()}>
          Back to menu
        </button>
      </div>
    </div>
  );
}
