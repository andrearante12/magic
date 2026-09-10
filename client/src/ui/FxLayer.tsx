import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import type { Fx } from "@mtg/shared";
import { useStore } from "../store";
import { runImperativeFx } from "../fx/runner";
import { cancelAllFx } from "../fx/ghost";

/** Effects rendered as short-lived React components (need layout / text). */
const RENDERED = new Set<Fx["k"]>(["coin", "die"]);

/**
 * Plays the structured table effects the store drains off the game log. Coin and
 * die are React components with a timed lifecycle; everything else (flying card
 * ghosts, sweeps, floating numbers) is imperative DOM + WAAPI run straight off
 * the queue — no re-renders however many cards move.
 *
 * `animations` off (or the OS asking for reduced motion) still lets a coin /
 * die show its *result*, since those buttons have no other feedback. Only the
 * motion is dropped.
 */
export function FxLayer() {
  const queue = useStore(useShallow((s) => s.fxQueue));
  const animations = useStore((s) => s.animations);
  const you = useStore((s) => s.you);
  const dismissFx = useStore((s) => s.dismissFx);
  const [active, setActive] = useState<{ key: string; fx: Fx }[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const e of queue) {
      if (seen.current.has(e.key)) continue;
      seen.current.add(e.key);
      if (RENDERED.has(e.fx.k)) {
        setActive((a) => [...a, { key: e.key, fx: e.fx }]);
      } else if (animations) {
        runImperativeFx(e, { you });
      }
    }
    if (seen.current.size > 200) seen.current = new Set(queue.map((e) => e.key));
    // Clearing the store queue keeps it short; `seen` guards the re-fire.
    for (const e of queue) dismissFx(e.key);
  }, [queue, animations, you, dismissFx]);

  // Turning animations off mid-flight clears everything.
  useEffect(() => {
    if (!animations) {
      setActive([]);
      cancelAllFx();
    }
  }, [animations]);

  // Leaving the table (FxLayer unmounts) cancels every in-flight animation.
  useEffect(() => () => cancelAllFx(), []);

  const done = useCallback(
    (key: string) => setActive((a) => a.filter((x) => x.key !== key)),
    [],
  );

  if (!active.length) return null;

  return createPortal(
    <div className="fx-layer">
      {active.map(({ key, fx }) => (
        <FxItem key={key} itemKey={key} fx={fx} reduced={!animations} onDone={done} />
      ))}
    </div>,
    document.body,
  );
}

interface ItemProps {
  itemKey: string;
  fx: Fx;
  reduced: boolean;
  onDone: (key: string) => void;
}

function FxItem({ itemKey, fx, reduced, onDone }: ItemProps) {
  if (fx.k === "coin")
    return <CoinFx itemKey={itemKey} seatId={fx.seat} heads={fx.heads} reduced={reduced} onDone={onDone} />;
  if (fx.k === "die")
    return (
      <DieFx
        itemKey={itemKey}
        seatId={fx.seat}
        sides={fx.sides}
        value={fx.value}
        reduced={reduced}
        onDone={onDone}
      />
    );
  return <NoopFx itemKey={itemKey} onDone={onDone} />;
}

function NoopFx({ itemKey, onDone }: { itemKey: string; onDone: (k: string) => void }) {
  useEffect(() => {
    onDone(itemKey);
  }, [itemKey, onDone]);
  return null;
}

/** Centre of the board area, or the viewport centre if it isn't mounted. */
function boardCentre(): { x: number; y: number } {
  const el = document.querySelector(".board-wrap");
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function useSeatName(seatId: string): string {
  return useStore((s) => s.state?.seats.find((x) => x.id === seatId)?.name ?? "Someone");
}

const COIN_MS = 900;
const HOLD_MS = 1100;

function CoinFx({
  itemKey,
  seatId,
  heads,
  reduced,
  onDone,
}: {
  itemKey: string;
  seatId: string;
  heads: boolean;
  reduced: boolean;
  onDone: (k: string) => void;
}) {
  const name = useSeatName(seatId);
  const [pos] = useState(boardCentre);
  const coinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const life = reduced ? 1200 : COIN_MS + HOLD_MS;
    const t = setTimeout(() => onDone(itemKey), life);
    let anim: Animation | undefined;
    if (!reduced && coinRef.current) {
      // Land exactly on the real result: heads = flat, tails = half-turned.
      anim = coinRef.current.animate(
        [
          { transform: "rotateX(0deg)" },
          { transform: `rotateX(${4 * 360 + (heads ? 0 : 180)}deg)` },
        ],
        { duration: COIN_MS, easing: "cubic-bezier(.25,.6,.2,1)", fill: "forwards" },
      );
    }
    return () => {
      clearTimeout(t);
      anim?.cancel();
    };
  }, [itemKey, heads, reduced, onDone]);

  return (
    <div
      className={"fx-coin-wrap" + (reduced ? " reduced" : "")}
      style={{ left: pos.x, top: pos.y }}
    >
      {!reduced && (
        <div className={"fx-coin " + (heads ? "heads" : "tails")} ref={coinRef}>
          <div className="fx-coin-face f-h">◈</div>
          <div className="fx-coin-face f-t">✦</div>
        </div>
      )}
      <div className="fx-result">
        {name}: {heads ? "Heads" : "Tails"}
      </div>
    </div>
  );
}

const DIE_MS = 760;

function DieFx({
  itemKey,
  seatId,
  sides,
  value,
  reduced,
  onDone,
}: {
  itemKey: string;
  seatId: string;
  sides: number;
  value: number;
  reduced: boolean;
  onDone: (k: string) => void;
}) {
  const name = useSeatName(seatId);
  const [pos] = useState(boardCentre);
  const [face, setFace] = useState(() => (reduced ? value : 1 + Math.floor(Math.random() * sides)));
  const dieRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => onDone(itemKey), 1200);
      return () => clearTimeout(t);
    }
    let ticks = 0;
    const iv = setInterval(() => {
      ticks += 1;
      if (ticks >= 9) {
        setFace(value);
        clearInterval(iv);
      } else {
        setFace(1 + Math.floor(Math.random() * sides));
      }
    }, 70);
    const anim = dieRef.current?.animate(
      [
        { transform: "rotate(0deg) scale(.6)" },
        { transform: "rotate(680deg) scale(1)" },
      ],
      { duration: DIE_MS, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
    );
    const t = setTimeout(() => onDone(itemKey), DIE_MS + HOLD_MS);
    return () => {
      clearInterval(iv);
      anim?.cancel();
      clearTimeout(t);
    };
  }, [itemKey, sides, value, reduced, onDone]);

  return (
    <div
      className={"fx-die-wrap" + (reduced ? " reduced" : "")}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="fx-die" ref={dieRef}>
        {face}
      </div>
      <div className="fx-result">
        {name}: d{sides} → {value}
      </div>
    </div>
  );
}
