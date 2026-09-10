#!/usr/bin/env bash
# Production deploy, run by .github/workflows/deploy.yml on the self-hosted
# runner. Assumes the checkout at APP_DIR has already been reset to the target
# commit. Builds first and only touches the running service once the build is
# known good, so a broken commit leaves prod up.
set -euo pipefail

# Node 24 lives in /opt/node24 rather than apt, because this box's system Node
# 18 is load-bearing for other tooling and node:sqlite needs 24. npm's shebang
# is `#!/usr/bin/env node`, so this must come first or npm runs under Node 18.
NODE_HOME="${NODE_HOME:-/opt/node24}"
[[ -d "$NODE_HOME/bin" ]] && export PATH="$NODE_HOME/bin:$PATH"

APP_DIR="${APP_DIR:-/srv/magic}"
PORT="${PORT:-3000}"
HEALTH="http://127.0.0.1:${PORT}/api/health"
SERVICE="magic"

# How long to wait for players to disconnect before restarting anyway.
DRAIN_TIMEOUT_SECS="${DRAIN_TIMEOUT_SECS:-600}"
DRAIN_POLL_SECS=10

cd "$APP_DIR"
SHA="$(git rev-parse HEAD)"
echo "==> Deploying ${SHA:0:8} from $APP_DIR"

# Read one field out of the health endpoint. Prints nothing if the server is
# down or the response isn't JSON, which every caller treats as "not up".
health_field() {
  curl -fsS --max-time 5 "$HEALTH" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];console.log(v??"")}catch{}})' "$1" \
    2>/dev/null || true
}

# ---- build (before touching the service) ---------------------------------
echo "==> npm ci"
npm ci

echo "==> npm test"
npm test

echo "==> npm run build"
npm run build

# ---- drain ---------------------------------------------------------------
# Rooms are in-memory only (server/src/rooms.ts), so a restart ends every game
# in progress. Wait for the table to clear rather than cutting players off.
echo "==> Draining (timeout ${DRAIN_TIMEOUT_SECS}s)"
deadline=$(( SECONDS + DRAIN_TIMEOUT_SECS ))
while (( SECONDS < deadline )); do
  players="$(health_field players)"
  if [[ -z "$players" ]]; then
    echo "    server not responding — nothing to drain"
    break
  fi
  if [[ "$players" == "0" ]]; then
    echo "    no players connected"
    break
  fi
  echo "    $players player(s) still connected, waiting ${DRAIN_POLL_SECS}s…"
  sleep "$DRAIN_POLL_SECS"
done
[[ "$(health_field players)" == "0" ]] || echo "    drain timed out — restarting anyway"

# ---- restart -------------------------------------------------------------
# Picked up via EnvironmentFile in magic.service so /api/health reports the
# live commit. Written before the restart so the new process sees it.
echo "GIT_SHA=$SHA" > "$APP_DIR/.deploy.env"

echo "==> Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

# ---- verify --------------------------------------------------------------
echo "==> Verifying"
for _ in $(seq 1 30); do
  if [[ "$(health_field sha)" == "$SHA" ]]; then
    echo "==> Live on ${SHA:0:8}"
    exit 0
  fi
  sleep 2
done

echo "!! Server did not come back healthy on $SHA" >&2
sudo systemctl status "$SERVICE" --no-pager --lines=40 >&2 || true
exit 1
