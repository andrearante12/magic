import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { Card } from "./Card";
import type { DropInfo } from "../dnd";

export function Battlefield({ controller, isSelf }: { controller: string; isSelf: boolean }) {
  const cards = useStore(
    useShallow((s) =>
      (s.state?.seats.flatMap((x) => x.cards) ?? []).filter(
        (c) => c.controller === controller && c.zone === "battlefield",
      ),
    ),
  );
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;

  const onDrop = (d: DropInfo, ids: string[]) => {
    // The server only lets you move your own cards, so this is effectively
    // mine-only regardless of which board is on screen.
    dispatch({
      t: "MOVE",
      seat: you,
      cardIds: ids,
      toZone: "battlefield",
      toController: controller,
      x: d.x,
      y: d.y,
    });
  };

  return (
    <div className="battlefield" data-drop="battlefield" data-controller={controller}>
      <div className="guide-row" style={{ top: "34%" }} />
      <div className="guide-row" style={{ top: "68%" }} />
      {cards.map((c) => (
        <Card
          key={c.id}
          inst={c}
          interactive={isSelf}
          onDrop={onDrop}
          onActivate={(inst) =>
            dispatch({ t: "TAP", seat: you, cardIds: [inst.id], tapped: !inst.tapped })
          }
          style={{
            left: `calc(${(c.x ?? 0.5) * 100}% - var(--card-w) / 2)`,
            top: `calc(${(c.y ?? 0.5) * 100}% - var(--card-h) / 2)`,
            zIndex: c.order + 1,
          }}
        />
      ))}
    </div>
  );
}
