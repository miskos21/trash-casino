#!/usr/bin/env bash
# Writes the NEAR settings of a deployment made with scripts/deploy.sh into .env.
# TRASH has no real-world value. Testnet or sandbox only.
#
# Usage (from blockchain/):
#   cp ../.env.example ../.env                                 # once, if missing
#   NEAR_ROOT_ACCOUNT=<name>.testnet ./scripts/env.sh ../.env
#
# Existing KEY= lines in the file are replaced, missing ones are appended.
# It reads only the restricted function-call keys (create_game / settle_game /
# cancel_game for the settler, agent_pay for the NPCs) from the legacy keychain
# (~/.near-credentials). Full-access keys are never read. The values include private
# keys, so they go only into the gitignored .env and are never printed.
set -euo pipefail

NETWORK="${NEAR_NETWORK:-testnet}"
ENV_FILE="${1:?Usage: NEAR_ROOT_ACCOUNT=<name>.testnet ./scripts/env.sh ../.env}"
[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE not found; copy .env.example first" >&2; exit 1; }
ROOT="${NEAR_ROOT_ACCOUNT:?Set NEAR_ROOT_ACCOUNT, e.g. trashnino-yourname.testnet}"
case "$NETWORK" in
  testnet) RPC="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}" ;;
  sandbox) RPC="${NEAR_RPC_URL:-http://127.0.0.1:3030}" ;;
  *) echo "Refusing network '$NETWORK': only testnet or sandbox are allowed." >&2; exit 1 ;;
esac
KEYCHAIN="${NEAR_CREDENTIALS_DIR:-$HOME/.near-credentials}/$NETWORK"

for tool in jq curl; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done

TOKEN="token.$ROOT"
CASINO="casino.$ROOT"

# restricted_key <account> -> private key of a local function-call key on the casino
restricted_key() {
  local pk file
  for pk in $(curl -sS --fail "$RPC" -H 'Content-Type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"id\":\"rr\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
      | jq -r --arg r "$CASINO" '.result.keys[]
          | select((.access_key.permission | type) == "object"
                   and .access_key.permission.FunctionCall.receiver_id == $r)
          | .public_key'); do
    file="$KEYCHAIN/$1/${pk/:/_}.json"
    if [[ -f "$file" ]]; then
      jq -r '.private_key' "$file"
      return 0
    fi
  done
  echo "No local restricted key for $1 in $KEYCHAIN/$1/. Run scripts/deploy.sh as $ROOT first." >&2
  return 1
}

SETTLER_KEY="$(restricted_key "settler.$ROOT")"
DON_KEY="$(restricted_key "don.$ROOT")"
FOXY_KEY="$(restricted_key "foxy.$ROOT")"
# Shared secret between Java and the local bridge; generated fresh, never shared.
BRIDGE_TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

# COMPOSE_PROFILES=chain makes a plain `docker compose up` start near-bridge too.
VALUES="COMPOSE_PROFILES=chain
NEAR_NETWORK=$NETWORK
TRASH_TOKEN_CONTRACT_ID=$TOKEN
TRASH_CASINO_CONTRACT_ID=$CASINO
BRIDGE_TOKEN=$BRIDGE_TOKEN
NEAR_SETTLEMENT_ACCOUNT_ID=settler.$ROOT
NEAR_SETTLEMENT_PRIVATE_KEY=$SETTLER_KEY
NEAR_AGENT_DON_ACCOUNT_ID=don.$ROOT
NEAR_AGENT_DON_PRIVATE_KEY=$DON_KEY
NEAR_AGENT_FOXY_ACCOUNT_ID=foxy.$ROOT
NEAR_AGENT_FOXY_PRIVATE_KEY=$FOXY_KEY"

# Replace KEY= lines in place, append the keys the file does not have yet.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
printf '%s\n' "$VALUES" | awk -F= '
  NR == FNR { key = $1; sub(/^[^=]*=/, ""); value[key] = $0; order[++n] = key; next }
  { k = $0; sub(/=.*/, "", k) }
  (k in value) && !(k in done) { print k "=" value[k]; done[k] = 1; next }
  (k in value) { next }
  { print }
  END { for (i = 1; i <= n; i++) if (!(order[i] in done)) print order[i] "=" value[order[i]] }
' - "$ENV_FILE" > "$TMP"
cat "$TMP" > "$ENV_FILE"

echo "Wrote the NEAR settings for $ROOT to $ENV_FILE (contract IDs, settler, Don, Foxy, new BRIDGE_TOKEN)."
echo "Private keys were written to the file only. Never commit it."
