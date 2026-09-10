import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { faceOf } from "../cardface";

export function RightRail() {
  const preview = useStore((s) => s.preview);
  const dict = useStore((s) => s.dict);
  const log = useStore(useShallow((s) => s.state?.log ?? []));
  const dispatch = useStore((s) => s.dispatch);
  const you = useStore((s) => s.you)!;
  const seats = useStore(useShallow((s) => s.state?.seats ?? []));
  const collapsed = useStore((s) => s.railCollapsed);
  const hovered = useStore((s) => s.hovered);
  const toggleRail = useStore((s) => s.toggleRail);
  const logRef = useRef<HTMLDivElement>(null);
  const [chat, setChat] = useState("");

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log.length]);

  const data = preview?.oracleId ? dict[preview.oracleId] ?? null : null;
  const face = preview ? faceOf(preview, data) : null;
  const nameFor = (id: string | null) => seats.find((s) => s.id === id)?.name ?? "";

  // Collapsed: the rail is gone, but the card detail still peeks in while a
  // card is actively hovered. Chat stays hidden until the rail is reopened.
  const peeking = collapsed && !!hovered && !!face;

  const cardInfo = (
    <div className="preview">
      <div className="frame">
        {face?.img ? <img src={face.img} alt={face.name} /> : "hover a card"}
      </div>
      {face && (
        <div className="meta">
          <div className="nm">
            {face.name} <span style={{ color: "var(--muted)" }}>{face.manaCost}</span>
          </div>
          <div className="tl">{face.typeLine}</div>
          {face.oracleText && <div className="ot">{face.oracleText}</div>}
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        className="rail-toggle"
        onClick={toggleRail}
        data-tip={collapsed ? "Show card info & chat" : "Hide panel"}
        aria-label={collapsed ? "Show panel" : "Hide panel"}
      >
        {collapsed ? "‹" : "›"}
      </button>

      {collapsed ? (
        peeking && <div className="rail-right rail-peek">{cardInfo}</div>
      ) : (
        <div className="rail-right">
          {cardInfo}

          <div className="log" ref={logRef}>
            {log.map((l) => (
              <div className={"ln " + l.kind} key={l.id}>
                {l.kind === "chat" && <span className="nm">{nameFor(l.seat)}: </span>}
                {l.text}
              </div>
            ))}
          </div>

          <form
            className="chatbar"
            onSubmit={(e) => {
              e.preventDefault();
              if (chat.trim()) dispatch({ t: "CHAT", seat: you, text: chat.trim() });
              setChat("");
            }}
          >
            <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Say something…" />
          </form>
        </div>
      )}
    </>
  );
}
