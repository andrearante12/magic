import { useStore } from "../store";

export function LifeCounter({ seatId, isSelf }: { seatId: string; isSelf: boolean }) {
  const seat = useStore((s) => s.state?.seats.find((x) => x.id === seatId));
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;
  if (!seat) return null;

  const setLife = (v: number) => dispatch({ t: "SET_LIFE", seat: you, targetSeat: seatId, value: v });

  return (
    <div
      className={"life" + (isSelf ? " mine" : " opp")}
      data-seat={seatId}
      onWheel={(e) => setLife(seat.life + (e.deltaY < 0 ? 1 : -1))}
      onContextMenu={(e) => {
        e.preventDefault();
        const p = prompt(`${seat.name}: set poison / energy as "p e"`, `${seat.poison} ${seat.energy}`);
        if (p) {
          const [pp, ee] = p.split(/\s+/).map((n) => parseInt(n, 10) || 0);
          dispatch({ t: "SET_POISON", seat: you, targetSeat: seatId, value: pp });
          dispatch({ t: "SET_ENERGY", seat: you, targetSeat: seatId, value: ee });
        }
      }}
    >
      <div className="adj">
        <button onClick={() => setLife(seat.life + 1)}>▲</button>
        <button onClick={() => setLife(seat.life - 1)}>▼</button>
      </div>
      <div className="col">
        <span className="name">{seat.name}{!seat.connected && " (away)"}</span>
        <span className="big" style={{ color: seat.life <= 5 ? "var(--danger)" : undefined }}>
          {seat.life}
        </span>
        <span className="subs">
          {seat.poison > 0 && <span>☠ <b>{seat.poison}</b></span>}
          {seat.energy > 0 && <span>⚡ <b>{seat.energy}</b></span>}
          {Object.entries(seat.counters).map(([k, v]) => (
            <span key={k}>{k} <b>{v}</b></span>
          ))}
        </span>
      </div>
    </div>
  );
}
