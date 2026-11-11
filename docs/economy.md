# Economy milestone: TRASH, casino, bridge, paid Liar's Dice

Decided 2026-11-11, implemented and verified 2026-11-11. NEAR Testnet only; TRASH has
no real-world value. Design: [blockchain/README.md](../blockchain/README.md).
Flow: [architecture](architecture.md).

## What changed

- **trash-token:** the initial supply is minted once and moved into the casino house;
  `ft_burn` removed; new rate-limited test `faucet` (100 TRASH, 60 s per account,
  owner can change or disable it).
- **trash-casino:** rewritten around a house bankroll and internal player balances:
  `deposit` / `fund_house` via `ft_transfer_call`, `withdraw` with restore-on-failure,
  `join_game` from the casino balance, NPC seats and `house_stake` paid by the house
  within per-game and daily limits, `settle_game` (payouts ≤ escrow, remainder to the
  house), `cancel_game`, `claim_refund`, `pay_offer`, `agent_pay` (tips from the
  house within per-tip and daily limits), and `get_totals` for the accounting invariant.
- **deploy.sh:** moves the whole supply into the house, registers NPC tip limits, and
  gives NPC keys only `agent_pay`.
- **near-bridge:** new TypeScript service (near-api-js 7.5) with restricted keys,
  FINAL-outcome checks, NEP-413 verification, bearer-token HTTP API.
- **Java:** `GET /api/chain`, `POST /api/auth/nonce`, `POST /api/auth/verify`,
  `GET /api/wallet/balance`; paid Liar's Dice rooms with a `FUNDING` phase,
  on-chain funding poll, cancellation, and settlement.
- **Shared schema:** `sessionToken` and `paid` on room messages, `RoomSeat.accountId`,
  `RoomState.economy`, `FUNDING` phase, and REST types for chain and auth.
- **Web client:** near-connect wallet login, wallet panel (faucet, deposit,
  withdraw, balances), paid-room option, funding / settlement panel with
  transaction links.
- **scripts/paid-smoke.mjs:** headless player for the whole paid flow.

## Verification (2026-11-11)

| Check | Result |
|---|---|
| Contract unit tests (`cargo test -p trash-token -p trash-casino`) | 54 passed |
| NEAR Sandbox tests (`cargo test -p integration-tests`) | 7 passed: supply in house, faucet + cooldown, deposit/play vs NPC/settle/withdraw, cancel and deadline refunds, NPC tip limits through the restricted key, failed withdrawal restore, paid deal once + house limit, foreign token refused; each checks ledger = token balance |
| `deploy.sh` against a fresh local sandbox | passed: house = 1,000,000,000 TRASH, faucet configured, NPC limits, restricted keys |
| Bridge (`npm test -w near-bridge`, `npm run typecheck -w near-bridge`) | 8 passed, typecheck clean |
| Backend (`mvnw test`) | 50 passed, including 7 paid-room / NEP-413 nonce tests |
| Schema and web client (`npm test`, `npm run build`) | passed (8 schema, 17 client tests) |
| `paid-smoke.mjs` on local sandbox + bridge + Java | **passed twice**: faucet, deposit, NEP-413 login (forged and replayed nonce rejected), on-chain funding with Don seated by the house, `join_game`, real match, `CONFIRMED` settlement (once the player won, once Don won), chain matches the server, withdrawal |
| Browser render (Chromium, desktop + 390 px) | wallet panel and paid option render without page errors; paid room cannot be created without a wallet session |

## Not verified yet

- Nothing is deployed to testnet; there are no contract IDs.
- The browser wallet flow (near-connect connect, `signMessage`, signing
  transactions) has not been tried with a real testnet wallet. Which wallets support
  NEP-413 `signMessage` on testnet must be checked during that test.
- The on-chain cancel path is covered by contract sandbox tests and Java unit tests,
  but not by the end-to-end script.
- The Compose `bridge` service and its Dockerfile were written but not built.
- Paid Blackjack sessions, LLM chat, the paid information deal, and chat-driven tips
  are not built. The contract methods for them exist.

## Run the local sandbox rehearsal

Inside WSL2/Linux, start a sandbox node, then:

```bash
cd blockchain && ./scripts/build.sh
NEAR_NETWORK=sandbox NEAR_ROOT_ACCOUNT=test.near ./scripts/deploy.sh
```

Then run the bridge with `NEAR_NETWORK=sandbox`, `NEAR_RPC_URL=http://127.0.0.1:3030`,
the account IDs and restricted keys that `deploy.sh` prints, and Java with the same
`NEAR_NETWORK`, `BRIDGE_TOKEN`, `NEAR_BRIDGE_URL`, and contract IDs. Create a player
account, set `PLAYER_ACCOUNT_ID` / `PLAYER_PRIVATE_KEY`, and run
`node scripts/paid-smoke.mjs`.
