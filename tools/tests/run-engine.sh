#!/bin/sh
# Compila e roda um teste de regras (sem navegador): sh tools/tests/run-engine.sh xrules
# Testes: xrules (heróis extras), btgrules (Beyond the Grave), rules (Core), vdoor (portas na Vingança),
#         xsim (partidas IA x IA: node ... N mix|core|extra; MAP=id, V=1 detalhes), reach2 (alcance dos mapas; ALL=1 todos)
cd "$(dirname "$0")" || exit 1
mkdir -p .out
MSYS_NO_PATHCONV=1 ../../node_modules/.bin/esbuild "engine/$1.ts" --bundle --platform=node --format=esm \
  --outfile=".out/$1.mjs" --log-level=warning --define:import.meta.env.BASE_URL='"/"' || exit 1
shift_name=$1; shift
node ".out/$shift_name.mjs" "$@"
