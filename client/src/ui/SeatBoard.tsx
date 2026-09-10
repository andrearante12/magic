import { useStore } from "../store";
import { Battlefield } from "./Battlefield";
import { HandFan } from "./HandFan";
import { LifeCounter } from "./LifeCounter";

/**
 * One seat's board, filling the main stage. Generalizes the old two `.seat-half`
 * divs: only one board is on screen at a time now, selected via the seat ring.
 * Your own hand is rendered separately (always docked at the bottom of the
 * playfield), so it is omitted here when `isSelf`.
 */
export function SeatBoard({ seatId, isSelf }: { seatId: string; isSelf: boolean }) {
  const seat = useStore((s) => s.state?.seats.find((x) => x.id === seatId));
  const isTurn = useStore((s) => s.state?.turn === seatId);
  if (!seat) return null;

  return (
    <div className={"seat-half board-stage" + (isTurn ? " active" : "")}>
      <div className="seat-tag">
        {seat.name}
        {isSelf && " (you)"}
        {!seat.connected && " — away"}
      </div>
      {!isSelf && <HandFan seatId={seatId} isSelf={false} />}
      <Battlefield controller={seatId} isSelf={isSelf} />
      <LifeCounter seatId={seatId} isSelf={isSelf} />
    </div>
  );
}
