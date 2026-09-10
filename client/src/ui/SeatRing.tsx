import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";

/**
 * Minimap of the pod: player pips seated around an oval, YOUR seat pinned at the
 * bottom so the ring reads as "the table from where I sit". Click a pip to make
 * that seat's board fill the main stage. Scales to any seat count — the ring just
 * divides 360°, nothing is enumerated.
 */
export function SeatRing() {
  const seats = useStore(useShallow((s) => s.state?.seats ?? []));
  const you = useStore((s) => s.you)!;
  const turn = useStore((s) => s.state?.turn ?? null);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const focused = focus ?? you;

  const n = seats.length;
  const myIdx = Math.max(0, seats.findIndex((s) => s.id === you));

  return (
    <div className={"seat-ring" + (n > 6 ? " crowded" : "")}>
      <div className="ring-oval" />
      {seats.map((seat, i) => {
        // rotate so my seat lands at 90° (bottom of the oval)
        const ang = (((i - myIdx) / n) * 360 + 90) * (Math.PI / 180);
        const cx = 50 + 40 * Math.cos(ang);
        const cy = 50 + 42 * Math.sin(ang);
        const cls = [
          "pip",
          seat.id === focused ? "on" : "",
          turn === seat.id ? "turn" : "",
          seat.connected ? "" : "away",
        ].join(" ");
        const hand = seat.cards.filter((c) => c.zone === "hand").length;
        return (
          <button
            key={seat.id}
            className={cls}
            style={{ left: `${cx}%`, top: `${cy}%` }}
            onClick={() => setFocus(seat.id)}
            title={`${seat.name} — ${seat.life} life · ${hand} in hand`}
          >
            <span className="pip-init">{initials(seat.name)}</span>
            <span className="pip-life">{seat.life}</span>
          </button>
        );
      })}
    </div>
  );
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}
