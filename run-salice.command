#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 22 or newer, then try again."
  read -k 1 "?Press any key to close."
  exit 1
fi

if [[ ! -d node_modules || ! -d dist ]]; then
  echo "SMART Salice is not built yet. Run: pnpm install && pnpm run prepare:demo && pnpm run build"
  read -k 1 "?Press any key to close."
  exit 1
fi

echo "Checking and backing up local operational data…"
node_modules/.bin/tsx scripts/backup-operations.ts

echo "Starting SMART Salice v1.0.0…"
NODE_ENV=production node_modules/.bin/tsx server/index.ts &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM
sleep 1
open "http://127.0.0.1:8787"
echo "SMART Salice is available at http://127.0.0.1:8787"
echo "Keep this window open. Press Ctrl+C to stop."
wait $SERVER_PID
