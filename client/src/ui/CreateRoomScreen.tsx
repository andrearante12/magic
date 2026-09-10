import { useState } from "react";
import type { Gamemode, RoomSettings } from "@mtg/shared";
import { DEFAULT_SETTINGS, playerRange, normalizeSettings } from "@mtg/shared";
import { useStore } from "../store";

export function CreateRoomScreen() {
  const setPhase = useStore((s) => s.setPhase);
  const createRoom = useStore((s) => s.createRoom);
  const [gamemode, setGamemode] = useState<Gamemode>("duel");
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_SETTINGS.duel.maxPlayers);
  const [startingLife, setStartingLife] = useState(DEFAULT_SETTINGS.duel.startingLife);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const range = playerRange(gamemode);

  const pickMode = (m: Gamemode) => {
    setGamemode(m);
    setMaxPlayers(DEFAULT_SETTINGS[m].maxPlayers);
    setStartingLife(DEFAULT_SETTINGS[m].startingLife);
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const settings: RoomSettings = normalizeSettings({ gamemode, maxPlayers, startingLife });
      await createRoom(settings);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  };

  return (
    <div className="join">
      <div className="join-card">
        <h1>New room</h1>

        <label>Gamemode</label>
        <div className="seg">
          <button className={gamemode === "duel" ? "on" : ""} onClick={() => pickMode("duel")}>
            Duel (1v1)
          </button>
          <button className={gamemode === "commander" ? "on" : ""} onClick={() => pickMode("commander")}>
            Commander
          </button>
        </div>

        <div className="settings-row">
          <div className="field">
            <label>Players</label>
            <div className="stepper">
              <button
                disabled={maxPlayers <= range.min}
                onClick={() => setMaxPlayers((n) => Math.max(range.min, n - 1))}
              >
                −
              </button>
              <span>{maxPlayers}</span>
              <button
                disabled={maxPlayers >= range.max}
                onClick={() => setMaxPlayers((n) => Math.min(range.max, n + 1))}
              >
                +
              </button>
            </div>
            {range.min === range.max && (
              <small style={{ color: "var(--muted)" }}>Duel is always 2.</small>
            )}
          </div>

          <div className="field">
            <label>Starting life</label>
            <input
              type="number"
              min={1}
              max={200}
              value={startingLife}
              onChange={(e) => setStartingLife(parseInt(e.target.value || "0", 10))}
            />
          </div>
        </div>

        {err && <div className="warn">{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={() => setPhase("menu")}>Back</button>
          <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={create}>
            {busy ? "Creating…" : "Create room"}
          </button>
        </div>
      </div>
    </div>
  );
}
