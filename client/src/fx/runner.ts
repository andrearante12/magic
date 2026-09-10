// Imperative players for the structured table effects — everything except the
// coin/die overlays, which are React (in FxLayer). These run on raw DOM nodes
// and the Web Animations API: no component re-renders, however many cards move.

import { useStore } from "../store";
import type { FxEvent } from "../store";
import { faceOf } from "../cardface";
import { createGhost, fly, fizzle, track } from "./ghost";
import { anchorFor, cardRect, zoneRect, seatRect, dist } from "./anchors";
import { consumeSuppressed } from "./suppress";

// Same official card back the piles use.
const CARD_BACK =
  "https://backs.scryfall.io/normal/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg";

const PILE_W = 62;
const PILE_H = 88;
const MAX_GHOSTS = 6;

export interface FxRunCtx {
  you: string | null;
}

export function runImperativeFx(ev: FxEvent, ctx: FxRunCtx): void {
  switch (ev.fx.k) {
    case "shuffle":
      return shuffle(ev.fx.seat);
    case "draw":
      return deal(ev.fx.seat, ev.fx.cardIds, ctx.you, 55);
    case "mulligan":
      return mulligan(ev.fx.seat, ev.fx.cardIds, ctx.you);
    case "move":
      return moveCards(ev);
    case "untapAll":
      return untapSweep(ev.fx.cardIds);
    case "flip":
      return flipCards(ev);
    case "life":
      return lifeDelta(ev.fx.targetSeat, ev.fx.delta);
    case "counter":
      return counterPop(ev.fx.cardId);
    // "tap": the .card CSS transition already animates rotation for everyone.
  }
}

/** Face image for a card the viewer is allowed to see, else null (→ card back). */
function faceImg(cardId: string): string | null {
  const st = useStore.getState();
  const inst = st.state?.seats.flatMap((s) => s.cards).find((c) => c.id === cardId);
  if (!inst || !inst.oracleId) return null;
  return faceOf(inst, st.dict[inst.oracleId] ?? null).img;
}

function placeAt(el: HTMLElement, r: DOMRect): void {
  el.style.position = "fixed";
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
  el.style.margin = "0";
}

// ---- shuffle ---------------------------------------------------------------

function shuffle(seat: string): void {
  const anchor = zoneRect("library", seat) ?? seatRect(seat);
  if (!anchor) return;

  const pileEl = document.querySelector<HTMLElement>(
    `[data-drop="library"][data-controller="${seat}"]`,
  );
  if (pileEl) {
    pileEl.classList.remove("fx-shuffle");
    void pileEl.offsetWidth; // reflow so the keyframe restarts
    pileEl.classList.add("fx-shuffle");
    setTimeout(() => pileEl.classList.remove("fx-shuffle"), 560);
  }

  for (let i = 0; i < 3; i++) {
    const g = createGhost({ back: true });
    placeAt(g, anchor);
    const off = i - 1;
    const a = g.animate(
      [
        { transform: "translate(0,0) rotate(0deg)" },
        { transform: `translate(${off * 24}px,-18px) rotate(${off * 12}deg)`, offset: 0.5 },
        { transform: "translate(0,0) rotate(0deg)" },
      ],
      { duration: 500, delay: i * 45, easing: "ease-in-out", fill: "both" },
    );
    const done = () => g.remove();
    a.finished.then(done, done);
    track(a);
  }
}

// ---- draw / mulligan -----------------------------------------------------

function deal(seat: string, ids: string[], you: string | null, stagger: number): void {
  const srcBase = zoneRect("library", seat) ?? seatRect(seat);
  if (!srcBase) return;
  const src = new DOMRect(srcBase.left, srcBase.top, srcBase.width || PILE_W, srcBase.height || PILE_H);
  const mine = seat === you;
  const shown = ids.slice(0, MAX_GHOSTS);
  const extra = ids.length - shown.length;

  requestAnimationFrame(() => {
    shown.forEach((id, i) => {
      const dst = cardRect(id) ?? zoneRect("hand", seat) ?? seatRect(seat);
      if (!dst) return;
      const img = mine ? faceImg(id) ?? CARD_BACK : null;
      const g = createGhost({ img, back: true, count: i === 0 && extra ? extra + 1 : undefined });
      if (dist(src, dst) < 40) {
        placeAt(g, dst);
        fizzle(g, dst, true);
        return;
      }
      fly(g, src, dst, { duration: 300, delay: i * stagger, arc: 24, spin: -6 });
    });
  });
}

function mulligan(seat: string, ids: string[], you: string | null): void {
  shuffle(seat);
  setTimeout(() => deal(seat, ids, you, 45), 380);
}

// ---- generic zone move -------------------------------------------------

function moveCards(ev: FxEvent): void {
  if (ev.fx.k !== "move") return;
  const { cardIds, from, seat, to, toController } = ev.fx;
  // consumeSuppressed clears the mark for every id, dragged or not.
  const live = cardIds.filter((id) => !consumeSuppressed(id));
  if (!live.length) return; // the whole move was a local drag — already shown

  requestAnimationFrame(() => {
    live.slice(0, MAX_GHOSTS).forEach((id, i) => {
      const pre = ev.pre?.[id];
      const src = pre?.rect ?? anchorFor(from, seat, id) ?? anchorFor(from, toController);
      const dst = cardRect(id) ?? zoneRect(to, toController) ?? seatRect(toController);
      if (!src && !dst) return;
      const img = pre?.img ?? faceImg(id);
      const g = createGhost({ img, back: true });
      if (!src) return void fizzle(g, dst!, true);
      if (!dst) {
        placeAt(g, src);
        return void fizzle(g, src, false);
      }
      if (dist(src, dst) < 30) {
        placeAt(g, dst);
        return void fizzle(g, dst, true);
      }
      fly(g, src, dst, { duration: 270, delay: i * 40 });
    });
  });
}

// ---- untap all: a left-to-right wave ---------------------------------

function untapSweep(ids: string[]): void {
  const els = ids
    .map((id) => document.querySelector<HTMLElement>(`[data-card-id="${cssId(id)}"]`))
    .filter((e): e is HTMLElement => !!e && e.offsetParent !== null)
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

  els.forEach((el, i) => {
    const a = el.animate(
      [{ transform: "rotate(90deg)" }, { transform: "rotate(0deg)" }],
      {
        duration: 240,
        delay: Math.min(i * 22, 300),
        easing: "cubic-bezier(.3,1.35,.5,1)",
        fill: "backwards",
      },
    );
    track(a);
  });
}

// ---- transform / face flip -----------------------------------------

function flipCards(ev: FxEvent): void {
  if (ev.fx.k !== "flip") return;
  for (const id of ev.fx.cardIds) {
    const pre = ev.pre?.[id];
    const rect = pre?.rect ?? cardRect(id);
    if (!rect) continue;
    const cardEl = document.querySelector<HTMLElement>(`[data-card-id="${cssId(id)}"]`);
    const tapped = cardEl?.classList.contains("tapped");
    const base = "perspective(800px) " + (tapped ? "rotate(90deg) " : "");

    const g = createGhost({ img: pre?.img ?? null, back: !pre?.img });
    placeAt(g, rect);

    const half1 = g.animate(
      [{ transform: base + "rotateY(0deg)" }, { transform: base + "rotateY(90deg)" }],
      { duration: 130, easing: "ease-in", fill: "forwards" },
    );
    cardEl?.classList.add("fx-hidden");
    half1.finished.then(
      () => {
        const newImg = faceImg(id);
        const imgEl = g.querySelector("img");
        if (newImg && imgEl) imgEl.src = newImg;
        else if (newImg && !imgEl) {
          const el = document.createElement("img");
          el.src = newImg;
          g.textContent = "";
          g.classList.remove("back");
          g.appendChild(el);
        } else {
          g.textContent = "🂠";
          g.classList.add("back");
        }
        const half2 = g.animate(
          [{ transform: base + "rotateY(-90deg)" }, { transform: base + "rotateY(0deg)" }],
          { duration: 130, easing: "ease-out", fill: "forwards" },
        );
        const fin = () => {
          g.remove();
          cardEl?.classList.remove("fx-hidden");
        };
        half2.finished.then(fin, fin);
        track(half2);
      },
      () => {
        g.remove();
        cardEl?.classList.remove("fx-hidden");
      },
    );
    track(half1);
  }
}

// ---- life / counters -------------------------------------------------

function lifeDelta(seat: string, delta: number): void {
  if (!delta) return;
  const el = document.querySelector<HTMLElement>(`.life[data-seat="${cssId(seat)}"]`);
  const rect = el?.getBoundingClientRect() ?? seatRect(seat);
  if (!rect) return;
  floatNum(rect, delta > 0 ? `+${delta}` : `${delta}`, delta > 0);
  const big = el?.querySelector<HTMLElement>(".big");
  if (big) {
    const a = big.animate(
      delta > 0
        ? [{ filter: "brightness(1)" }, { filter: "brightness(1.6)" }, { filter: "brightness(1)" }]
        : [
            { transform: "translateX(0)" },
            { transform: "translateX(-3px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" },
          ],
      { duration: 320, easing: "ease-in-out" },
    );
    track(a);
  }
}

function counterPop(cardId: string): void {
  const el = document.querySelector<HTMLElement>(`[data-card-id="${cssId(cardId)}"] .counters`);
  if (!el) return;
  const a = el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.35)", offset: 0.5 }, { transform: "scale(1)" }],
    { duration: 300, easing: "cubic-bezier(.3,1.5,.5,1)" },
  );
  track(a);
}

function floatNum(rect: DOMRect, text: string, up: boolean): void {
  const d = document.createElement("div");
  d.className = "fx-num " + (up ? "up" : "down");
  d.textContent = text;
  d.style.left = `${rect.left + rect.width / 2}px`;
  d.style.top = `${rect.top}px`;
  document.body.appendChild(d);
  const a = d.animate(
    [
      { transform: "translate(-50%,0) scale(1)", opacity: 0 },
      { transform: "translate(-50%,-12px) scale(1.1)", opacity: 1, offset: 0.2 },
      { transform: "translate(-50%,-42px) scale(1)", opacity: 0 },
    ],
    { duration: 850, easing: "ease-out", fill: "both" },
  );
  const done = () => d.remove();
  a.finished.then(done, done);
  track(a);
}

const cssId = (s: string) =>
  typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
