#!/usr/bin/env bash
# Deploys TRASH + trash-casino to NEAR Testnet (or a local sandbox for rehearsal).
# TRASH has no real-world value. This script refuses to touch mainnet.
#
# Prerequisites: near CLI (near-cli-rs), jq, curl, built Wasm (scripts/build.sh), and a
# root account whose full-access key is in the legacy keychain (~/.near-credentials).
# Create one with the faucet:
#   near account create-account sponsor-by-faucet-service <name>.testnet \
#     autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
#
# Usage:
#   NEAR_ROOT_ACCOUNT=<name>.testnet ./scripts/deploy.sh
#
# Re-running is safe: every step checks the chain first and skips finished work.
# Creates sub-accounts token., casino., settler., don., foxy. under the root account.
# The root account owns both contracts. The whole initial TRASH supply is moved
# into the casino's house bankroll; players get test TRASH from the token faucet.
set -euo pipefail
cd "$(dirname "$0")/.."

NETWORK="${NEAR_NETWORK:-testnet}"
ROOT="${NEAR_ROOT_ACCOUNT:?Set NEAR_ROOT_ACCOUNT, e.g. raccoon-royale.testnet}"
case "$NETWORK" in
  testnet) RPC="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}" ;;
  sandbox) RPC="${NEAR_RPC_URL:-http://127.0.0.1:3030}" ;;
  *) echo "Refusing network '$NETWORK': only testnet or sandbox are allowed." >&2; exit 1 ;;
esac
WASM_DIR="${WASM_DIR:-$PWD/res}"

TOKEN="token.$ROOT"
CASINO="casino.$ROOT"
SETTLER="settler.$ROOT"
AGENTS=("don.$ROOT" "foxy.$ROOT")

# Whole-TRASH amounts; converted to yoctoTRASH (24 decimals) with string padding,
# so no floating point is ever involved.
SUPPLY_TRASH="${SUPPLY_TRASH:-1000000000}"
FAUCET_TRASH="${FAUCET_TRASH:-100}"
FAUCET_COOLDOWN_SECONDS="${FAUCET_COOLDOWN_SECONDS:-60}"
HOUSE_PER_GAME_TRASH="${HOUSE_PER_GAME_TRASH:-250}"
HOUSE_PER_DAY_TRASH="${HOUSE_PER_DAY_TRASH:-5000}"
# agent tip limits: per transfer, per day
DON_LIMITS=(5 20)
FOXY_LIMITS=(3 10)

trash() { printf '%s000000000000000000000000' "$1"; }

for tool in near jq curl base64; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
for wasm in trash_token trash_casino; do
  [[ -f "$WASM_DIR/$wasm.wasm" ]] || { echo "Missing $WASM_DIR/$wasm.wasm; run scripts/build.sh" >&2; exit 1; }
done

log() { printf '\n== %s\n' "$*"; }

rpc() {
  curl -sS --fail "$RPC" -H 'Content-Type: application/json' -d "$1"
}

account_exists() {
  rpc "{\"jsonrpc\":\"2.0\",\"id\":\"rr\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | jq -e '.result.amount' >/dev/null
}

# view <contract> <method> <json-args>  -> prints the JSON result, or nothing on error
view() {
  local args
  args="$(printf '%s' "$3" | base64 | tr -d '\n')"
  rpc "{\"jsonrpc\":\"2.0\",\"id\":\"rr\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$args\"}}" \
    | jq -r 'if .result.result then (.result.result | implode) else empty end'
}

function_call_key_count() { # <account> <receiver>
  local count
  count="$(rpc "{\"jsonrpc\":\"2.0\",\"id\":\"rr\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | jq --arg r "$2" '[.result.keys[].access_key.permission
        | select(type == "object" and .FunctionCall.receiver_id == $r)] | length')"
  [[ "$count" =~ ^[0-9]+$ ]] || { echo "Could not read access keys of $1" >&2; exit 1; }
  echo "$count"
}

# call <signer> <contract> <method> <json-args> <deposit> [gas]
call() {
  near contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas "${6:-100.0 Tgas}" attached-deposit "$5" \
    sign-as "$1" network-config "$NETWORK" sign-with-legacy-keychain send
}

wait_for_account() {
  for _ in $(seq 1 20); do account_exists "$1" && return 0; sleep 1; done
  echo "Account $1 did not appear" >&2; return 1
}

create_sub() { # <account> <initial NEAR>
  if account_exists "$1"; then echo "exists: $1"; return; fi
  near account create-account fund-myself "$1" "$2" \
    autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "$ROOT" network-config "$NETWORK" sign-with-legacy-keychain send
  wait_for_account "$1"
}

account_exists "$ROOT" || { echo "Root account $ROOT not found on $NETWORK" >&2; exit 1; }

log "Accounts"
create_sub "$TOKEN" "${TOKEN_NEAR:-2.5 NEAR}"
create_sub "$CASINO" "${CASINO_NEAR:-3.5 NEAR}"
create_sub "$SETTLER" "${SETTLER_NEAR:-0.5 NEAR}"
for agent in "${AGENTS[@]}"; do create_sub "$agent" "${AGENT_NEAR:-0.3 NEAR}"; done

log "Deploy trash-token"
if [[ -n "$(view "$TOKEN" ft_metadata '{}')" ]]; then
  echo "already deployed"
else
  near contract deploy "$TOKEN" use-file "$WASM_DIR/trash_token.wasm" \
    with-init-call new json-args "{\"owner_id\":\"$ROOT\",\"total_supply\":\"$(trash "$SUPPLY_TRASH")\",\"faucet_amount\":\"$(trash "$FAUCET_TRASH")\",\"faucet_cooldown_seconds\":$FAUCET_COOLDOWN_SECONDS}" \
    prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
    network-config "$NETWORK" sign-with-legacy-keychain send
fi

log "Deploy trash-casino"
if [[ -n "$(view "$CASINO" get_config '{}')" ]]; then
  echo "already deployed"
else
  near contract deploy "$CASINO" use-file "$WASM_DIR/trash_casino.wasm" \
    with-init-call new json-args "{\"owner_id\":\"$ROOT\",\"token_id\":\"$TOKEN\",\"settler_id\":\"$SETTLER\",\"max_house_stake_per_game\":\"$(trash "$HOUSE_PER_GAME_TRASH")\",\"daily_house_stake_limit\":\"$(trash "$HOUSE_PER_DAY_TRASH")\"}" \
    prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
    network-config "$NETWORK" sign-with-legacy-keychain send
fi

log "Register the casino with the token (NEP-145 storage)"
if [[ "$(view "$TOKEN" storage_balance_of "{\"account_id\":\"$CASINO\"}")" == "null" ]]; then
  call "$ROOT" "$TOKEN" storage_deposit "{\"account_id\":\"$CASINO\"}" '0.00125 NEAR'
else
  echo "already registered"
fi

log "Move the whole supply into the casino house bankroll"
OWNER_TRASH="$(view "$TOKEN" ft_balance_of "{\"account_id\":\"$ROOT\"}" | jq -r '.')"
if [[ "$OWNER_TRASH" != "0" && -n "$OWNER_TRASH" ]]; then
  call "$ROOT" "$TOKEN" ft_transfer_call \
    "{\"receiver_id\":\"$CASINO\",\"amount\":\"$OWNER_TRASH\",\"msg\":\"{\\\"type\\\":\\\"fund_house\\\"}\"}" '1 yoctoNEAR'
else
  echo "already moved"
fi

register_agent() { # <agent> <per-transfer> <daily>
  local agent="$1"
  if [[ "$(view "$CASINO" get_agent_limits "{\"agent_id\":\"$agent\"}")" == "null" ]]; then
    call "$ROOT" "$CASINO" register_agent \
      "{\"agent_id\":\"$agent\",\"per_transfer_limit\":\"$(trash "$2")\",\"daily_limit\":\"$(trash "$3")\"}" \
      '1 yoctoNEAR'
  else
    echo "registered: $agent"
  fi
  # The backend's key for this agent: agent_pay on the casino only.
  if [[ "$(function_call_key_count "$agent" "$CASINO")" == "0" ]]; then
    near account add-key "$agent" grant-function-call-access \
      --allowance '0.25 NEAR' --contract-account-id "$CASINO" \
      --function-names 'agent_pay' \
      autogenerate-new-keypair save-to-legacy-keychain \
      network-config "$NETWORK" sign-with-legacy-keychain send
  else
    echo "agent key exists: $agent"
  fi
}

log "Agents (limits enforced by trash-casino)"
register_agent "${AGENTS[0]}" "${DON_LIMITS[@]}"
register_agent "${AGENTS[1]}" "${FOXY_LIMITS[@]}"

log "Settler key (create_game / settle_game / cancel_game only)"
if [[ "$(function_call_key_count "$SETTLER" "$CASINO")" == "0" ]]; then
  near account add-key "$SETTLER" grant-function-call-access \
    --allowance '0.25 NEAR' --contract-account-id "$CASINO" \
    --function-names 'create_game, settle_game, cancel_game' \
    autogenerate-new-keypair save-to-legacy-keychain \
    network-config "$NETWORK" sign-with-legacy-keychain send
else
  echo "settler key exists"
fi

mkdir -p deployments
OUT="deployments/$NETWORK.json"
jq -n --arg network "$NETWORK" --arg token "$TOKEN" --arg casino "$CASINO" \
  --arg owner "$ROOT" --arg settler "$SETTLER" --arg don "${AGENTS[0]}" --arg foxy "${AGENTS[1]}" \
  '{network: $network, token: $token, casino: $casino, owner: $owner, settler: $settler,
    agents: {don: $don, foxy: $foxy},
    note: "Public account IDs only. Keys stay in ~/.near-credentials. TRASH has no real-world value."}' > "$OUT"

log "Summary"
cat "$OUT"
echo
echo "TRASH supply:   $(view "$TOKEN" ft_total_supply '{}')"
echo "Casino config:  $(view "$CASINO" get_config '{}')"
echo "Casino house:   $(view "$CASINO" get_house '{}')"
echo "Faucet:         $(view "$TOKEN" get_faucet "{\"account_id\":\"$ROOT\"}")"
for agent in "${AGENTS[@]}"; do
  echo "Agent $agent: $(view "$CASINO" get_agent_limits "{\"agent_id\":\"$agent\"}")"
done
echo
echo "Restricted function-call keys for the backend (never commit these files):"
for account in "$SETTLER" "${AGENTS[@]}"; do
  rpc "{\"jsonrpc\":\"2.0\",\"id\":\"rr\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$account\"}}" \
    | jq -r '.result.keys[] | select((.access_key.permission | type) == "object") | .public_key' \
    | while read -r pk; do
        echo "  $account: ~/.near-credentials/$NETWORK/$account/${pk/:/_}.json"
      done
done
echo "Full-access keys (~/.near-credentials/$NETWORK/<account>.json) stay with the team, not the server."
