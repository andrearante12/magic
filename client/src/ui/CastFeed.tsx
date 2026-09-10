import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { faceOf } from "../cardface";

/**
 * Transient popups for cards other seats just put onto the battlefield from hand,
 * shown big enough to read since you may be focused on a different board. Hovering
 * a popup pauses its timer; clicking sends it to the right-rail preview.
 */
export function CastFeed() {
  const feed = useStore(useShallow((s) => s.castFeed));
  const dict = useStore((s) => s.dict);
  const setPreview = useStore((s) => s.setPreview);
  const pauseCast = useStore((s) => s.pauseCast);
  const dismissCast = useStore((s) => s.dismissCast);
  if (!feed.length) return null;

  return (
    <div className="cast-feed">
      {feed.map((ev) => {
        const data = ev.inst.oracleId ? dict[ev.inst.oracleId] ?? null : null;
        const face = faceOf(ev.inst, data);
        return (
          <div
            key={ev.key}
            className="cast-card"
            onMouseEnter={() => pauseCast(ev.key, true)}
            onMouseLeave={() => pauseCast(ev.key, false)}
            onClick={() => {
              setPreview(ev.inst);
              dismissCast(ev.key);
            }}
          >
            {face.img ? (
              <img src={face.img} alt={face.name} draggable={false} />
            ) : (
              <div className="cast-noimg">{face.name || "?"}</div>
            )}
            <div className="cast-cap">
              <b>{ev.controllerName}</b> cast {face.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
