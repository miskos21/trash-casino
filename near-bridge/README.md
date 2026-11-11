# near-bridge

Internal TypeScript service between the Java backend and NEAR. **NEAR Testnet only**
(or a local sandbox rehearsal); mainnet configuration is refused. TRASH has no
real-world value.

- Holds only **restricted function-call keys**: the settler key
  (`create_game`, `settle_game`, `cancel_game`) and one key per NPC (`agent_pay`).
  No full-access key, no owner key, and nothing an LLM can reach.
- Reports a transaction as successful only from its **final execution outcome**
  (`waitUntil: "FINAL"`, every receipt checked). Submission alone never counts.
- Verifies NEP-413 login signatures with `near-api-js` `verifyMessage`, which also
  checks that the key is a FullAccess key of the claimed account.
- Every request needs `Authorization: Bearer $BRIDGE_TOKEN`. It binds to
  `127.0.0.1` by default. Browsers never talk to it.
- Logs one JSON line per transaction (operation, IDs, amounts, tx hash, result).
  Never keys, tokens, or signatures.

Built with `near-api-js` 7.5 on Node.js 22.12+ (TypeScript via `--experimental-strip-types`).

## API

| Method | Path | Does |
|---|---|---|
| GET | `/health` | Network, contract IDs, settler, agents |
| POST | `/games` | `create_game` `{gameId, buyIn, players, houseStake?, timeoutSeconds}` |
| GET | `/games/{id}` | `get_game_status` |
| POST | `/games/{id}/settle` | `settle_game` `{payouts: [{accountId, amount}]}` |
| POST | `/games/{id}/cancel` | `cancel_game` |
| POST | `/agents/{don\|foxy}/pay` | `agent_pay` `{receiverId, amount, memo?}` |
| GET | `/accounts/{id}/balances` | wallet TRASH + casino balance |
| POST | `/auth/verify` | NEP-413 check `{accountId, publicKey, signature, message, recipient, nonce}` |

Amounts are yoctoTRASH decimal strings. Unknown fields are rejected. A failed
transaction returns HTTP 422 with `{ok: false, txHash, error}`.

## Run

```bash
# Values from blockchain/deployments/testnet.json and the restricted key files
# that scripts/deploy.sh prints. Never commit them.
export BRIDGE_TOKEN=$(openssl rand -base64 32)
export TRASH_TOKEN_CONTRACT_ID=token.<root>.testnet TRASH_CASINO_CONTRACT_ID=casino.<root>.testnet
export NEAR_SETTLEMENT_ACCOUNT_ID=settler.<root>.testnet NEAR_SETTLEMENT_PRIVATE_KEY=ed25519:...
export NEAR_AGENT_DON_ACCOUNT_ID=don.<root>.testnet NEAR_AGENT_DON_PRIVATE_KEY=ed25519:...
npm start -w near-bridge          # listens on 127.0.0.1:8090
npm test -w near-bridge           # unit tests (HTTP layer with a test double, outcome parsing, config guards)
npm run typecheck -w near-bridge
```

The Java backend uses the same `BRIDGE_TOKEN` and `NEAR_BRIDGE_URL=http://127.0.0.1:8090`.
