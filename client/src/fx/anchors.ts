// Screen-rect lookups for the FX layer, using the same [data-drop] /
// [data-controller] convention the drag code already relies on. Every getter
// returns null when its element isn't mounted — which is the common case, since
// only the focused seat's board is on screen at a time — so every caller must
// treat null as "degrade or skip".

import type { Zone } from "@mtg/shared";

function rectOf(sel: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el || el.offsetParent === null) return null;
  return el.getBoundingClientRect();
}

const esc = (s: string) =>
  typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");

export function cardRect(cardId: string): DOMRect | null {
  return rectOf(`[data-card-id="${esc(cardId)}"]`);
}

export function zoneRect(zone: Zone, controller: string): DOMRect | null {
  return rectOf(`[data-drop="${esc(zone)}"][data-controller="${esc(controller)}"]`);
}

export function seatRect(seatId: string): DOMRect | null {
  return rectOf(`.seat-ring .pip[data-seat="${esc(seatId)}"]`);
}

/**
 * Best available anchor for "where card X is / where zone Z is": the card's own
 * element, else its zone pile, else the controller's seat pip on the ring, else
 * null. `seatRect` is the universal fallback because the ring is always mounted.
 */
export function anchorFor(zone: Zone, controller: string, cardId?: string): DOMRect | null {
  return (
    (cardId ? cardRect(cardId) : null) ??
    zoneRect(zone, controller) ??
    seatRect(controller)
  );
}

/** Distance between two rects' centres. */
export function dist(a: DOMRect, b: DOMRect): number {
  return Math.hypot(
    a.left + a.width / 2 - (b.left + b.width / 2),
    a.top + a.height / 2 - (b.top + b.height / 2),
  );
}
