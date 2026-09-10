import { useEffect } from "react";
import { useStore } from "../store";
import { HandFan } from "./HandFan";
import { ZonePile } from "./ZonePile";
import { RightRail } from "./RightRail";
import { TurnBar } from "./TurnBar";
import { ContextMenu } from "./ContextMenu";
import { ZoneBrowser } from "./ZoneBrowser";
import { ImportDialog } from "./ImportDialog";
import { TokenPicker } from "./TokenPicker";
import { SeatBoard } from "./SeatBoard";
import { SeatRing } from "./SeatRing";
import { CastFeed } from "./CastFeed";

const PILES = ["library", "graveyard", "exile", "command"] as const;

export function Table() {
  const state = useStore((s) => s.state)!;
  const you = useStore((s) => s.you)!;
  const dispatch = useStore((s) => s.dispatch);
  const modal = useStore((s) => s.modal);
  const setModal = useStore((s) => s.setModal);
  const toast = useStore((s) => s.toast);
  const clearSel = useStore((s) => s.clearSelection);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);

  const mySeat = state.seats.find((x) => x.id === you)!;
  const focusSeat = state.seats.find((x) => x.id === (focus ?? you)) ?? mySeat;
  const isSelf = focusSeat.id === you;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { setModal(null); clearSel(); useStore.getState().closeMenu(); }
      if (e.key.toLowerCase() === "d") dispatch({ t: "DRAW", seat: you, n: 1 });
      if (e.key.toLowerCase() === "u") dispatch({ t: "UNTAP_ALL", seat: you });
      if (e.key.toLowerCase() === "s") dispatch({ t: "SHUFFLE", seat: you });
      if (e.key === "`") setFocus(you);
      const seats = useStore.getState().state?.seats ?? [];
      if (e.key === "Tab") {
        e.preventDefault();
        const cur = seats.findIndex((x) => x.id === (useStore.getState().focus ?? you));
        const nxt = seats[(cur + 1) % seats.length];
        if (nxt) setFocus(nxt.id);
      }
      if (/^[1-9]$/.test(e.key)) {
        const s = seats[parseInt(e.key, 10) - 1];
        if (s) setFocus(s.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, you, setModal, clearSel, setFocus]);

  const mulligan = () => {
    const n = parseInt(prompt("London mulligan: draw 7, then how many to bottom?", "1") ?? "0", 10) || 0;
    dispatch({ t: "MULLIGAN", seat: you, bottomCount: n });
    if (n > 0) useStore.getState().flash(`Now drag ${n} card(s) from hand to library`);
  };

  return (
    <div className="table">
      <div className="rail-left">
        {!isSelf && (
          <>
            <div className="stack-title" title={focusSeat.name}>{focusSeat.name}</div>
            {PILES.map((z) => (
              <ZonePile key={"f" + z} zone={z} controller={focusSeat.id} isSelf={false} />
            ))}
            <div style={{ height: 12 }} />
          </>
        )}
        <div className="stack-title">You</div>
        {PILES.map((z) => (
          <ZonePile key={"m" + z} zone={z} controller={you} isSelf />
        ))}
        <div style={{ flex: 1 }} />
        <button style={{ fontSize: 11, padding: "6px 4px" }} onClick={() => setModal("import")}>
          Deck
        </button>
        <button style={{ fontSize: 11, padding: "6px 4px" }} onClick={() => setModal("token")}>
          Token
        </button>
        <button style={{ fontSize: 11, padding: "6px 4px" }} onClick={mulligan}>
          Mull
        </button>
      </div>

      <div className="playfield" onPointerDown={(e) => { if (e.target === e.currentTarget) clearSel(); }}>
        <TurnBar />

        <div className="board-wrap">
          <SeatRing />
          <SeatBoard seatId={focusSeat.id} isSelf={isSelf} />
          <CastFeed />
        </div>

        <div className="own-hand">
          <HandFan seatId={you} isSelf />
        </div>
      </div>

      <RightRail />

      <ContextMenu />
      {modal === "import" && <ImportDialog />}
      {modal === "token" && <TokenPicker />}
      {modal && typeof modal === "object" && "browse" in modal && (
        <ZoneBrowser controller={modal.browse.controller} zone={modal.browse.zone} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
