// Minimal pointer-based drag for cards. A drop target is any element with
// [data-drop="<zone>"] and optional [data-controller="<seatId>"]. For the
// battlefield we also compute a normalized 0..1 position inside the target rect.
import type { Zone } from "@mtg/shared";
import { useStore } from "./store";
import { createGhost } from "./fx/ghost";
import { suppressFx } from "./fx/suppress";

export interface DropInfo {
  zone: Zone;
  controller: string;
  x: number;
  y: number;
}

let ghost: HTMLDivElement | null = null;

function makeGhost(imgUrl: string | null, count: number) {
  ghost = createGhost({ img: imgUrl, count, className: "drag-ghost" });
}

function moveGhost(x: number, y: number) {
  if (ghost) {
    ghost.style.left = x + "px";
    ghost.style.top = y + "px";
  }
}

function killGhost() {
  ghost?.remove();
  ghost = null;
  document.querySelectorAll(".drop-hot").forEach((e) => e.classList.remove("drop-hot"));
}

function dropTargetAt(x: number, y: number): { el: HTMLElement; info: DropInfo } | null {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    const zoneEl = (el as HTMLElement).closest?.("[data-drop]") as HTMLElement | null;
    if (zoneEl) {
      const rect = zoneEl.getBoundingClientRect();
      return {
        el: zoneEl,
        info: {
          zone: zoneEl.dataset.drop as Zone,
          controller: zoneEl.dataset.controller ?? "",
          x: clamp((x - rect.left) / rect.width),
          y: clamp((y - rect.top) / rect.height),
        },
      };
    }
  }
  return null;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function startCardDrag(
  e: React.PointerEvent,
  cardIds: string[],
  ghostImg: string | null,
  onDrop: (d: DropInfo) => void,
  onClick?: () => void,
) {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;

  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) > 6) {
      dragging = true;
      makeGhost(ghostImg, cardIds.length);
      useStore.getState().closeMenu();
      // Hide the source card(s) immediately so only the ghost tracks the pointer.
      useStore.getState().setDragging(cardIds);
    }
    if (dragging) {
      moveGhost(ev.clientX, ev.clientY);
      document.querySelectorAll(".drop-hot").forEach((el) => el.classList.remove("drop-hot"));
      dropTargetAt(ev.clientX, ev.clientY)?.el.classList.add("drop-hot");
    }
  };

  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    if (!dragging) {
      onClick?.();
      return;
    }
    const hit = dropTargetAt(ev.clientX, ev.clientY);
    killGhost();
    useStore.getState().setDragging(null);
    if (hit) {
      // The drag already showed the card moving — don't let the echoed MOVE
      // snapshot replay it as a flight.
      suppressFx(cardIds);
      onDrop(hit.info);
    }
  };

  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    killGhost();
    useStore.getState().setDragging(null);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}
