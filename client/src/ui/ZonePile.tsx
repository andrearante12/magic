import { useMemo } from "react";
import { useStore } from "../store";
import type { Zone } from "@mtg/shared";
import { faceOf } from "../cardface";
import { startCardDrag } from "../dnd";

const LABEL: Record<string, string> = {
  library: "Library",
  graveyard: "Grave",
  exile: "Exile",
  command: "Cmd",
};

const ICON: Record<string, string> = {
  library: "🂠",
  graveyard: "⚰",
  exile: "✦",
  command: "★",
};

// Official Magic card back (Scryfall CDN, same source as every other card image).
const CARD_BACK = "https://backs.scryfall.io/normal/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg";

export function ZonePile({ zone, controller, isSelf }: { zone: Zone; controller: string; isSelf: boolean }) {
  const dispatch = useStore((s) => s.dispatch);
  const setModal = useStore((s) => s.setModal);
  const openMenu = useStore((s) => s.openMenu);
  const you = useStore((s) => s.you)!;
  const state = useStore((s) => s.state);
  const dict = useStore((s) => s.dict);
  const dragging = useStore((s) => s.dragging);

  // Derive from the stable `state` ref — selectors must not return fresh arrays
  // (that would loop zustand's re-render check).
  const cards = useMemo(
    () =>
      (state?.seats.flatMap((x) => x.cards) ?? []).filter(
        (c) => c.controller === controller && c.zone === zone && !dragging.has(c.id),
      ),
    [state, controller, zone, dragging],
  );

  const count = cards.length;

  // Top of the pile. Library stays face-down (order is hidden info anyway); the
  // other zones are public, so show the card that's sitting on top.
  const top =
    zone === "library"
      ? undefined
      : [...cards].sort((a, b) => a.order - b.order).at(-1);
  const topData = top?.oracleId ? dict[top.oracleId] ?? null : null;
  const topImg =
    zone === "library" ? CARD_BACK : top ? faceOf(top, topData).img : null;

  const handleClick = () => {
    if (zone === "library" && isSelf) {
      dispatch({ t: "DRAW", seat: you, n: 1 });
    } else {
      setModal({ browse: { controller, zone } });
    }
  };

  // You can pick up the top card of any of your own public piles and drag it
  // straight onto the battlefield / hand / another pile. Library stays click-only
  // (its top is hidden), and a plain tap still opens the browser / draws.
  const canDragTop = isSelf && !!top && zone !== "library";

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 2 || !canDragTop || !top) return;
    startCardDrag(
      e,
      [top.id],
      topImg,
      (d) =>
        dispatch({
          t: "MOVE",
          seat: you,
          cardIds: [top.id],
          toZone: d.zone,
          toController: d.controller || you,
          x: d.x,
          y: d.y,
        }),
      handleClick,
    );
  };

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    // Reuse the card menu anchor by faking a pseudo instance for pile ops.
    const t = [...cards].sort((a, b) => a.order - b.order).at(-1);
    if (t) openMenu(e.clientX, e.clientY, t);
  };

  return (
    <div
      className={"pile" + (topImg ? " has-art" : "")}
      data-drop={zone}
      data-controller={controller}
      onClick={canDragTop ? undefined : handleClick}
      onPointerDown={canDragTop ? handlePointerDown : undefined}
      onContextMenu={handleContext}
      title={`${LABEL[zone]} — ${count} card(s)`}
    >
      {topImg && <img className="pile-art" src={topImg} alt="" draggable={false} />}
      <span className="pile-n">{count}</span>
      {!topImg && <span style={{ fontSize: 18 }}>{ICON[zone]}</span>}
      <span className="pile-label">{LABEL[zone]}</span>
    </div>
  );
}
