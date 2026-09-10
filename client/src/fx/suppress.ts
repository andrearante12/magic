// One-shot suppression of the fly animation for a MOVE the local player just
// performed by dragging — the drag ghost already gave full visual continuity, so
// replaying the flight is worse than nothing.
//
// `store.dragging` can't serve this: dnd.ts clears it *before* it sends the
// action, so by the time the server's snapshot echoes back it's already empty.
// This is an explicit short-TTL list instead, populated in dnd's drop handler.

const until = new Map<string, number>();

/** Mark these card ids as "just dragged" for ~`ms` (covers the server round-trip). */
export function suppressFx(ids: string[], ms = 1600): void {
  const t = Date.now() + ms;
  for (const id of ids) until.set(id, t);
}

/** True if `id` was dragged within the window. Consumes the mark. */
export function consumeSuppressed(id: string): boolean {
  const t = until.get(id);
  if (t === undefined) return false;
  until.delete(id);
  return Date.now() <= t;
}
