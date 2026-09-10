import { useStore } from "../store";
import type { CardInstance } from "@mtg/shared";
import { faceOf } from "../cardface";
import { startCardDrag, type DropInfo } from "../dnd";

interface Props {
  inst: CardInstance;
  style?: React.CSSProperties;
  className?: string;
  /** enable drag + tap + context menu (your own cards) */
  interactive?: boolean;
  /** where a drag of this card should send it */
  onDrop?: (d: DropInfo, ids: string[]) => void;
  /** click without drag */
  onActivate?: (inst: CardInstance) => void;
  hoverZoom?: boolean;
}

export function Card({ inst, style, className = "", interactive, onDrop, onActivate, hoverZoom = true }: Props) {
  const data = useStore((s) => (inst.oracleId ? s.dict[inst.oracleId] ?? null : null));
  const selected = useStore((s) => s.selected.has(inst.id));
  const beingDragged = useStore((s) => s.dragging.has(inst.id));
  const setPreview = useStore((s) => s.setPreview);
  const setHovered = useStore((s) => s.setHovered);
  const openMenu = useStore((s) => s.openMenu);
  const selectedIds = useStore((s) => s.selected);

  const face = faceOf(inst, data);
  const showBack = inst.hidden || (inst.faceDown && !inst.revealed && !interactive) || (inst.faceDown && !inst.revealed && inst.zone === "library");
  const faceDownToMe = inst.faceDown && !inst.revealed;

  // +1/+1 and -1/-1 applied visually to printed P/T.
  const plus = inst.counters["+1/+1"] ?? 0;
  const minus = inst.counters["-1/-1"] ?? 0;
  let ptText: string | null = null;
  if (face.power !== undefined && face.toughness !== undefined) {
    const p = num(face.power) + plus - minus;
    const t = num(face.toughness) + plus - minus;
    ptText = `${p}/${t}`;
  } else if (face.loyalty !== undefined) {
    ptText = String(num(face.loyalty) + (inst.counters["loyalty"] ?? 0));
  }

  const cls = [
    "card",
    inst.tapped ? "tapped" : "",
    selected ? "selected" : "",
    beingDragged ? "drag-src" : "",
    hoverZoom ? "hoverable" : "",
    className,
  ].join(" ");

  const ids = () => (selectedIds.has(inst.id) && selectedIds.size > 1 ? [...selectedIds] : [inst.id]);

  return (
    <div
      className={cls}
      style={style}
      data-card-id={inst.id}
      onMouseEnter={() => {
        if (showBack) return;
        setPreview(inst);
        setHovered(inst.id);
      }}
      onMouseLeave={() => setHovered(null)}
      onPointerDown={(e) => {
        if (e.button === 2) return;
        if (!interactive) {
          // opponent / non-interactive: click just previews
          if (!showBack) setPreview(inst);
          return;
        }
        startCardDrag(
          e,
          ids(),
          face.img,
          (d) => onDrop?.(d, ids()),
          () => onActivate?.(inst),
        );
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (interactive || inst.zone === "battlefield") openMenu(e.clientX, e.clientY, inst);
      }}
    >
      {showBack || (faceDownToMe && !interactive) ? (
        <div className="back">🂠</div>
      ) : face.img ? (
        <img src={face.img} alt={face.name} draggable={false} />
      ) : (
        <div className="back">{face.name || "?"}</div>
      )}

      {!showBack && Object.keys(inst.counters).length > 0 && (
        <div className="counters">
          {Object.entries(inst.counters).map(([k, v]) => (
            <span className="chip" key={k}>
              {k === "+1/+1" ? `+${v}/+${v}` : k === "loyalty" ? `◆${v}` : `${k} ${v}`}
            </span>
          ))}
        </div>
      )}
      {!showBack && ptText && inst.zone === "battlefield" && <div className="pt">{ptText}</div>}
    </div>
  );
}

function num(s: string | undefined): number {
  const n = parseInt(s ?? "0", 10);
  return Number.isNaN(n) ? 0 : n;
}
