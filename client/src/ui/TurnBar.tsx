import { useStore } from "../store";

const PHASES = ["Untap", "Upkeep", "Draw", "Main 1", "Combat", "Main 2", "End"];

export function TurnBar() {
  const state = useStore((s) => s.state)!;
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;
  const turnSeat = state.seats.find((x) => x.id === state.turn);
  const myTurn = state.turn === you;

  return (
    <div className="turnbar">
      <span className="pill">Turn {state.turnNumber}</span>
      <span className="pill on">{turnSeat?.name ?? "—"}</span>
      {PHASES.map((p) => (
        <button
          key={p}
          className={"pill" + (state.activePhase === p ? " on" : "")}
          onClick={() => dispatch({ t: "SET_PHASE", seat: you, phase: p })}
        >
          {p}
        </button>
      ))}
      <button onClick={() => dispatch({ t: "UNTAP_ALL", seat: you })}>Untap all</button>
      <button onClick={() => dispatch({ t: "SHUFFLE", seat: you })}>Shuffle</button>
      <button onClick={() => dispatch({ t: "ROLL_DIE", seat: you, sides: 6 })}>d6</button>
      <button onClick={() => dispatch({ t: "FLIP_COIN", seat: you })}>Coin</button>
      <button className={myTurn ? "primary" : ""} onClick={() => dispatch({ t: "PASS_TURN", seat: you })}>
        Pass turn
      </button>
    </div>
  );
}
