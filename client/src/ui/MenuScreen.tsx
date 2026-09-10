import { useState } from "react";
import { PUBLIC_ROOM_CODE } from "@mtg/shared";
import { useStore } from "../store";
import { AuthForm } from "./AuthForm";
import { normalizeCode } from "../menu-util";

type PublicRoom = { code: string; name: string; blurb: string };

// For now there's a single always-on public room. Once players can spin up their
// own public rooms this list gets populated from the server.
const PUBLIC_ROOMS: PublicRoom[] = [
  {
    code: PUBLIC_ROOM_CODE,
    name: "The public table",
    blurb: "Always open — good for quick testing. Reload and you'll drop right back in.",
  },
];

export function MenuScreen() {
  const user = useStore((s) => s.user);
  const signOut = useStore((s) => s.signOut);
  const setPhase = useStore((s) => s.setPhase);
  const enterRoomCode = useStore((s) => s.enterRoomCode);
  const joinPublicTable = useStore((s) => s.joinPublicTable);
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState(normalizeCode(params.get("room") ?? ""));
  const [showAuth, setShowAuth] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => enterRoomCode(code));
  };

  const joinRoom = (room: PublicRoom) =>
    run(() => (room.code === PUBLIC_ROOM_CODE ? joinPublicTable() : enterRoomCode(room.code)));

  return (
    <div className="join">
      <div className="account-corner">
        {user ? (
          <>
            <span className="account-name">
              Signed in as <b>{user.displayName}</b>
            </span>
            <button className="ghost" onClick={() => setPhase("decks")}>My decks</button>
            <button className="ghost" onClick={() => signOut()}>Sign out</button>
          </>
        ) : (
          <>
            <span className="account-name" style={{ color: "var(--muted)" }}>Playing as a guest</span>
            <button className="ghost" onClick={() => setShowAuth((v) => !v)}>
              {showAuth ? "Hide" : "Sign in / Create account"}
            </button>
          </>
        )}
        {!user && showAuth && (
          <div className="account-auth">
            <AuthForm onDone={() => setShowAuth(false)} />
          </div>
        )}
      </div>

      <div className="join-card">
        <h1>
          MTG <span>Tabletop</span>
        </h1>

        <div className="menu-actions">
          <button className="primary big" disabled={busy} onClick={() => setPhase("create")}>
            Create a room
          </button>

          <form onSubmit={join} className="join-code">
            <input
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="Room code"
            />
            <button className="primary" disabled={busy || code.length < 4}>Join</button>
          </form>
        </div>

        <div className="room-list">
          <div className="room-list-head">Public rooms</div>
          {PUBLIC_ROOMS.map((room) => (
            <button
              key={room.code}
              className="room-item"
              disabled={busy}
              onClick={() => joinRoom(room)}
            >
              <span className="room-item-name">
                {room.name}
                {busy && " — joining…"}
              </span>
              <span className="room-item-blurb">{room.blurb}</span>
            </button>
          ))}
        </div>

        {err && <div className="warn">{err}</div>}

        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: "var(--muted)" }}>
          You'll pick a deck before sitting down. Friends on your LAN join at this same URL with the room code.
        </p>
      </div>
    </div>
  );
}
