import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { Card } from "./Card";
import type { DropInfo } from "../dnd";

export function HandFan({ seatId, isSelf }: { seatId: string; isSelf: boolean }) {
  const cards = useStore(
    useShallow((s) =>
      (s.state?.seats.find((x) => x.id === seatId)?.cards ?? [])
        .filter((c) => c.zone === "hand")
        .sort((a, b) => a.order - b.order),
    ),
  );
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;

  const onDrop = (d: DropInfo, ids: string[]) => {
    dispatch({
      t: "MOVE",
      seat: you,
      cardIds: ids,
      toZone: d.zone,
      toController: d.controller || you,
      x: d.x,
      y: d.y,
    });
  };

  return (
    <div className={"hand" + (isSelf ? "" : " opponent")} data-drop="hand" data-controller={seatId}>
      {cards.map((c, i) => {
        const n = cards.length;
        const spread = Math.min(4, 40 / Math.max(1, n));
        const rot = (i - (n - 1) / 2) * spread * (isSelf ? 1 : -1);
        return (
          <Card
            key={c.id}
            inst={c}
            interactive={isSelf}
            hoverZoom={false}
            onDrop={onDrop}
            onActivate={(inst) => useStore.getState().setPreview(inst)}
            style={{ ["--rot" as any]: `${rot}deg` }}
          />
        );
      })}
    </div>
  );
}
