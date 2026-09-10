import { useState } from "react";
import { useStore } from "../store";
import { AuthForm } from "./AuthForm";
import { normalizeCode } from "../menu-util";

export function MenuScreen() {
  const user = useStore((s) => s.user);
  const signOut = useStore((s) => s.signOut);
  const setPhase = useStore((s) => s.setPhase);
  const enterRoomCode = useStore((s) => s.enterRoomCode);
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState(normalizeCode(params.get("room") ?? ""));
  const [showAuth, setShowAuth] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await enterRoomCode(code);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="join">
      <div className="join-card">
        <h1>
          MTG <span>Tabletop</span>
        </h1>

        <div className="who">
          {user ? (
            <>
              Signed in as <b>{user.displayName}</b>
              <button className="ghost" onClick={() => signOut()}>Sign out</button>
              <button className="ghost" onClick={() => setPhase("decks")}>My decks</button>
            </>
          ) : (
            <>
              <span style={{ color: "var(--muted)" }}>Playing as a guest.</span>
              <button className="ghost" onClick={() => setShowAuth((v) => !v)}>
                {showAuth ? "Hide" : "Sign in / Create account"}
              </button>
            </>
          )}
        </div>

        {!user && showAuth && <AuthForm onDone={() => setShowAuth(false)} />}

        <div className="menu-actions">
          <button className="primary big" onClick={() => setPhase("create")}>
            Create a room
          </button>

          <form onSubmit={join} className="join-code">
            <input
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="Room code"
            />
            <button className="primary" disabled={code.length < 4}>Join</button>
          </form>
          {err && <div className="warn">{err}</div>}
        </div>

        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: "var(--muted)" }}>
          You'll pick a deck before sitting down. Friends on your LAN join at this same URL with the room code.
        </p>
      </div>
    </div>
  );
}
