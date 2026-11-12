# Blockchain: TRASH token and casino contracts

**NEAR Testnet only. TRASH has no real-world value.** It cannot be bought with real
money or cashed out for anything of value.

| Crate | What it is |
|---|---|
| [`trash-token`](trash-token/) | Trash Coin (`TRASH`): NEP-141 + NEP-145 from the official `near-contract-standards` reference implementation, plus a rate-limited **test faucet** |
| [`trash-casino`](trash-casino/) | The casino: house bankroll, player balances (deposit / withdraw), game escrow, settlement, refunds, paid deals, and contract-enforced NPC tip limits |
| [`integration-tests`](integration-tests/) | NEAR Sandbox tests that deploy both contracts and use real signed transactions |

## Economic model (decided 2026-11-11)

```text
                 ┌───────────────────────── trash-casino ─────────────────────────┐
deploy:          │ house bankroll = the whole initial supply (1,000,000,000 TRASH) │
                 └────────────────────────────────────────────────────────────────┘

player wallet ── token.faucet() ───────────────► +100 TRASH (newly minted, test only)
player wallet ── ft_transfer_call {"deposit"} ──► casino balance of the player
casino balance ─ join_game(game_id) ───────────► game escrow (buy-in)
game escrow ──── settle_game (settler) ────────► winners' casino balances; rest → house
casino balance ─ withdraw(amount) ─────────────► player wallet (ft_transfer)
house ────────── NPC seats, house stakes, NPC tips (agent_pay within limits)
```

- **The casino owns the supply.** At deployment the token mints the whole fixed
  initial supply to the team account, and the deploy script moves all of it into
  the casino's house bankroll with `ft_transfer_call` and `{"type":"fund_house"}`.
  Nobody else holds TRASH until players use the faucet or win.
- **NPCs belong to the casino.** Don and Foxy have no money of their own. Their
  buy-ins come from the house, their winnings and losses go back to the house, and
  their tips are paid from the house within contract-enforced limits.
- **Players hold TRASH in their own wallet** and deposit it into the casino to play.
  Inside the casino they have an internal balance. Buy-ins, payouts, refunds, tips,
  and deal payments are ledger entries, with no cross-contract calls. A player can
  withdraw the balance back to the wallet at any time.
- **The faucet replaces buying TRASH for now.** In a real product a player would buy
  TRASH from the casino. On testnet the token mints a small amount on request,
  without limit on the total, rate-limited per account. This is a real on-chain
  mint, not a simulation, and the UI labels it as free test TRASH.
- **No burning.** `ft_burn` and the "dumpster" mechanic were dropped.
- **Future work:** buying TRASH with test NEAR and redeeming it (the former
  `trash-treasury`), and paid Blackjack sessions using the casino's `house_stake`.

## Token: `trash-token`

- Name `Trash Coin`, symbol `TRASH`, **24 decimals**, the same as NEAR.
  The smallest unit is yoctoTRASH (10⁻²⁴ TRASH). The UI shows whole TRASH.
- Amounts are `u128` on-chain and decimal strings in JSON. No floating point.
- `new(owner_id, total_supply, faucet_amount, faucet_cooldown_seconds)` mints the
  initial supply to `owner_id` once.
- `faucet()` mints `faucet_amount` (default **100 TRASH**) to the caller, at most once
  per `faucet_cooldown_seconds` (default **60 s**) per account.
  - If the caller is not registered with the token yet, the call must attach the
    NEP-145 storage minimum (0.00125 NEAR). The faucet registers the account and
    refunds anything above the minimum. Registered callers get any deposit back.
  - It emits a standard `ft_mint` event.
- `set_faucet(amount, cooldown_seconds)` (owner, 1 yoctoNEAR) changes or disables
  (`amount = 0`) the faucet.
- `get_faucet(account_id)` returns the amount, cooldown, and the earliest time the
  account can claim again.

## Casino: `trash-casino`

### Roles

| Role | Key | Can call |
|---|---|---|
| **owner** (team) | full-access, every call needs 1 yoctoNEAR | `set_settler`, `register_agent`, `set_agent_limits`, `set_house_limits` |
| **settler** (backend via near-bridge) | function-call key | `create_game`, `settle_game`, `cancel_game` |
| **agent** (Don, Foxy via near-bridge) | function-call key | `agent_pay` |
| **player** (own wallet) | full-access for `withdraw`; any key for the rest | `withdraw`, `join_game`, `pay_offer`, `claim_refund` |

### Deposits and withdrawals

- `ft_transfer_call(casino, amount, msg)` on the token:
  - `{"type":"deposit"}` credits the sender's casino balance.
  - `{"type":"fund_house"}` adds to the house bankroll.
  - Any other message, a registered agent depositing, or another token is refused
    and the whole amount returns to the sender. Unknown JSON fields are rejected.
- `withdraw(amount)` needs exactly 1 yoctoNEAR, so it always opens the wallet for
  confirmation. It debits the balance first and sends `ft_transfer`. If the
  transfer fails, a callback restores the balance. The transaction's final return
  value is `true` or `false`.

### Games (escrow)

1. The settler calls `create_game(game_id, buy_in, players[1..4], house_stake, timeout_seconds)`.
   - Only the listed accounts take part. Game IDs are unique forever.
   - Registered agents in `players` are seated immediately, paid from the house.
   - `house_stake` (optional) is extra house money in the pot, used for games
     against the house such as future paid Blackjack.
   - A game with one player needs a `house_stake`. Agent buy-ins plus the house
     stake must fit the per-game and daily house limits, and the house balance.
2. Each human player calls `join_game(game_id)`. The buy-in moves from their
   casino balance into the escrow. No token transfer happens.
3. The settler calls `settle_game(game_id, payouts)`. The contract checks:
   - every seat has paid, and the deadline has not passed;
   - every recipient is a player in that game, at most once, with a positive amount;
   - the payouts add up to **no more** than the escrow.

   Payouts to humans go to their casino balance. Payouts to agents and any
   remainder go to the house. The state becomes `SETTLED`, so a second settlement fails.
4. `cancel_game` (settler or owner) refunds every deposit. After the deadline,
   any seated player can call `claim_refund`. That sets the game to `EXPIRED` and
   refunds everyone, so funds never stay stuck if the server disappears.

States: `OPEN → SETTLED | CANCELLED | EXPIRED`. All three end states are final.

### House limits

The settler key decides who sits in a game and who wins, so it can move house money
into a game. Two owner-set limits bound that exposure:

- `max_house_stake_per_game`: agent buy-ins + `house_stake` in one game
  (default **250 TRASH**).
- `daily_house_stake_limit`: the same, summed per UTC day
  (default **5,000 TRASH**).

### NPC tips: the AI security boundary

- The backend holds only a function-call key for each NPC account. That key can
  call only `agent_pay` on the casino, with a 0.25 NEAR gas allowance.
- `agent_pay(receiver_id, amount, memo)` checks:
  - the caller is a registered agent;
  - `amount ≤ per_transfer_limit`;
  - `tipped_today + amount ≤ daily_limit` (UTC day of the block time);
  - the house has the funds;
  - the receiver is not an agent, the casino, or the token.

  Then it credits the receiver's casino balance.
- Even with a leaked key or a fully "convinced" LLM, the most an NPC can give away
  is its daily limit. The restricted key cannot raise limits, attach deposits, call
  the token, or touch game escrow.

| Agent | Per tip | Per day |
|---|---|---|
| Don Raccoone | 5 TRASH | 20 TRASH |
| Foxy | 3 TRASH | 10 TRASH |

### Paid deals

`pay_offer(offer_id, agent_id, amount)` is called by the player. It moves `amount`
from the player's casino balance to the house and records it under `offer_id`.
Each `offer_id` can be paid only once. The contract does not know the agreed price;
the backend compares `get_offer_payment(offer_id)` with its own offer before it
delivers anything.

### Views

`get_config`, `get_balance(account_id)`, `get_house`, `get_totals`,
`get_game_status(game_id)`, `get_agent_limits(agent_id)`, and
`get_offer_payment(offer_id)`.

`get_totals` exposes the accounting invariant that the tests check:
`ft_balance_of(casino) = house + Σ player balances + Σ open escrow + pending withdrawals`.

Every state change emits a NEP-297 `EVENT_JSON` log with `"standard":"trash-casino"`.

### Default amounts

| What | Amount |
|---|---|
| Initial supply (house bankroll) | 1,000,000,000 TRASH |
| Faucet | 100 TRASH per claim, once per 60 s per account |
| Liar's Dice buy-in | 10 TRASH, the winner takes the pot |
| House per game / per day | 250 / 5,000 TRASH |
| Don tips | 5 per tip, 20 per day |
| Foxy tips | 3 per tip, 10 per day |

### Trust assumptions and known limits

- The server (settler) is **trusted to report match results honestly**. The contract
  limits how money can move, not who won. The server rolls dice with
  `SecureRandom`; there is no trustless or provably fair randomness.
- Payouts may be less than the escrow, with the rest going to the house. A dishonest
  settler could therefore also keep a pot for the house. It cannot pay anyone
  outside the game or pay more than the escrow.
- The casino pays storage for player balances, games, and offers. The token pays
  storage for faucet timestamps. That is acceptable on testnet.
- The faucet is unlimited in total. TRASH has no value and cannot be redeemed.

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

The sandbox tests start one local chain per test and take a few minutes. On WSL,
builds are faster with `export CARGO_TARGET_DIR=$HOME/.cache/trash-target`, because
that keeps build output off `/mnt/c`.

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
2. Deploys and initialises both contracts. The root account is the owner of both.
3. Registers the casino with the token and moves the whole supply into the
   house bankroll.
4. Registers both NPCs with their tip limits.
5. Adds the restricted keys: `agent_pay` for each NPC, and
   `create_game / settle_game / cancel_game` for the settler.
6. Writes the public account IDs to `deployments/testnet.json`. If that file
   belongs to another root account (the shared team deployment), it writes the
   ignored `deployments/testnet.<root>.json` instead.

Private keys stay in `~/.near-credentials`. Never commit them. To put the settler and
NPC function-call keys into `.env` for the bridge (see [near-bridge](../near-bridge/README.md)):

```bash
NEAR_ROOT_ACCOUNT=<name>.testnet ./scripts/env.sh ../.env
```

It sets the contract and account IDs, the three restricted keys, and a new
`BRIDGE_TOKEN`, and never prints a key. Full-access keys are not read.
Teammates deploy their own copy this way instead of sharing keys.

`NEAR_NETWORK=sandbox` runs the same script against a local node, for a rehearsal.
Any other network, including mainnet, is refused.
