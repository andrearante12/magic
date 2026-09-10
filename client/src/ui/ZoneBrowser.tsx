import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import type { Zone } from "@mtg/shared";
import { faceOf } from "../cardface";

const TITLE: Record<string, string> = {
  library: "Library", graveyard: "Graveyard", exile: "Exile", command: "Command Zone",
};
const QUICK: { z: Zone; label: string }[] = [
  { z: "hand", label: "Hand" },
  { z: "battlefield", label: "Field" },
  { z: "graveyard", label: "GY" },
  { z: "exile", label: "Exile" },
];

export function ZoneBrowser({ controller, zone }: { controller: string; zone: Zone }) {
  const setModal = useStore((s) => s.setModal);
  const dispatch = useStore((s) => s.dispatch);
  const dict = useStore((s) => s.dict);
  const you = useStore((s) => s.you)!;
  const mine = controller === you;
  const cards = useStore(
    useShallow((s) =>
      (s.state?.seats.flatMap((x) => x.cards) ?? [])
        .filter((c) => c.controller === controller && c.zone === zone)
        .sort((a, b) => b.order - a.order),
    ),
  );
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return cards.filter((c) => {
      if (c.hidden && zone === "library" && !mine) return true;
      const d = c.oracleId ? dict[c.oracleId] : null;
      if (!needle) return true;
      return d?.name.toLowerCase().includes(needle);
    });
  }, [cards, q, dict, mine, zone]);

  const close = () => setModal(null);

  return (
    <div className="scrim" onPointerDown={close}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {TITLE[zone]} — {cards.length} card(s)
            {zone === "library" && mine && <span style={{ color: "var(--muted)", fontSize: 12 }}>  (order shown; searching does not reveal to opponents)</span>}
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            {zone === "library" && mine && (
              <button onClick={() => { dispatch({ t: "SHUFFLE", seat: you }); }}>Shuffle</button>
            )}
            <button onClick={close}>Close</button>
          </div>
        </header>
        <div className="body">
          <input placeholder="Filter by name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />
          {shown.length === 0 && <div style={{ color: "var(--muted)" }}>Nothing here.</div>}
          <div className="grid-cards">
            {shown.map((c) => {
              const d = c.oracleId ? dict[c.oracleId] : null;
              const face = faceOf(c, d);
              return (
                <div className="gc" key={c.id} title={face.name}>
                  {face.img ? <img src={face.img} alt={face.name} /> : <div className="back" style={{ height: 160 }}>{face.name || "hidden"}</div>}
                  {mine && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 4 }}>
                      {QUICK.filter((x) => x.z !== zone).map((x) => (
                        <button
                          key={x.z}
                          style={{ fontSize: 10, padding: "2px 6px" }}
                          onClick={() => dispatch({ t: "MOVE", seat: you, cardIds: [c.id], toZone: x.z, x: 0.5, y: 0.5 })}
                        >
                          {x.label}
                        </button>
                      ))}
                      {zone === "library" && (
                        <button style={{ fontSize: 10, padding: "2px 6px" }}
                          onClick={() => dispatch({ t: "MOVE", seat: you, cardIds: [c.id], toZone: "library", placement: "bottom" })}>
                          ↓btm
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
