import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

/**
 * Non-blocking "walk me through my turn" card. Armed by `store.turnStart` when
 * you become the active player; steps Untap -> Upkeep -> Draw -> Main 1, asking
 * before each advance. When the walkthrough is opted out it runs headless:
 * silently draws for the turn (except the game's first turn) and jumps to Main 1.
 */
export function TurnStartPrompt() {
  const state = useStore((s) => s.state);
  const you = useStore((s) => s.you);
  const dispatch = useStore((s) => s.dispatch);
  const turnStart = useStore((s) => s.turnStart);
  const consumeTurnStart = useStore((s) => s.consumeTurnStart);
  const walkTurns = useStore((s) => s.walkTurns);
  const setWalkTurns = useStore((s) => s.setWalkTurns);

  // turnNumber we've already begun processing — idempotent across effect re-runs.
  const handledRef = useRef<number | null>(null);
  // whether the draw-for-turn already went out this turn.
  const drewRef = useRef(false);
  const [step, setStep] = useState<number | null>(null);

  const firstTurn = turnStart?.turnNumber === 1;

  useEffect(() => {
    if (!turnStart || !you) return;
    if (handledRef.current === turnStart.turnNumber) return;
    handledRef.current = turnStart.turnNumber;
    drewRef.current = false;

    if (!walkTurns) {
      if (turnStart.turnNumber !== 1) {
        dispatch({ t: "DRAW", seat: you, n: 1 });
        drewRef.current = true;
      }
      dispatch({ t: "SET_PHASE", seat: you, phase: "Main 1" });
      consumeTurnStart();
      return;
    }
    setStep(0);
  }, [turnStart, you, walkTurns, dispatch, consumeTurnStart]);

  // If the turn moves off you while the card is open, close it quietly.
  useEffect(() => {
    if (step !== null && state && you && state.turn !== you) {
      setStep(null);
      consumeTurnStart();
    }
  }, [step, state, you, consumeTurnStart]);

  if (step === null || !you || !turnStart) return null;

  const finish = () => {
    setStep(null);
    consumeTurnStart();
  };

  const toMain = (draw: boolean) => {
    if (draw) {
      dispatch({ t: "DRAW", seat: you, n: 1 });
      drewRef.current = true;
    }
    dispatch({ t: "SET_PHASE", seat: you, phase: "Main 1" });
    finish();
  };

  const optOut = () => {
    setWalkTurns(false);
    if (!firstTurn && !drewRef.current) dispatch({ t: "DRAW", seat: you, n: 1 });
    dispatch({ t: "SET_PHASE", seat: you, phase: "Main 1" });
    finish();
  };

  type Card = { title: string; text: string; actions: { label: string; primary?: boolean; run: () => void }[] };
  let card: Card;
  if (step === 0) {
    card = {
      title: "Untap",
      text: "Your permanents are untapped.",
      actions: [
        {
          label: "Continue",
          run: () => {
            dispatch({ t: "SET_PHASE", seat: you, phase: "Upkeep" });
            setStep(1);
          },
        },
      ],
    };
  } else if (step === 1) {
    card = {
      title: "Upkeep",
      text: "Put any upkeep triggers on the stack, then continue.",
      actions: [
        {
          label: "Continue",
          run: () => {
            dispatch({ t: "SET_PHASE", seat: you, phase: "Draw" });
            setStep(2);
          },
        },
      ],
    };
  } else {
    card = firstTurn
      ? {
          title: "Draw step",
          text: "No draw on the game's first turn.",
          actions: [{ label: "Continue", primary: true, run: () => toMain(false) }],
        }
      : {
          title: "Draw step",
          text: "Draw your card for the turn.",
          actions: [
            { label: "Draw for turn", primary: true, run: () => toMain(true) },
            { label: "Skip", run: () => toMain(false) },
          ],
        };
  }

  return (
    <div className="turn-prompt">
      <h4>{card.title}</h4>
      <p>{card.text}</p>
      <div className="tp-actions">
        {card.actions.map((a) => (
          <button key={a.label} className={a.primary ? "primary" : ""} onClick={a.run}>
            {a.label}
          </button>
        ))}
      </div>
      <button className="tp-optout" onClick={optOut}>
        Don’t walk me through turns
      </button>
    </div>
  );
}
