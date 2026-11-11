//! trash-casino: house bankroll, player balances, game escrow, settlement,
//! refunds, paid deals, and contract-enforced NPC tip limits for Trashnino on NEAR
//! Testnet. TRASH has no real-world value.
//!
//! Money model:
//! - The casino owns the house bankroll (the whole initial supply at deployment).
//! - Players deposit TRASH with `ft_transfer_call` and get an internal balance.
//!   Buy-ins, payouts, refunds, tips, and deal payments are ledger entries.
//!   `withdraw` sends the balance back to the player's wallet.
//! - NPC agents belong to the casino: their stakes and tips come from the house.
//!
//! Roles:
//! - `owner_id`   (full-access key) configures the settler, agents, and house limits.
//!   Every owner method requires exactly 1 yoctoNEAR, so a function-call key can
//!   never call it.
//! - `settler_id` (backend) creates, settles, and cancels games.
//! - agents (NPC accounts) can only call `agent_pay`, within per-transfer and
//!   daily limits.
//!
//! The game server is trusted to report results honestly (see the README). This
//! contract guarantees the money rules: only the configured token is accepted, a
//! game never pays out more than it holds and only to its players, a game settles
//! at most once, funds can always be recovered after the deadline, house money in
//! games is bounded per game and per day, and an agent never tips above its limits.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    assert_one_yocto, env, ext_contract, is_promise_success, log, near, require,
};

pub const DAY_NS: u64 = 86_400 * 1_000_000_000;
pub const MAX_PLAYERS: usize = 4;
pub const MAX_TIMEOUT_SECONDS: u64 = 7 * 24 * 3600;
const MAX_ID_LEN: usize = 64;
const MAX_MEMO_LEN: usize = 128;
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(10);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleTokenCore {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Games,
    Agents,
    Offers,
    Balances,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GameState {
    /// Waiting for buy-ins; can be settled once every seat has paid.
    Open,
    /// Paid out. Final.
    Settled,
    /// Cancelled by the settler or owner; every deposit was refunded. Final.
    Cancelled,
    /// Deadline passed without settlement; every deposit was refunded. Final.
    Expired,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Seat {
    pub account_id: AccountId,
    /// Agents are seated with house money when the game is created.
    pub is_agent: bool,
    pub deposited: bool,
    pub refunded: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Payout {
    pub account_id: AccountId,
    pub amount: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Game {
    pub game_id: String,
    pub buy_in: U128,
    /// Extra house money in the pot (games against the house).
    pub house_stake: U128,
    pub seats: Vec<Seat>,
    pub state: GameState,
    pub created_at_ns: U64,
    pub deadline_ns: U64,
    pub total_deposited: U128,
    pub payouts: Vec<Payout>,
    /// What went back to the house at settlement (agent payouts + remainder).
    pub house_payout: U128,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Agent {
    pub per_transfer_limit: u128,
    pub daily_limit: u128,
    /// UTC day index (`block_timestamp / DAY_NS`) that `tipped_today` refers to.
    pub day: u64,
    pub tipped_today: u128,
}

impl Agent {
    fn tipped_on(&self, today: u64) -> u128 {
        if self.day == today { self.tipped_today } else { 0 }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentView {
    pub agent_id: AccountId,
    pub per_transfer_limit: U128,
    pub daily_limit: U128,
    pub tipped_today: U128,
    pub remaining_today: U128,
    pub day: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct OfferPayment {
    pub offer_id: String,
    pub payer_id: AccountId,
    pub agent_id: AccountId,
    pub amount: U128,
    pub paid_at_ns: U64,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner_id: AccountId,
    pub token_id: AccountId,
    pub settler_id: AccountId,
    pub max_house_stake_per_game: U128,
    pub daily_house_stake_limit: U128,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
pub struct HouseView {
    pub balance: U128,
    pub staked_today: U128,
    pub remaining_today: U128,
    pub max_per_game: U128,
    pub daily_limit: U128,
    pub day: U64,
}

/// Accounting identity: `total` must equal the casino's TRASH balance on the token
/// (plus any TRASH sent with a plain `ft_transfer`, which nobody can claim).
#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
pub struct TotalsView {
    pub house: U128,
    pub player_balances: U128,
    pub escrow: U128,
    pub pending_withdrawals: U128,
    pub total: U128,
}

/// The `msg` of an `ft_transfer_call` to this contract. Anything else is refunded.
#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum TransferMsg {
    /// Credit the sender's casino balance.
    Deposit {},
    /// Add to the house bankroll.
    FundHouse {},
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    token_id: AccountId,
    settler_id: AccountId,
    house: u128,
    max_house_stake_per_game: u128,
    daily_house_stake_limit: u128,
    house_day: u64,
    house_staked_today: u128,
    balances: LookupMap<AccountId, u128>,
    total_balances: u128,
    total_escrow: u128,
    pending_withdrawals: u128,
    games: LookupMap<String, Game>,
    agents: LookupMap<AccountId, Agent>,
    offers: LookupMap<String, OfferPayment>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(
        owner_id: AccountId,
        token_id: AccountId,
        settler_id: AccountId,
        max_house_stake_per_game: U128,
        daily_house_stake_limit: U128,
    ) -> Self {
        Self {
            owner_id,
            token_id,
            settler_id,
            house: 0,
            max_house_stake_per_game: max_house_stake_per_game.0,
            daily_house_stake_limit: daily_house_stake_limit.0,
            house_day: today(),
            house_staked_today: 0,
            balances: LookupMap::new(StorageKey::Balances),
            total_balances: 0,
            total_escrow: 0,
            pending_withdrawals: 0,
            games: LookupMap::new(StorageKey::Games),
            agents: LookupMap::new(StorageKey::Agents),
            offers: LookupMap::new(StorageKey::Offers),
        }
    }

    // ------------------------------------------------------------------ owner

    #[payable]
    pub fn set_settler(&mut self, settler_id: AccountId) {
        self.assert_owner();
        self.settler_id = settler_id;
    }

    #[payable]
    pub fn set_house_limits(&mut self, max_house_stake_per_game: U128, daily_house_stake_limit: U128) {
        self.assert_owner();
        self.max_house_stake_per_game = max_house_stake_per_game.0;
        self.daily_house_stake_limit = daily_house_stake_limit.0;
        emit(
            "house_limits_changed",
            json!({ "max_house_stake_per_game": max_house_stake_per_game,
                    "daily_house_stake_limit": daily_house_stake_limit }),
        );
    }

    #[payable]
    pub fn register_agent(&mut self, agent_id: AccountId, per_transfer_limit: U128, daily_limit: U128) {
        self.assert_owner();
        require!(!self.agents.contains_key(&agent_id), "Agent is already registered");
        require!(
            agent_id != self.owner_id
                && agent_id != self.settler_id
                && agent_id != self.token_id
                && agent_id != env::current_account_id(),
            "Agent must be a separate account"
        );
        require!(
            !self.balances.contains_key(&agent_id),
            "Agent account already has a player balance"
        );
        validate_limits(per_transfer_limit.0, daily_limit.0);
        self.agents.insert(
            agent_id.clone(),
            Agent {
                per_transfer_limit: per_transfer_limit.0,
                daily_limit: daily_limit.0,
                day: today(),
                tipped_today: 0,
            },
        );
        emit(
            "agent_registered",
            json!({ "agent_id": agent_id, "per_transfer_limit": per_transfer_limit,
                    "daily_limit": daily_limit }),
        );
    }

    #[payable]
    pub fn set_agent_limits(&mut self, agent_id: AccountId, per_transfer_limit: U128, daily_limit: U128) {
        self.assert_owner();
        validate_limits(per_transfer_limit.0, daily_limit.0);
        let agent = self.agent_mut(&agent_id);
        agent.per_transfer_limit = per_transfer_limit.0;
        agent.daily_limit = daily_limit.0;
        emit(
            "agent_limits_changed",
            json!({ "agent_id": agent_id, "per_transfer_limit": per_transfer_limit,
                    "daily_limit": daily_limit }),
        );
    }

    // ---------------------------------------------------------------- settler

    /// Opens a fully funded game for exactly the listed players. Each human's buy-in
    /// is taken from their casino balance right away (players sign only deposits and
    /// withdrawals); the whole call fails if anyone lacks the balance. Registered
    /// agents are seated with house money. `house_stake` adds house money to the pot
    /// for games against the house.
    pub fn create_game(
        &mut self,
        game_id: String,
        buy_in: U128,
        players: Vec<AccountId>,
        house_stake: Option<U128>,
        timeout_seconds: u64,
    ) {
        self.assert_settler();
        validate_id(&game_id, "game_id");
        require!(!self.games.contains_key(&game_id), "Game id already used");
        require!(buy_in.0 > 0, "Buy-in must be positive");
        let house_stake = house_stake.map(|s| s.0).unwrap_or(0);
        require!(
            !players.is_empty() && players.len() <= MAX_PLAYERS,
            "A game needs 1-4 players"
        );
        require!(
            players.len() >= 2 || house_stake > 0,
            "A game needs two players or a house stake"
        );
        require!(
            timeout_seconds > 0 && timeout_seconds <= MAX_TIMEOUT_SECONDS,
            "Timeout must be between 1 second and 7 days"
        );
        let mut seats = Vec::with_capacity(players.len());
        for (i, player) in players.iter().enumerate() {
            require!(!players[..i].contains(player), "Duplicate player");
            require!(
                *player != env::current_account_id()
                    && *player != self.token_id
                    && *player != self.settler_id,
                "Invalid player account"
            );
            let is_agent = self.agents.contains_key(player);
            seats.push(Seat {
                account_id: player.clone(),
                is_agent,
                deposited: true,
                refunded: false,
            });
        }
        let agent_count = seats.iter().filter(|s| s.is_agent).count() as u128;
        let from_house = buy_in
            .0
            .checked_mul(agent_count)
            .and_then(|v| v.checked_add(house_stake))
            .unwrap_or_else(|| env::panic_str("Amount overflow"));
        let total = buy_in
            .0
            .checked_mul(players.len() as u128)
            .and_then(|v| v.checked_add(house_stake))
            .unwrap_or_else(|| env::panic_str("Amount overflow"));
        for seat in seats.iter().filter(|s| !s.is_agent) {
            let error = format!("{} has insufficient casino balance", seat.account_id);
            self.debit(&seat.account_id, buy_in.0, &error);
        }
        if from_house > 0 {
            self.take_house_stake(from_house);
        }
        self.total_escrow += total;

        let now = env::block_timestamp();
        let game = Game {
            game_id: game_id.clone(),
            buy_in,
            house_stake: U128(house_stake),
            seats,
            state: GameState::Open,
            created_at_ns: U64(now),
            deadline_ns: U64(now + timeout_seconds * 1_000_000_000),
            total_deposited: U128(total),
            payouts: vec![],
            house_payout: U128(0),
        };
        emit(
            "game_created",
            json!({ "game_id": game_id, "buy_in": buy_in, "house_stake": U128(house_stake),
                    "players": game.seats.iter().map(|s| &s.account_id).collect::<Vec<_>>(),
                    "from_house": U128(from_house), "deadline_ns": game.deadline_ns }),
        );
        self.games.insert(game_id, game);
    }

    /// Pays out a fully funded game. Payouts go to seated players, at most once
    /// each, and sum to no more than the escrow. Human payouts go to casino
    /// balances; agent payouts and the remainder go to the house.
    pub fn settle_game(&mut self, game_id: String, payouts: Vec<Payout>) {
        self.assert_settler();
        let game = self
            .games
            .get(&game_id)
            .unwrap_or_else(|| env::panic_str("Unknown game"))
            .clone();
        require!(game.state == GameState::Open, "Game is not open");
        require!(
            game.seats.iter().all(|s| s.deposited),
            "Not every player has paid the buy-in"
        );
        require!(
            env::block_timestamp() <= game.deadline_ns.0,
            "Deadline passed; the game can only be refunded"
        );
        let mut total: u128 = 0;
        let mut to_house: u128 = 0;
        for (i, payout) in payouts.iter().enumerate() {
            require!(payout.amount.0 > 0, "Payout amounts must be positive");
            let seat = game
                .seats
                .iter()
                .find(|s| s.account_id == payout.account_id)
                .unwrap_or_else(|| env::panic_str("Payout recipient is not a player in this game"));
            require!(
                !payouts[..i].iter().any(|p| p.account_id == payout.account_id),
                "Duplicate payout recipient"
            );
            total = total
                .checked_add(payout.amount.0)
                .unwrap_or_else(|| env::panic_str("Payout overflow"));
            if seat.is_agent {
                to_house += payout.amount.0;
            }
        }
        require!(
            total <= game.total_deposited.0,
            "Payouts exceed the escrowed total"
        );
        to_house += game.total_deposited.0 - total;

        for payout in &payouts {
            if !self.agents.contains_key(&payout.account_id) {
                self.credit(&payout.account_id, payout.amount.0);
            }
        }
        self.house += to_house;
        self.total_escrow -= game.total_deposited.0;

        let stored = self.game_mut(&game_id);
        stored.state = GameState::Settled;
        stored.payouts = payouts.clone();
        stored.house_payout = U128(to_house);
        emit(
            "game_settled",
            json!({ "game_id": game_id, "payouts": payouts, "house_payout": U128(to_house) }),
        );
    }

    /// Cancels an open game and refunds every deposit. Settler or owner only.
    pub fn cancel_game(&mut self, game_id: String) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.settler_id || caller == self.owner_id,
            "Only the settler or owner can cancel"
        );
        let game = self.game_mut(&game_id);
        require!(game.state == GameState::Open, "Game is not open");
        game.state = GameState::Cancelled;
        self.refund_all(&game_id);
        emit("game_cancelled", json!({ "game_id": game_id }));
    }

    // ---------------------------------------------------------------- players

    /// After the deadline, any seated player can expire an unsettled game; every
    /// deposit is then refunded. This guarantees funds never stay stuck.
    pub fn claim_refund(&mut self, game_id: String) {
        let caller = env::predecessor_account_id();
        let game = self.game_mut(&game_id);
        require!(
            game.seats.iter().any(|s| s.account_id == caller),
            "Caller is not a player in this game"
        );
        require!(game.state == GameState::Open, "Game is already closed");
        require!(
            env::block_timestamp() > game.deadline_ns.0,
            "Refunds open after the deadline"
        );
        game.state = GameState::Expired;
        self.refund_all(&game_id);
        emit("game_expired", json!({ "game_id": game_id, "by": caller }));
    }

    /// Pays an NPC deal from the caller's casino balance to the house. Each
    /// `offer_id` can be paid once. The backend checks the amount against its offer.
    pub fn pay_offer(&mut self, offer_id: String, agent_id: AccountId, amount: U128) {
        let payer = env::predecessor_account_id();
        validate_id(&offer_id, "offer_id");
        require!(amount.0 > 0, "Amount must be positive");
        require!(!self.offers.contains_key(&offer_id), "Offer already paid");
        require!(self.agents.contains_key(&agent_id), "Unknown agent");
        self.debit(&payer, amount.0, "Insufficient casino balance");
        self.house += amount.0;
        self.offers.insert(
            offer_id.clone(),
            OfferPayment {
                offer_id: offer_id.clone(),
                payer_id: payer.clone(),
                agent_id: agent_id.clone(),
                amount,
                paid_at_ns: U64(env::block_timestamp()),
            },
        );
        emit(
            "deal_paid",
            json!({ "offer_id": offer_id, "payer_id": payer, "agent_id": agent_id, "amount": amount }),
        );
    }

    /// Sends part of the caller's casino balance back to their wallet. Requires
    /// exactly 1 yoctoNEAR (a full-access key). Returns whether the transfer
    /// succeeded; on failure the balance is restored.
    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        require!(amount.0 > 0, "Amount must be positive");
        self.debit(&account_id, amount.0, "Insufficient casino balance");
        self.pending_withdrawals += amount.0;
        emit("withdraw", json!({ "account_id": account_id, "amount": amount }));
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(account_id.clone(), amount, Some("Trashnino withdrawal".to_string()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .on_withdraw_complete(account_id, amount),
            )
    }

    // ----------------------------------------------------------------- agents

    /// Tips `receiver_id` from the house. Designed for a function-call key
    /// restricted to this method. Enforces the per-transfer and daily limits.
    pub fn agent_pay(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        let agent_id = env::predecessor_account_id();
        require!(amount.0 > 0, "Amount must be positive");
        require!(
            receiver_id != agent_id
                && receiver_id != env::current_account_id()
                && receiver_id != self.token_id
                && !self.agents.contains_key(&receiver_id),
            "Invalid receiver"
        );
        if let Some(memo) = &memo {
            require!(memo.len() <= MAX_MEMO_LEN, "Memo is too long");
        }
        let day = today();
        let house = self.house;
        let agent = self
            .agents
            .get_mut(&agent_id)
            .unwrap_or_else(|| env::panic_str("Caller is not a registered agent"));
        require!(
            amount.0 <= agent.per_transfer_limit,
            "Amount exceeds the agent per-transfer limit"
        );
        if agent.day != day {
            agent.day = day;
            agent.tipped_today = 0;
        }
        let tipped = agent
            .tipped_today
            .checked_add(amount.0)
            .unwrap_or_else(|| env::panic_str("Amount overflow"));
        require!(tipped <= agent.daily_limit, "Amount exceeds the agent daily limit");
        require!(house >= amount.0, "The house cannot cover this payment");
        agent.tipped_today = tipped;
        self.house -= amount.0;
        self.credit(&receiver_id, amount.0);
        emit(
            "agent_pay",
            json!({ "agent_id": agent_id, "receiver_id": receiver_id, "amount": amount,
                    "memo": memo, "tipped_today": U128(tipped) }),
        );
    }

    // -------------------------------------------------------------- callbacks

    /// Resolves a withdrawal. On failure, restores the player's casino balance.
    #[private]
    pub fn on_withdraw_complete(&mut self, account_id: AccountId, amount: U128) -> bool {
        self.pending_withdrawals -= amount.0;
        if is_promise_success() {
            return true;
        }
        self.credit(&account_id, amount.0);
        emit(
            "withdraw_failed",
            json!({ "account_id": account_id, "amount": amount, "restored": true }),
        );
        false
    }

    // ------------------------------------------------------------------ views

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner_id: self.owner_id.clone(),
            token_id: self.token_id.clone(),
            settler_id: self.settler_id.clone(),
            max_house_stake_per_game: U128(self.max_house_stake_per_game),
            daily_house_stake_limit: U128(self.daily_house_stake_limit),
        }
    }

    pub fn get_balance(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_house(&self) -> HouseView {
        let day = today();
        let staked = if self.house_day == day { self.house_staked_today } else { 0 };
        HouseView {
            balance: U128(self.house),
            staked_today: U128(staked),
            remaining_today: U128(self.daily_house_stake_limit.saturating_sub(staked)),
            max_per_game: U128(self.max_house_stake_per_game),
            daily_limit: U128(self.daily_house_stake_limit),
            day: U64(day),
        }
    }

    pub fn get_totals(&self) -> TotalsView {
        TotalsView {
            house: U128(self.house),
            player_balances: U128(self.total_balances),
            escrow: U128(self.total_escrow),
            pending_withdrawals: U128(self.pending_withdrawals),
            total: U128(
                self.house + self.total_balances + self.total_escrow + self.pending_withdrawals,
            ),
        }
    }

    pub fn get_game_status(&self, game_id: String) -> Option<Game> {
        self.games.get(&game_id).cloned()
    }

    pub fn get_agent_limits(&self, agent_id: AccountId) -> Option<AgentView> {
        let day = today();
        self.agents.get(&agent_id).map(|agent| {
            let tipped = agent.tipped_on(day);
            AgentView {
                agent_id: agent_id.clone(),
                per_transfer_limit: U128(agent.per_transfer_limit),
                daily_limit: U128(agent.daily_limit),
                tipped_today: U128(tipped),
                remaining_today: U128(agent.daily_limit.saturating_sub(tipped)),
                day: U64(day),
            }
        })
    }

    pub fn get_offer_payment(&self, offer_id: String) -> Option<OfferPayment> {
        self.offers.get(&offer_id).cloned()
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Accepts TRASH only. Returns the whole amount for an invalid message.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.token_id,
            "Only the configured TRASH token is accepted"
        );
        let unused = match self.handle_transfer(&sender_id, amount.0, &msg) {
            Ok(()) => 0,
            Err(reason) => {
                log!("Refunding {} to {}: {}", amount.0, sender_id, reason);
                amount.0
            }
        };
        PromiseOrValue::Value(U128(unused))
    }
}

impl Contract {
    fn handle_transfer(&mut self, sender_id: &AccountId, amount: u128, msg: &str) -> Result<(), String> {
        let parsed: TransferMsg =
            serde_json::from_str(msg).map_err(|e| format!("Invalid msg: {e}"))?;
        match parsed {
            TransferMsg::Deposit {} => {
                if self.agents.contains_key(sender_id) {
                    return Err("Agents cannot hold a player balance".into());
                }
                self.credit(sender_id, amount);
                emit("deposit", json!({ "account_id": sender_id, "amount": U128(amount) }));
            }
            TransferMsg::FundHouse {} => {
                self.house += amount;
                emit("house_funded", json!({ "from": sender_id, "amount": U128(amount) }));
            }
        }
        Ok(())
    }

    /// Takes house money for a game, within the per-game and daily limits.
    fn take_house_stake(&mut self, amount: u128) {
        let day = today();
        if self.house_day != day {
            self.house_day = day;
            self.house_staked_today = 0;
        }
        require!(
            amount <= self.max_house_stake_per_game,
            "House stake exceeds the per-game limit"
        );
        let staked = self
            .house_staked_today
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("Amount overflow"));
        require!(
            staked <= self.daily_house_stake_limit,
            "House stake exceeds the daily limit"
        );
        require!(self.house >= amount, "The house cannot cover this game");
        self.house -= amount;
        self.house_staked_today = staked;
    }

    /// Refunds every unrefunded deposit of a game: humans to their casino
    /// balance, agent seats and the house stake to the house.
    fn refund_all(&mut self, game_id: &String) {
        let game = self.game_mut(game_id);
        let buy_in = game.buy_in.0;
        let house_stake = game.house_stake.0;
        let total = game.total_deposited.0;
        let mut humans = vec![];
        let mut to_house = house_stake;
        for seat in game.seats.iter_mut().filter(|s| s.deposited && !s.refunded) {
            seat.refunded = true;
            if seat.is_agent {
                to_house += buy_in;
            } else {
                humans.push(seat.account_id.clone());
            }
        }
        for account_id in humans {
            self.credit(&account_id, buy_in);
        }
        self.house += to_house;
        self.total_escrow -= total;
    }

    fn credit(&mut self, account_id: &AccountId, amount: u128) {
        let current = self.balances.get(account_id).copied().unwrap_or(0);
        let updated = current
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("Balance overflow"));
        self.balances.insert(account_id.clone(), updated);
        self.total_balances += amount;
    }

    fn debit(&mut self, account_id: &AccountId, amount: u128, error: &str) {
        let current = self.balances.get(account_id).copied().unwrap_or(0);
        require!(current >= amount, error);
        if current == amount {
            self.balances.remove(account_id);
        } else {
            self.balances.insert(account_id.clone(), current - amount);
        }
        self.total_balances -= amount;
    }

    fn assert_owner(&self) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can call this method"
        );
    }

    fn assert_settler(&self) {
        require!(
            env::predecessor_account_id() == self.settler_id,
            "Only the settler can call this method"
        );
    }

    fn game_mut(&mut self, game_id: &String) -> &mut Game {
        self.games
            .get_mut(game_id)
            .unwrap_or_else(|| env::panic_str("Unknown game"))
    }

    fn agent_mut(&mut self, agent_id: &AccountId) -> &mut Agent {
        self.agents
            .get_mut(agent_id)
            .unwrap_or_else(|| env::panic_str("Unknown agent"))
    }
}

fn today() -> u64 {
    env::block_timestamp() / DAY_NS
}

fn validate_limits(per_transfer_limit: u128, daily_limit: u128) {
    require!(per_transfer_limit > 0, "Per-transfer limit must be positive");
    require!(
        per_transfer_limit <= daily_limit,
        "Per-transfer limit cannot exceed the daily limit"
    );
}

fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
}

fn validate_id(id: &str, field: &str) {
    if !is_valid_id(id) {
        env::panic_str(&format!("Invalid {field}: use 1-64 chars of [A-Za-z0-9-_.:]"));
    }
}

/// NEP-297 event log.
fn emit(event: &str, data: serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        json!({ "standard": "trash-casino", "version": "2.0.0", "event": event, "data": [data] })
    );
}

#[cfg(test)]
mod tests;
