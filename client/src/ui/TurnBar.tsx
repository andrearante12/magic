import type { CSSProperties } from "react";
import { useStore } from "../store";
import { PHASES, phaseIndex } from "../phases";

export function TurnBar() {
  const state = useStore((s) => s.state)!;
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;
  const flash = useStore((s) => s.flash);
  const leaveRoom = useStore((s) => s.leaveRoom);
  const animations = useStore((s) => s.animations);
  const setAnimations = useStore((s) => s.setAnimations);
  if (!you) return null;

  const leave = () => {
    if (confirm("Leave the table? Your seat and cards are freed for someone else.")) {
      leaveRoom();
    }
  };

  const turnSeat = state.seats.find((x) => x.id === state.turn);
  const myTurn = state.turn === you;
  const idx = phaseIndex(state.activePhase);

  const copyInvite = async () => {
    const url = `${location.origin}/?room=${state.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Join link copied");
    } catch {
      flash(`Room ${state.roomCode}`);
    }
  };

  return (
    <div className="turnbar">
      <div className="tb-group tb-left">
        <button className="tb-room mono" onClick={copyInvite} title="Copy join link">
          {state.roomCode}
        </button>
        <button className="tb-leave" onClick={leave} title="Leave the table">
          Leave
        </button>
        <span className="tb-turn">Turn {state.turnNumber}</span>
        <span
          className={"tb-active" + (myTurn ? " you" : "")}
          title={myTurn ? "Your turn" : `${turnSeat?.name ?? "—"}'s turn`}
        >
          {turnSeat?.name ?? "—"}
        </span>
      </div>

      <div className="tb-group tb-center">
        <div
          className="tb-track"
          role="tablist"
          style={{ "--seg": idx } as CSSProperties}
        >
          <span className="tb-track-fill" aria-hidden />
          {PHASES.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === idx}
              className={"tb-seg" + (i === idx ? " on" : "")}
              title={p.description}
              onClick={() => dispatch({ t: "SET_PHASE", seat: you, phase: p.id })}
            >
              {p.short}
            </button>
          ))}
        </div>
      </div>

      <div className="tb-group tb-right">
        <div className="tb-tools">
          <button
            className="tb-icon"
            title="Untap all (u)"
            aria-label="Untap all"
            onClick={() => dispatch({ t: "UNTAP_ALL", seat: you })}
          >
            <IconUntap />
          </button>
          <button
            className="tb-icon"
            title="Shuffle library (s)"
            aria-label="Shuffle library"
            onClick={() => dispatch({ t: "SHUFFLE", seat: you })}
          >
            <IconShuffle />
          </button>
          <button
            className="tb-icon"
            title="Roll a d6"
            aria-label="Roll a d6"
            onClick={() => dispatch({ t: "ROLL_DIE", seat: you, sides: 6 })}
          >
            <IconDie />
          </button>
          <button
            className="tb-icon"
            title="Flip a coin"
            aria-label="Flip a coin"
            onClick={() => dispatch({ t: "FLIP_COIN", seat: you })}
          >
            <IconCoin />
          </button>
          <button
            className={"tb-icon" + (animations ? " on" : "")}
            title={animations ? "Animations on" : "Animations off"}
            aria-label="Toggle animations"
            aria-pressed={animations}
            onClick={() => setAnimations(!animations)}
          >
            <IconSparkle />
          </button>
        </div>
        <button
          className={"tb-pass" + (myTurn ? " primary" : "")}
          onClick={() => dispatch({ t: "PASS_TURN", seat: you })}
        >
          Pass turn
        </button>
      </div>
    </div>
  );
}

/* --- inline icons (14px, stroke = currentColor, no dependency) --- */

const S = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconUntap() {
  return (
    <svg {...S}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

function IconShuffle() {
  return (
    <svg {...S}>
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

function IconDie() {
  return (
    <svg {...S}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconCoin() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 15c.7.8 1.6 1.2 2.5 1.2 1.5 0 2.5-.9 2.5-2.1 0-3-4.8-1.8-4.8-4.4 0-1.1 1-2 2.4-2 .9 0 1.7.4 2.3 1" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg {...S}>
      <path d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7 10.2 7.9z" />
      <path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}
