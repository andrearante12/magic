# MTG Tabletop

A Tabletop-Simulator-style playspace for Magic with an MTG Arena–style board.
Import a decklist, sit down at a virtual table, and move cards freely between
zones. **No rules are enforced** — players tap, move, and track everything
themselves, exactly like the kitchen table. Multiplayer over LAN (and any host
reachable over the network).


## Accounts, decks & lobby settings

You can play as a **guest** (paste a decklist each time) or **create an account**
(email + password) to keep a **deck library**. Either way you **pick a deck before
sitting down**, not after.

Rooms are now **created explicitly**: choose a gamemode (Duel 1v1 or Commander),
a player count, and a starting life total; the server hands back a 6-char room
code to share. Joining an unknown code is an error rather than silently making a
new table.

Data lives in a local SQLite file at `server/data/app.db` (override with
`DB_PATH`; tests use an in-memory DB). It is gitignored.

## Run it

Requires Node 20+. First time:

```bash
npm install
```

### Play with friends (single server — use this to actually play)

```bash
npm start
```

This builds everything and runs one server that hosts the game **and** serves the
UI on port `3000`. On startup it prints the addresses:

```
  MTG tabletop server on port 3000
  local:   http://localhost:3000
  LAN:     http://192.168.1.42:3000   <- share this
```

- You: open `http://localhost:3000`.
- Friends on the same network: open the `LAN:` URL it printed (e.g.
  `http://192.168.1.42:3000`).
- Everyone types the **same room code** on the join screen to land at the same
  table. Pick your own code — the first person to use it creates the room.

To use a different port: `PORT=8080 npm start`.

Playing over the internet instead of a LAN: run `npm start` on a reachable host
(or forward port `3000`) and share that address — nothing else changes.

### Production

The permanent host is **`nucbox`** (`ssh andre@10.128.24.35`), serving on port
`3000` and exposed publicly over HTTPS via Tailscale Funnel.

```bash
systemctl status magic          # service health
journalctl -u magic -f          # live logs
curl localhost:3000/api/health  # {"ok":true,"sha":...,"rooms":N,"players":N}
```

Three things about that box are worth knowing before touching it:

- **Node 24 lives in `/opt/node24`, not apt.** `node:sqlite` needs 24, but the
  box's system Node 18 is load-bearing for unrelated tooling (ROS 2 and friends)
  — replacing it would cascade-remove `npm`, `webpack`, `eslint` and ~20 Debian
  `node-*` packages. Anything running npm there must put `/opt/node24/bin` first
  on `PATH`, because npm's shebang is `#!/usr/bin/env node`.
- **The database lives outside the checkout**, at `/var/lib/magic/app.db` via
  `DB_PATH`, so a bad deploy or a re-clone can never eat accounts and decks.
- **The service runs as the `magic` user** with `WorkingDirectory=/srv/magic`.
  That working directory is mandatory: `CLIENT_DIST` and the Scryfall cache are
  resolved relative to `process.cwd()` and have no env override.

**Deploys are automatic.** A merge to `master` pushes to GitHub, a self-hosted
Actions runner on the box picks it up, and `scripts/deploy.sh` runs
`npm ci && npm test && npm run build` *before* touching the running service, so a
broken commit leaves prod up. It then waits for connected players to disconnect
(rooms are in-memory, so a restart ends every game in progress) before
restarting, and verifies `/api/health` reports the new commit — otherwise the
Actions run goes red. Deploy by hand with `gh workflow run "Deploy to prod"`.

### Development (hot reload)

```bash
npm run dev
```

Runs the API/WebSocket server on `:3000` and the Vite dev client on `:5173` with
hot-module reload. Open `http://localhost:5173`. Use this while changing code;
use `npm start` to actually play.

### Other commands

```bash
npm run build    # type-check + build shared, server, and client
npm test         # decklist parser + reducer + redaction unit tests
```

## How to play

1. **Sit down** with a name and a room code.
2. **Deck** (left rail) → paste a plain-text decklist. Works with Arena /
   Moxfield / Archidekt "export to text", with or without `(SET) 123` printing
   codes. `Deck` / `Sideboard` / `Commander` section headers are recognized.
   Cards resolve through Scryfall (cached to `server/.cache/`).
3. Move cards by **dragging**. Drop targets highlight. Zones: hand, battlefield
   (free positioning), graveyard, exile, command, library.
4. **Click** a battlefield card to tap/untap. **Hover** any card for a large
   preview in the right rail. **Right-click** for the full action menu
   (counters, face-down, transform/flip DFCs, reveal, move to any zone).
5. **Click a pile** to browse it (library click = draw 1; right-click a pile for
   shuffle / mill). **Token** button = Scryfall token search. **Mull** = London
   mulligan.
6. Keyboard: `D` draw, `U` untap all, `S` shuffle, `Esc` close overlays.

## Layout

```
magic/
  shared/   types, the game-state reducer, decklist parser   (used by both sides)
  server/   static host + WebSocket rooms + Scryfall resolver/cache
  client/   React + Vite UI
```

The server is authoritative. Hidden information (library order, opponents'
hands, face-down permanents) is **redacted per-viewer on the server** — a client
never receives a card identity it isn't allowed to see.

## Tests

```bash
npm test          # decklist parser + reducer + redaction unit tests
```

## Not yet built

- Rules enforcement (by design — this is a freeform table).
- Deck import straight from a URL (paste the text export for now; the parser is
  the seam a URL importer would plug into).
- 4-player Commander pod layout (the seat system is generic; the board renders
  1v1 today).
