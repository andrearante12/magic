import { useState } from "react";
import { useStore } from "../store";

/** Inline sign-in / register form used on the menu screen. */
export function AuthForm({ onDone }: { onDone?: () => void }) {
  const signIn = useStore((s) => s.signIn);
  const signUp = useStore((s) => s.signUp);
  const busy = useStore((s) => s.authBusy);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      if (mode === "login") await signIn(email, password);
      else await signUp(email, password, displayName || email.split("@")[0]);
      onDone?.();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
          Sign in
        </button>
        <button type="button" className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
          Create account
        </button>
      </div>
      <label>Email</label>
      <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {mode === "register" && (
        <>
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Planeswalker" />
        </>
      )}
      <label>Password</label>
      <input
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      {err && <div className="warn">{err}</div>}
      <button className="primary" type="submit" disabled={busy} style={{ marginTop: 12 }}>
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
