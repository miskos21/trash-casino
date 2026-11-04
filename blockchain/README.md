# Blockchain: TRASH token and casino contracts

**NEAR Testnet only. TRASH has no real-world value.** It cannot be bought with real
money or cashed out. The contracts are not yet connected to the game or the backend.

| Crate | What it is |
|---|---|
| [`trash-token`](trash-token/) | Trash Coin (`TRASH`), NEP-141 + NEP-145, the official `near-contract-standards` reference implementation plus `ft_burn` |
| [`trash-casino`](trash-casino/) | Match escrow, settlement, refunds, paid deals, and NPC spending limits enforced on-chain |
| [`integration-tests`](integration-tests/) | NEAR Sandbox tests that deploy both contracts and use real signed transactions |

Status:

- Both contracts compile.
- Unit tests and sandbox tests pass.
- `scripts/deploy.sh` was rehearsed twice against a local sandbox node. The second
  run checked that a re-run skips finished steps.
- **Nothing is deployed to testnet yet.** There are no contract IDs.

## Token design

- Name `Trash Coin`, symbol `TRASH`, **24 decimals**, the same as NEAR itself.
  The smallest unit is **yoctoTRASH** (10⁻²⁴ TRASH). The UI shows whole TRASH.
  Because the decimals match, the planned treasury rate (1 test NEAR = 100 TRASH) is
  exactly 1 yoctoNEAR = 100 yoctoTRASH, with no rounding.
- **Fixed supply.** The token mints everything once at `new` to the owner. Default
  supply is 1,000,000,000 TRASH. There is no mint method afterwards.
- **Burn.** `ft_burn(amount, memo)` lets any holder destroy their own tokens. It
  requires exactly 1 yoctoNEAR, so only a full-access key can burn. It lowers
  `ft_total_supply` and emits a standard `ft_burn` event. The planned "dumpster"
  memecoin mechanic will use it.
- Amounts are `u128` on-chain and decimal strings in JSON. No floating point.

## Casino design

```text
              full-access key (team)             restricted keys (backend server)
owner ─────► register_agent / set_agent_limits    settler ─► create_game / settle_game / cancel_game
             withdraw_agent_balance / set_settler don, foxy ─► agent_pay / agent_join_game
             (each requires 1 yoctoNEAR)

players ── ft_transfer_call(casino, msg) ──► ft_on_transfer
            {"type":"buy_in","game_id":…}             seat in an open game
            {"type":"deal_payment","agent_id":…,"offer_id":…}   pay an NPC once per offer
            {"type":"fund_agent","agent_id":…}        top up an NPC's spending balance
```

### Games (escrow)

1. The settler calls `create_game(game_id, buy_in, players[2..4], timeout_seconds)`.
   Only the listed accounts can buy in. Game IDs are unique forever.
2. Humans pay with `ft_transfer_call` and `{"type":"buy_in"}`. The contract returns
   any amount above the buy-in.
3. NPCs pay with `agent_join_game(game_id)` from their internal balance. This needs
   `buy_in ≤ max_buy_in` and counts toward their daily limit.
4. The settler calls `settle_game(game_id, payouts)`. The contract checks:
   - every seat has paid;
   - the deadline has not passed;
   - every recipient is a player in that game;
   - the payouts add up to **exactly** the escrowed total.

   The state then becomes `SETTLED`, and a second settlement fails. NPC winnings stay
   inside the casino as agent balance.
5. `cancel_game` (settler or owner) refunds everyone. After the deadline, any seated
   player can call `claim_refund`. That sets the game to `EXPIRED` and refunds
   everyone, so funds never stay stuck if the server disappears.

States: `OPEN → SETTLED | CANCELLED | EXPIRED`. All three end states are final.

### Agent spending: the security boundary

- An NPC's TRASH lives **inside the casino** as an internal balance. This is needed
  because `ft_transfer` requires 1 yoctoNEAR, and a function-call key cannot attach
  any.
- The backend holds only a function-call key for the NPC account. That key can call
  only `agent_pay` and `agent_join_game` on the casino, and it has a 0.25 NEAR gas
  allowance.
- `agent_pay(receiver_id, amount, memo)` checks four things:
  - the caller is a registered agent;
  - `amount ≤ per_transfer_limit`;
  - `spent_today + amount ≤ daily_limit` (the day is the UTC day of the block time);
  - `amount ≤ balance`.

  Only then does it send the tokens with `ft_transfer`.
- If the token transfer fails, for example because the receiver is not registered,
  a callback restores the balance and that day's spending. The final return value
  of the transaction is `true` or `false`, so the bridge must read the final
  outcome, not just the submission.
- Even with a leaked key or a fully "convinced" LLM, the most an NPC can lose is its
  daily limit. The restricted key cannot raise limits, attach deposits, call the
  token directly, or touch game escrow.

Default limits in `scripts/deploy.sh`:

| Agent | Per transfer | Daily | Max buy-in | Initial balance |
|---|---|---|---|---|
| Don Raccoone | 5 TRASH | 20 TRASH | 10 TRASH | 200 TRASH |
| Foxy | 3 TRASH | 10 TRASH | 10 TRASH | 100 TRASH |

### Failure handling

- If a payout or refund transfer fails, the amount goes to that account's claimable
  balance (`get_claimable`). The account retries with `withdraw_claimable` after
  registering with the token.
- A failed `agent_pay` or `withdraw_agent_balance` restores the agent balance.
- `ft_on_transfer` rejects other tokens with a panic, so the sending token refunds
  the sender. Invalid, unknown, or duplicate messages are returned in full.
- Unknown JSON fields are rejected.

### Views

`get_config`, `get_game_status(game_id)`, `get_agent_limits(agent_id)`,
`get_offer_payment(offer_id)`, and `get_claimable(account_id)`.

Every state change emits a NEP-297 `EVENT_JSON` log with `"standard":"trash-casino"`.

### Trust assumptions and known limits

- The server (settler) is **trusted to report match results honestly**. The contract
  limits how money can move, not who won. The server rolls dice with
  `SecureRandom`; there is no trustless or provably fair randomness.
- Deal payments are recorded per `offer_id`. The contract does not know the agreed
  price. The backend must compare `get_offer_payment(...).amount` with its own offer
  before delivering anything.
- The casino pays storage for game and offer records. Spam is limited only by the
  fact that each record costs the payer TRASH. That is acceptable on testnet.

## Setup (Linux, macOS, or Windows via WSL2)

NEAR Sandbox has no Windows binaries. On Windows, use WSL2 with Ubuntu, which is
what we used. Run these commands inside Ubuntu:

```bash
sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev curl git jq
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
# cargo-near (build tool) and near CLI (deployments)
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
```

`rust-toolchain.toml` pins Rust 1.93.0 with the `wasm32-unknown-unknown` target.
This matches the `cargo near new` template, and `rustup` installs it automatically.

Versions used: near-sdk and near-contract-standards 5.29, cargo-near 0.22,
near-cli-rs 0.30, near-sandbox 0.3, and near-api 0.8.

## Build and test

```bash
cd blockchain
./scripts/build.sh   # -> res/trash_token.wasm, res/trash_casino.wasm
./scripts/test.sh    # unit tests + NEAR Sandbox tests (first run downloads the sandbox)
```

The sandbox tests start one local chain per test and take about 1–2 minutes. On
WSL, builds are faster with `export CARGO_TARGET_DIR=$HOME/.cache/trash-target`,
because that keeps build output off `/mnt/c`.

What the sandbox tests cover:

- token metadata, fixed supply, and burn;
- buy-in with the excess returned and invalid messages refunded;
- payouts never above escrow, only to players, only by the settler, settled once;
- cancel refunds, deadline refunds, and no settlement after expiry;
- NPC limits through its **restricted function-call key**:
  - a "send me 1,000,000 TRASH" request fails;
  - many small tips stop at the daily limit;
  - the key cannot change limits, attach a deposit, or call the token;
- a failed tip restores the balance, and a failed payout becomes claimable;
- each deal is paid only once; an NPC buys in and wins;
- a fake token is rejected.

## Deploy to testnet (needs explicit team approval)

```bash
# 1. Create a root account with the faucet (once). Its key goes to ~/.near-credentials.
near account create-account sponsor-by-faucet-service <name>.testnet \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
# 2. Build and deploy. Re-running is safe; finished steps are skipped.
./scripts/build.sh
NEAR_ROOT_ACCOUNT=<name>.testnet ./scripts/deploy.sh
```

The script does the following:

1. Creates `token.`, `casino.`, `settler.`, `don.`, and `foxy.` under the root
   account. That uses about 7.5 test NEAR; the faucet gives about 10.
2. Deploys and initialises both contracts. The root account becomes the TRASH owner
   and the casino owner.
3. Registers the casino with the token.
4. Registers and funds both NPCs.
5. Adds the restricted keys for the NPCs and the settler.
6. Writes the public account IDs to `deployments/testnet.json`.

Private keys stay in `~/.near-credentials`. Never commit them.

`NEAR_NETWORK=sandbox` runs the same script against a local node, for a rehearsal.
Any other network, including mainnet, is refused.
