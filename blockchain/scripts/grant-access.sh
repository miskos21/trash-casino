#!/usr/bin/env bash
# Gives a teammate full access to a deployment by adding THEIR public key to every
# account of it (root, token., casino., settler., don., foxy.). No private key is
# ever sent: the teammate generates the key pair and shares only the public key.
# TRASH has no real-world value. Testnet or sandbox only.
#
# Usage (from blockchain/, by someone who already has full access):
#   NEAR_ROOT_ACCOUNT=trashnino-demo.testnet ./scripts/grant-access.sh ed25519:<public key>
#   NEAR_ROOT_ACCOUNT=trashnino-demo.testnet ./scripts/grant-access.sh --revoke ed25519:<public key>
#
# A full-access key can deploy code, move NEAR, and add or delete keys, so grant it
# only to people you trust with the whole deployment. Revoking removes it everywhere.
set -euo pipefail

NETWORK="${NEAR_NETWORK:-testnet}"
ROOT="${NEAR_ROOT_ACCOUNT:?Set NEAR_ROOT_ACCOUNT, e.g. trashnino-demo.testnet}"
case "$NETWORK" in
  testnet) RPC="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}" ;;
  sandbox) RPC="${NEAR_RPC_URL:-http://127.0.0.1:3030}" ;;
  *) echo "Refusing network '$NETWORK': only testnet or sandbox are allowed." >&2; exit 1 ;;
esac
KEYCHAIN="${NEAR_CREDENTIALS_DIR:-$HOME/.near-credentials}/$NETWORK"

REVOKE=false
if [[ "${1:-}" == "--revoke" ]]; then REVOKE=true; shift; fi
KEY="${1:?Usage: ./scripts/grant-access.sh [--revoke] ed25519:<public key>}"
[[ "$KEY" =~ ^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$ ]] || { echo "Not an ed25519 public key: $KEY" >&2; exit 1; }

for tool in near jq curl; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done

ACCOUNTS=("$ROOT" "token.$ROOT" "casino.$ROOT" "settler.$ROOT" "don.$ROOT" "foxy.$ROOT")

# Prints FullAccess, FunctionCall, or nothing when the key is not on the account.
permission() {
  curl -sS --fail "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"rr\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"final\",\"account_id\":\"$1\",\"public_key\":\"$2\"}}" \
    | jq -r 'if .result.permission == "FullAccess" then "FullAccess" elif .result.permission then "FunctionCall" else empty end'
}

for account in "${ACCOUNTS[@]}"; do
  current="$(permission "$account" "$KEY")"
  if $REVOKE; then
    signer="$(jq -r '.public_key // empty' "$KEYCHAIN/$account.json" 2>/dev/null || true)"
    [[ "$signer" != "$KEY" ]] || { echo "Refusing to revoke the key this machine signs $account with." >&2; exit 1; }
    if [[ -z "$current" ]]; then echo "not present: $account"; continue; fi
    near account delete-keys "$account" public-keys "$KEY" \
      network-config "$NETWORK" sign-with-legacy-keychain send
  else
    if [[ "$current" == "FullAccess" ]]; then echo "already granted: $account"; continue; fi
    [[ -z "$current" ]] || { echo "$KEY is a function-call key on $account; use a new key pair." >&2; exit 1; }
    near account add-key "$account" grant-full-access use-manually-provided-public-key "$KEY" \
      network-config "$NETWORK" sign-with-legacy-keychain send
  fi
done

# Confirm on chain instead of trusting the CLI output.
sleep 2
for account in "${ACCOUNTS[@]}"; do
  current="$(permission "$account" "$KEY")"
  if $REVOKE; then
    [[ -z "$current" ]] || { echo "Still present on $account" >&2; exit 1; }
  else
    [[ "$current" == "FullAccess" ]] || { echo "Not confirmed on $account (got: ${current:-none})" >&2; exit 1; }
  fi
  echo "confirmed: $account"
done
