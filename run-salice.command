#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" && -x "/Users/facundomasague/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  NODE_BIN="/Users/facundomasague/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "No se encontró Node.js. Instalá Node 22 o abrí este proyecto desde Codex."
  read -k 1 "?Presioná una tecla para cerrar."
  exit 1
fi

if [[ ! -d node_modules || ! -d dist ]]; then
  echo "El prototipo todavía no está compilado. Ejecutá la instalación y el build desde Codex."
  read -k 1 "?Presioná una tecla para cerrar."
  exit 1
fi

echo "Iniciando Salice Inteligente v0.0.3…"
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--disable-warning=ExperimentalWarning" NODE_ENV=production "$NODE_BIN" node_modules/tsx/dist/cli.mjs server/index.ts &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM
sleep 1
open "http://127.0.0.1:8787"
echo "\nSalice está disponible en http://127.0.0.1:8787"
echo "Dejá esta ventana abierta. Para detenerlo, presioná Ctrl+C.\n"
wait $SERVER_PID
