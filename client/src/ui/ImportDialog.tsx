import { useState } from "react";
import { useStore } from "../store";

const SAMPLE = `Deck
4 Lightning Bolt
4 Monastery Swiftspear
4 Goblin Guide
2 Eidolon of the Great Revel
20 Mountain
Sideboard
2 Smash to Smithereens`;

export function ImportDialog() {
  const setModal = useStore((s) => s.setModal);
  const importDeck = useStore((s) => s.importDeck);
  const flash = useStore((s) => s.flash);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setReport(null);
    try {
      const r = await importDeck(text);
      const msgs: string[] = [];
      msgs.push(`Loaded ${r.counts.main} cards${r.counts.commanders ? ` + ${r.counts.commanders} in command zone` : ""}.`);
      if (r.notFound.length) msgs.push(`Not found: ${r.notFound.join(", ")}`);
      if (r.errors.length) msgs.push(r.errors.join("\n"));
      if (!r.notFound.length && !r.errors.length) {
        flash("Deck loaded & shuffled");
        setModal(null);
        return;
      }
      setReport(msgs.join("\n"));
    } catch (e) {
      setReport("Import failed: " + String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onPointerDown={() => !busy && setModal(null)}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Import decklist</h2>
          <button onClick={() => setModal(null)}>Close</button>
        </header>
        <div className="body">
          <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 13 }}>
            Paste a plain-text decklist. Works with Arena / Moxfield / Archidekt "export to text",
            with or without <code>(SET) 123</code> printing codes. Section headers
            (<code>Deck</code>, <code>Sideboard</code>, <code>Commander</code>) are recognized.
          </p>
          <textarea
            rows={14}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          />
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => setText(SAMPLE)}>
            Use sample deck
          </button>
          {report && <div className="warn">{report}</div>}
        </div>
        <div className="foot">
          <button onClick={() => setModal(null)}>Cancel</button>
          <button className="primary" disabled={busy || !text.trim()} onClick={submit}>
            {busy ? "Resolving…" : "Load deck"}
          </button>
        </div>
      </div>
    </div>
  );
}
