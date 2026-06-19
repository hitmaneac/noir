#!/usr/bin/env bash
# Deploy The Green Book (static site) to the droplet over SSH.
#   ./deploy.sh root@skalamax.si [remote_dir]
# Serves on 127.0.0.1:8096; the host's nginx must proxy skalamax.si/noir/ → it
# (see the location block in the README / deploy notes).
set -euo pipefail

REMOTE="${1:?usage: ./deploy.sh user@host [remote_dir]}"
REMOTE_DIR="${2:-/opt/skalamax-noir}"

echo "→ syncing to $REMOTE:$REMOTE_DIR"
ssh "$REMOTE" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete \
  --exclude .git --exclude references --exclude .history --exclude .claude \
  --exclude '*_tmp.png' --exclude '*_old*.png' --exclude node_modules \
  ./ "$REMOTE:$REMOTE_DIR/"

echo "→ building & starting"
ssh "$REMOTE" "cd '$REMOTE_DIR' && docker compose up -d --build"
echo "✓ deployed → 127.0.0.1:8096  (host nginx routes skalamax.si/noir)"
