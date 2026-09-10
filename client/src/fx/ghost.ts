// Floating card-shaped DOM elements, animated with the Web Animations API and
// appended straight to <body> — never React-rendered, so a burst of them (a
// mulligan, a big move) costs zero component renders. Shared by dnd.ts (the drag
// ghost, cursor-tracked) and the FX layer (cards that fly between zones).

// Keep in sync with --card-w / --card-h in styles.css.
const CARD_W = 144;
const CARD_H = 201;

export interface GhostOpts {
  img?: string | null;
  /** Render the Magic card back instead of an image. */
  back?: boolean;
  /** Badge in the corner when more than one card is represented. */
  count?: number;
  /** Defaults to "fx-ghost"; dnd passes "drag-ghost" to keep its own styling. */
  className?: string;
}

export function createGhost(opts: GhostOpts): HTMLDivElement {
  const el = document.createElement("div");
  el.className = opts.className ?? "fx-ghost";
  if (opts.img) {
    const img = document.createElement("img");
    img.src = opts.img;
    el.appendChild(img);
  } else {
    if (opts.back) el.classList.add("back");
    el.textContent = "🂠";
  }
  if (opts.count && opts.count > 1) {
    const b = document.createElement("span");
    b.className = "drag-count";
    b.textContent = String(opts.count);
    el.appendChild(b);
  }
  document.body.appendChild(el);
  return el;
}

// Every in-flight animation, tracked so leaveRoom / FxLayer unmount can cancel
// the lot in one call.
const live = new Set<Animation>();

export function track(a: Animation): Animation {
  live.add(a);
  const drop = () => live.delete(a);
  a.finished.then(drop, drop);
  return a;
}

/** Cancel every tracked animation and sweep away any stray fx nodes. */
export function cancelAllFx(): void {
  for (const a of [...live]) a.cancel();
  live.clear();
  document.querySelectorAll(".fx-ghost, .fx-num").forEach((e) => e.remove());
}

export interface FlyOpts {
  duration?: number;
  delay?: number;
  easing?: string;
  /** Extra rotation over the flight, degrees. */
  spin?: number;
  /** Peak upward lift at the midpoint, px — a gentle arc. */
  arc?: number;
  /** Transform prefix to preserve for the whole flight, e.g. "rotate(90deg)". */
  base?: string;
  fade?: "in" | "out";
}

/**
 * Fly `el` from screen rect `from` to screen rect `to`, scaling between their
 * sizes. The node is positioned at the source and only transforms are animated
 * (compositor-only). It is removed when the animation settles, cancel included —
 * so a ghost can never be orphaned on screen.
 */
export function fly(el: HTMLElement, from: DOMRect, to: DOMRect, o: FlyOpts = {}): Animation {
  const base = o.base ? o.base + " " : "";
  el.style.position = "fixed";
  el.style.left = `${from.left}px`;
  el.style.top = `${from.top}px`;
  el.style.width = `${from.width || CARD_W}px`;
  el.style.height = `${from.height || CARD_H}px`;
  el.style.margin = "0";

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const s = (to.width || CARD_W) / (from.width || CARD_W);
  const spin = o.spin ?? 0;
  const arc = o.arc ?? 0;

  const frames: Keyframe[] = [
    { transform: `${base}translate(0px,0px) scale(1) rotate(0deg)`, opacity: o.fade === "in" ? 0 : 1 },
    {
      transform: `${base}translate(${dx / 2}px,${dy / 2 - arc}px) scale(${(1 + s) / 2}) rotate(${spin / 2}deg)`,
      offset: 0.5,
    },
    { transform: `${base}translate(${dx}px,${dy}px) scale(${s}) rotate(${spin}deg)`, opacity: o.fade === "out" ? 0 : 1 },
  ];
  const a = el.animate(frames, {
    duration: o.duration ?? 300,
    delay: o.delay ?? 0,
    easing: o.easing ?? "cubic-bezier(.22,.7,.3,1)",
    fill: "both",
  });
  const done = () => el.remove();
  a.finished.then(done, done);
  return track(a);
}

/** A short in-place fade — used when the flight's destination can't be located. */
export function fizzle(el: HTMLElement, at: DOMRect, fadeIn = false): Animation {
  el.style.position = "fixed";
  el.style.left = `${at.left}px`;
  el.style.top = `${at.top}px`;
  el.style.width = `${at.width || CARD_W}px`;
  el.style.height = `${at.height || CARD_H}px`;
  el.style.margin = "0";
  const a = el.animate(
    fadeIn
      ? [{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "scale(1)" }]
      : [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.12)" }],
    { duration: 240, easing: "ease-out", fill: "both" },
  );
  const done = () => el.remove();
  a.finished.then(done, done);
  return track(a);
}
