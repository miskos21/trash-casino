#!/usr/bin/env bash
# Builds trash-token and trash-casino to Wasm (Linux, macOS, or WSL2).
# Output: blockchain/res/trash_token.wasm and blockchain/res/trash_casino.wasm
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="${OUT_DIR:-$PWD/res}"
mkdir -p "$OUT_DIR"
for contract in trash-token trash-casino; do
  cargo near build non-reproducible-wasm --manifest-path "$contract/Cargo.toml" --out-dir "$OUT_DIR"
done
ls -l "$OUT_DIR"/*.wasm
