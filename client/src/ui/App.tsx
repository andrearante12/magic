import { useEffect } from "react";
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

  // Resolve the current account once on boot (cookie -> /api/auth/me).
  useEffect(() => {
    loadSession();
  }, [loadSession]);

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
  if (net && !you) {
    return (
      <div className="join">
        <div className="join-card">
          <h1>Sitting down…</h1>
          <p style={{ color: "var(--muted)" }}>Loading your deck and joining the table.</p>
        </div>
      </div>
    );
  }

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
