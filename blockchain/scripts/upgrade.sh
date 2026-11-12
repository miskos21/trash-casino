#!/usr/bin/env bash
# Replaces the code of an already deployed token and/or casino with the current build,
# keeping their state (no init call). TRASH has no real-world value. Testnet or sandbox only.
#
# Usage (from blockchain/, after scripts/build.sh):
#   NEAR_ROOT_ACCOUNT=<name>.testnet ./scripts/upgrade.sh
#
# Only contracts whose on-chain code differs from res/*.wasm are redeployed. Needs the
# full-access keys of token.<root> and casino.<root> in the legacy keychain. A new build
# must keep the stored state layout readable; change a stored struct only with a migration.
set -euo pipefail
cd "$(dirname "$0")/.."

NETWORK="${NEAR_NETWORK:-testnet}"
ROOT="${NEAR_ROOT_ACCOUNT:?Set NEAR_ROOT_ACCOUNT, e.g. trashnino-demo.testnet}"
case "$NETWORK" in
  testnet) RPC="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}" ;;
  sandbox) RPC="${NEAR_RPC_URL:-http://127.0.0.1:3030}" ;;
  *) echo "Refusing network '$NETWORK': only testnet or sandbox are allowed." >&2; exit 1 ;;
esac
WASM_DIR="${WASM_DIR:-$PWD/res}"

for tool in near jq curl python3; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done

# NEAR code hash: base58 of the sha256 of the Wasm.
code_hash_of_file() {
  python3 - "$1" <<'EOF'
import hashlib, sys
digest = hashlib.sha256(open(sys.argv[1], "rb").read()).digest()
alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
n, out = int.from_bytes(digest, "big"), ""
while n:
    n, r = divmod(n, 58)
    out = alphabet[r] + out
print(out)
EOF
}

code_hash_on_chain() {
  curl -sS --fail "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"rr\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | jq -r '.result.code_hash // empty'
}

upgrade() { # <account> <wasm name>
  local account="$1" wasm="$WASM_DIR/$2.wasm" local_hash chain_hash
  [[ -f "$wasm" ]] || { echo "Missing $wasm; run scripts/build.sh" >&2; exit 1; }
  local_hash="$(code_hash_of_file "$wasm")"
  chain_hash="$(code_hash_on_chain "$account")"
  [[ -n "$chain_hash" && "$chain_hash" != "11111111111111111111111111111111" ]] \
    || { echo "$account has no contract; use scripts/deploy.sh" >&2; exit 1; }
  if [[ "$chain_hash" == "$local_hash" ]]; then
    echo "up to date: $account ($chain_hash)"
    return
  fi
  echo "upgrading: $account $chain_hash -> $local_hash"
  near contract deploy "$account" use-file "$wasm" without-init-call \
    network-config "$NETWORK" sign-with-legacy-keychain send
  for _ in $(seq 1 20); do
    [[ "$(code_hash_on_chain "$account")" == "$local_hash" ]] && { echo "upgraded: $account"; return; }
    sleep 1
  done
  echo "$account does not show the new code hash yet; check it before using it." >&2
  exit 1
}

upgrade "token.$ROOT" trash_token
upgrade "casino.$ROOT" trash_casino
