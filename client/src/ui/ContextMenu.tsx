import { useEffect } from "react";
import { useStore } from "../store";
import type { Zone } from "@mtg/shared";

const ZONES: { z: Zone; label: string }[] = [
  { z: "hand", label: "Hand" },
  { z: "battlefield", label: "Battlefield" },
  { z: "graveyard", label: "Graveyard" },
  { z: "exile", label: "Exile" },
  { z: "library", label: "Library (top)" },
  { z: "command", label: "Command" },
];

export function ContextMenu() {
  const menu = useStore((s) => s.menu);
  const close = useStore((s) => s.closeMenu);
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;
  const selected = useStore((s) => s.selected);
  const dict = useStore((s) => s.dict);

  useEffect(() => {
    if (!menu) return;
    const h = () => close();
    window.addEventListener("pointerdown", h);
    window.addEventListener("blur", h);
    return () => {
      window.removeEventListener("pointerdown", h);
      window.removeEventListener("blur", h);
    };
  }, [menu, close]);

  if (!menu) return null;
  const c = menu.card;
  const ids = selected.has(c.id) && selected.size > 1 ? [...selected] : [c.id];
  const isMine = c.owner === you || c.controller === you;
  const data = c.oracleId ? dict[c.oracleId] : null;
  const isDfc = !!data?.faces && data.faces.length >= 2;

  const act = (fn: () => void) => () => {
    fn();
    close();
  };
  const move = (z: Zone, placement?: "top" | "bottom") =>
    act(() =>
      dispatch({
        t: "MOVE",
        seat: you,
        cardIds: ids,
        toZone: z,
        placement: z === "library" ? placement ?? "top" : undefined,
        x: 0.5,
        y: 0.5,
      }),
    );

  const style: React.CSSProperties = {
    left: Math.min(menu.x, window.innerWidth - 210),
    top: Math.min(menu.y, window.innerHeight - 380),
  };

  return (
    <div className="menu" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <div className="head">{ids.length > 1 ? `${ids.length} cards` : data?.name ?? "Card"}</div>

      {isMine && c.zone === "battlefield" && (
        <>
          <button onClick={act(() => dispatch({ t: "TAP", seat: you, cardIds: ids, tapped: !c.tapped }))}>
            {c.tapped ? "Untap" : "Tap"}
          </button>
          <button onClick={act(() => dispatch({ t: "FLIP_FACEDOWN", seat: you, cardIds: ids, faceDown: !c.faceDown }))}>
            Turn {c.faceDown ? "face up" : "face down"}
          </button>
          {isDfc && (
            <button onClick={act(() => dispatch({ t: "TRANSFORM", seat: you, cardIds: ids }))}>
              Transform / flip
            </button>
          )}
          <div className="sep" />
          <div className="head">Counters</div>
          {["+1/+1", "-1/-1", "loyalty", "charge"].map((k) => (
            <button
              key={k}
              onClick={act(() =>
                dispatch({ t: "SET_COUNTER", seat: you, cardId: c.id, key: k, value: (c.counters[k] ?? 0) + 1 }),
              )}
            >
              +1 {k}
            </button>
          ))}
          <button
            onClick={act(() => {
              const k = prompt("Remove which counter?", "+1/+1");
              if (k) dispatch({ t: "SET_COUNTER", seat: you, cardId: c.id, key: k, value: (c.counters[k] ?? 1) - 1 });
            })}
          >
            −1 counter…
          </button>
          <div className="sep" />
        </>
      )}

      {isMine && (
        <>
          <button onClick={act(() => dispatch({ t: "REVEAL", seat: you, cardIds: ids, reveal: !c.revealed }))}>
            {c.revealed ? "Hide from table" : "Reveal to table"}
          </button>
          <div className="sep" />
          <div className="head">Move to</div>
          {ZONES.map(({ z, label }) => (
            <button key={z} onClick={move(z)} disabled={z === c.zone && c.zone !== "battlefield"}>
              {label}
            </button>
          ))}
          <button onClick={move("library", "bottom")}>Library (bottom)</button>
        </>
      )}

      {!isMine && <button onClick={close}>Close</button>}
    </div>
  );
}
