//! trash-casino: escrow, settlement, refunds, and contract-enforced NPC spending
//! limits for Raccoon Royale on NEAR Testnet. TRASH has no real-world value.
//!
//! Roles:
//! - `owner_id`   (full-access key) registers agents, sets limits, changes the settler.
//!   Every owner method requires exactly 1 yoctoNEAR, so a function-call key can
//!   never call it.
//! - `settler_id` (backend) creates, settles, and cancels games.
//! - agents (NPC accounts) spend only through `agent_pay` / `agent_join_game`, from
//!   a balance held inside this contract, within per-transfer and daily limits.
//!
//! The game server is trusted to report results honestly (see the README). This
//! contract guarantees the money rules: only the configured token is accepted, a
//! game never pays out more than it received, a game settles at most once, funds
//! can always be recovered after the deadline, and an agent can never spend more
//! than its limits.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    assert_one_yocto, env, ext_contract, is_promise_success, log, near, require,
};

pub const DAY_NS: u64 = 86_400 * 1_000_000_000;
pub const MIN_PLAYERS: usize = 2;
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
    Claimable,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GameState {
    /// Accepting buy-ins; can be settled once every seat has paid.
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
    pub seats: Vec<Seat>,
    pub state: GameState,
    pub created_at_ns: U64,
    pub deadline_ns: U64,
    pub total_deposited: U128,
    pub payouts: Vec<Payout>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Agent {
    pub per_transfer_limit: u128,
    pub daily_limit: u128,
    pub max_buy_in: u128,
    pub balance: u128,
    /// UTC day index (`block_timestamp / DAY_NS`) that `spent_today` refers to.
    pub day: u64,
    pub spent_today: u128,
}

impl Agent {
    /// Starts a new spending window when the UTC day changes.
    fn roll_day(&mut self, today: u64) {
        if self.day != today {
            self.day = today;
            self.spent_today = 0;
        }
    }

    fn spent_on(&self, today: u64) -> u128 {
        if self.day == today { self.spent_today } else { 0 }
    }

    /// Checks the daily limit and balance, then debits. Panics on any violation.
    fn debit(&mut self, amount: u128, today: u64) {
        self.roll_day(today);
        let spent = self
            .spent_today
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("Amount overflow"));
        require!(spent <= self.daily_limit, "Amount exceeds the agent daily limit");
        require!(self.balance >= amount, "Insufficient agent balance");
        self.balance -= amount;
        self.spent_today = spent;
    }

    fn credit(&mut self, amount: u128) {
        self.balance = self
            .balance
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("Balance overflow"));
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentView {
    pub agent_id: AccountId,
    pub per_transfer_limit: U128,
    pub daily_limit: U128,
    pub max_buy_in: U128,
    pub balance: U128,
    pub spent_today: U128,
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
}

/// The `msg` of an `ft_transfer_call` to this contract. Anything else is refunded.
#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum TransferMsg {
    /// Pay the buy-in for a seat in `game_id`. Any amount above the buy-in is returned.
    BuyIn { game_id: String },
    /// Pay an agent for an off-chain deal. Each `offer_id` can be paid once.
    DealPayment {
        agent_id: AccountId,
        offer_id: String,
    },
    /// Top up an agent's spending balance.
    FundAgent { agent_id: AccountId },
}

/// What to restore if an outgoing `ft_transfer` fails.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransferKind {
    /// Settlement payout or refund: credit the receiver's claimable balance.
    Payout,
    /// Retry of a claimable balance: restore it.
    Claimable,
    /// `agent_pay`: restore the agent balance and that day's spending.
    AgentPay { agent_id: AccountId, day: U64 },
    /// Owner withdrawal of agent funds: restore the agent balance.
    AgentWithdraw { agent_id: AccountId },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    token_id: AccountId,
    settler_id: AccountId,
    games: LookupMap<String, Game>,
    agents: LookupMap<AccountId, Agent>,
    offers: LookupMap<String, OfferPayment>,
    claimable: LookupMap<AccountId, u128>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, token_id: AccountId, settler_id: AccountId) -> Self {
        Self {
            owner_id,
            token_id,
            settler_id,
            games: LookupMap::new(StorageKey::Games),
            agents: LookupMap::new(StorageKey::Agents),
            offers: LookupMap::new(StorageKey::Offers),
            claimable: LookupMap::new(StorageKey::Claimable),
        }
    }

    // ------------------------------------------------------------------ owner

    #[payable]
    pub fn set_settler(&mut self, settler_id: AccountId) {
        self.assert_owner();
        self.settler_id = settler_id;
    }

    #[payable]
    pub fn register_agent(
        &mut self,
        agent_id: AccountId,
        per_transfer_limit: U128,
        daily_limit: U128,
        max_buy_in: U128,
    ) {
        self.assert_owner();
        require!(!self.agents.contains_key(&agent_id), "Agent is already registered");
        require!(
            agent_id != self.owner_id
                && agent_id != self.settler_id
                && agent_id != self.token_id
                && agent_id != env::current_account_id(),
            "Agent must be a separate account"
        );
        validate_limits(per_transfer_limit.0, daily_limit.0);
        self.agents.insert(
            agent_id.clone(),
            Agent {
                per_transfer_limit: per_transfer_limit.0,
                daily_limit: daily_limit.0,
                max_buy_in: max_buy_in.0,
                balance: 0,
                day: today(),
                spent_today: 0,
            },
        );
        emit(
            "agent_registered",
            json!({ "agent_id": agent_id, "per_transfer_limit": per_transfer_limit,
                    "daily_limit": daily_limit, "max_buy_in": max_buy_in }),
        );
    }

    #[payable]
    pub fn set_agent_limits(
        &mut self,
        agent_id: AccountId,
        per_transfer_limit: U128,
        daily_limit: U128,
        max_buy_in: U128,
    ) {
        self.assert_owner();
        validate_limits(per_transfer_limit.0, daily_limit.0);
        let agent = self.agent_mut(&agent_id);
        agent.per_transfer_limit = per_transfer_limit.0;
        agent.daily_limit = daily_limit.0;
        agent.max_buy_in = max_buy_in.0;
        emit(
            "agent_limits_changed",
            json!({ "agent_id": agent_id, "per_transfer_limit": per_transfer_limit,
                    "daily_limit": daily_limit, "max_buy_in": max_buy_in }),
        );
    }

    /// Moves agent funds back to the owner. Not subject to agent limits.
    #[payable]
    pub fn withdraw_agent_balance(&mut self, agent_id: AccountId, amount: U128) -> Promise {
        self.assert_owner();
        require!(amount.0 > 0, "Amount must be positive");
        let agent = self.agent_mut(&agent_id);
        require!(agent.balance >= amount.0, "Insufficient agent balance");
        agent.balance -= amount.0;
        let owner_id = self.owner_id.clone();
        self.ft_transfer_with_resolve(
            owner_id,
            amount.0,
            "agent balance withdrawal",
            TransferKind::AgentWithdraw { agent_id },
        )
    }

    // ---------------------------------------------------------------- settler

    /// Opens a game for exactly the listed players. Only listed accounts can buy in.
    pub fn create_game(
        &mut self,
        game_id: String,
        buy_in: U128,
        players: Vec<AccountId>,
        timeout_seconds: u64,
    ) {
        self.assert_settler();
        validate_id(&game_id, "game_id");
        require!(!self.games.contains_key(&game_id), "Game id already used");
        require!(buy_in.0 > 0, "Buy-in must be positive");
        require!(
            (MIN_PLAYERS..=MAX_PLAYERS).contains(&players.len()),
            "A game needs 2-4 players"
        );
        require!(
            timeout_seconds > 0 && timeout_seconds <= MAX_TIMEOUT_SECONDS,
            "Timeout must be between 1 second and 7 days"
        );
        for (i, player) in players.iter().enumerate() {
            require!(!players[..i].contains(player), "Duplicate player");
            require!(
                *player != env::current_account_id() && *player != self.token_id,
                "Invalid player account"
            );
        }
        buy_in
            .0
            .checked_mul(players.len() as u128)
            .unwrap_or_else(|| env::panic_str("Buy-in too large"));

        let now = env::block_timestamp();
        let game = Game {
            game_id: game_id.clone(),
            buy_in,
            seats: players
                .into_iter()
                .map(|account_id| Seat {
                    account_id,
                    deposited: false,
                    refunded: false,
                })
                .collect(),
            state: GameState::Open,
            created_at_ns: U64(now),
            deadline_ns: U64(now + timeout_seconds * 1_000_000_000),
            total_deposited: U128(0),
            payouts: vec![],
        };
        emit(
            "game_created",
            json!({ "game_id": game_id, "buy_in": buy_in,
                    "players": game.seats.iter().map(|s| &s.account_id).collect::<Vec<_>>(),
                    "deadline_ns": game.deadline_ns }),
        );
        self.games.insert(game_id, game);
    }

    /// Pays out a fully funded game. Payouts must go to seated players and must sum
    /// to exactly the escrowed total. Agent winnings are credited internally.
    pub fn settle_game(&mut self, game_id: String, payouts: Vec<Payout>) {
        self.assert_settler();
        let game = self.game_mut(&game_id);
        require!(game.state == GameState::Open, "Game is not open");
        require!(
            game.seats.iter().all(|s| s.deposited),
            "Not every player has paid the buy-in"
        );
        require!(
            env::block_timestamp() <= game.deadline_ns.0,
            "Deadline passed; the game can only be refunded"
        );
        require!(!payouts.is_empty(), "No payouts");
        let mut total: u128 = 0;
        for (i, payout) in payouts.iter().enumerate() {
            require!(payout.amount.0 > 0, "Payout amounts must be positive");
            require!(
                game.seats.iter().any(|s| s.account_id == payout.account_id),
                "Payout recipient is not a player in this game"
            );
            require!(
                !payouts[..i].iter().any(|p| p.account_id == payout.account_id),
                "Duplicate payout recipient"
            );
            total = total
                .checked_add(payout.amount.0)
                .unwrap_or_else(|| env::panic_str("Payout overflow"));
        }
        require!(
            total == game.total_deposited.0,
            "Payouts must equal the escrowed total exactly"
        );
        game.state = GameState::Settled;
        game.payouts = payouts.clone();

        for payout in &payouts {
            self.pay_out(&payout.account_id, payout.amount.0, "Raccoon Royale payout");
        }
        emit(
            "game_settled",
            json!({ "game_id": game_id, "payouts": payouts }),
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

    /// Retries payouts or refunds whose token transfer failed earlier (for example
    /// because the receiver was not registered with the token yet).
    pub fn withdraw_claimable(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        let amount = self
            .claimable
            .remove(&account_id)
            .unwrap_or_else(|| env::panic_str("Nothing to withdraw"));
        self.ft_transfer_with_resolve(account_id, amount, "claimable withdrawal", TransferKind::Claimable)
    }

    // ----------------------------------------------------------------- agents

    /// Spends from the calling agent's balance. Designed for a function-call key
    /// restricted to this method. Enforces the per-transfer and daily limits.
    pub fn agent_pay(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) -> Promise {
        let agent_id = env::predecessor_account_id();
        require!(amount.0 > 0, "Amount must be positive");
        require!(
            receiver_id != agent_id
                && receiver_id != env::current_account_id()
                && receiver_id != self.token_id,
            "Invalid receiver"
        );
        if let Some(memo) = &memo {
            require!(memo.len() <= MAX_MEMO_LEN, "Memo is too long");
        }
        let day = today();
        let agent = self
            .agents
            .get_mut(&agent_id)
            .unwrap_or_else(|| env::panic_str("Caller is not a registered agent"));
        require!(
            amount.0 <= agent.per_transfer_limit,
            "Amount exceeds the agent per-transfer limit"
        );
        agent.debit(amount.0, day);
        emit(
            "agent_pay",
            json!({ "agent_id": agent_id, "receiver_id": receiver_id, "amount": amount,
                    "memo": memo, "spent_today": U128(agent.spent_today) }),
        );
        self.ft_transfer_with_resolve(
            receiver_id,
            amount.0,
            memo.as_deref().unwrap_or("agent payment"),
            TransferKind::AgentPay {
                agent_id,
                day: U64(day),
            },
        )
    }

    /// Pays the calling agent's buy-in from its balance. Counts toward the daily limit.
    pub fn agent_join_game(&mut self, game_id: String) {
        let agent_id = env::predecessor_account_id();
        let day = today();
        let now = env::block_timestamp();
        let agent = self
            .agents
            .get_mut(&agent_id)
            .unwrap_or_else(|| env::panic_str("Caller is not a registered agent"));
        let game = self
            .games
            .get_mut(&game_id)
            .unwrap_or_else(|| env::panic_str("Unknown game"));
        require!(game.state == GameState::Open, "Game is not open");
        require!(now <= game.deadline_ns.0, "Buy-in deadline has passed");
        let buy_in = game.buy_in.0;
        require!(buy_in <= agent.max_buy_in, "Buy-in exceeds the agent max buy-in");
        let seat = game
            .seats
            .iter_mut()
            .find(|s| s.account_id == agent_id)
            .unwrap_or_else(|| env::panic_str("Agent has no seat in this game"));
        require!(!seat.deposited, "Buy-in already paid");
        agent.debit(buy_in, day);
        seat.deposited = true;
        game.total_deposited = U128(game.total_deposited.0 + buy_in);
        emit(
            "buy_in",
            json!({ "game_id": game_id, "account_id": agent_id, "amount": U128(buy_in) }),
        );
    }

    // -------------------------------------------------------------- callbacks

    /// Resolves an outgoing `ft_transfer`. On failure, restores the state that the
    /// transfer had debited. Returns whether the transfer succeeded.
    #[private]
    pub fn on_transfer_complete(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        kind: TransferKind,
    ) -> bool {
        if is_promise_success() {
            return true;
        }
        match &kind {
            TransferKind::Payout | TransferKind::Claimable => {
                let current = self.claimable.get(&receiver_id).copied().unwrap_or(0);
                self.claimable.insert(receiver_id.clone(), current + amount.0);
            }
            TransferKind::AgentPay { agent_id, day } => {
                let agent = self.agent_mut(agent_id);
                agent.credit(amount.0);
                if agent.day == day.0 {
                    agent.spent_today = agent.spent_today.saturating_sub(amount.0);
                }
            }
            TransferKind::AgentWithdraw { agent_id } => {
                self.agent_mut(agent_id).credit(amount.0);
            }
        }
        emit(
            "transfer_failed",
            json!({ "receiver_id": receiver_id, "amount": amount, "restored": kind }),
        );
        false
    }

    // ------------------------------------------------------------------ views

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner_id: self.owner_id.clone(),
            token_id: self.token_id.clone(),
            settler_id: self.settler_id.clone(),
        }
    }

    pub fn get_game_status(&self, game_id: String) -> Option<Game> {
        self.games.get(&game_id).cloned()
    }

    pub fn get_agent_limits(&self, agent_id: AccountId) -> Option<AgentView> {
        let day = today();
        self.agents.get(&agent_id).map(|agent| {
            let spent = agent.spent_on(day);
            AgentView {
                agent_id: agent_id.clone(),
                per_transfer_limit: U128(agent.per_transfer_limit),
                daily_limit: U128(agent.daily_limit),
                max_buy_in: U128(agent.max_buy_in),
                balance: U128(agent.balance),
                spent_today: U128(spent),
                remaining_today: U128(agent.daily_limit.saturating_sub(spent)),
                day: U64(day),
            }
        })
    }

    pub fn get_offer_payment(&self, offer_id: String) -> Option<OfferPayment> {
        self.offers.get(&offer_id).cloned()
    }

    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        U128(self.claimable.get(&account_id).copied().unwrap_or(0))
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Accepts TRASH only. Returns the unused amount: the whole amount for an invalid
    /// message, or the excess above a buy-in.
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
            Ok(unused) => unused,
            Err(reason) => {
                log!("Refunding {} to {}: {}", amount.0, sender_id, reason);
                amount.0
            }
        };
        PromiseOrValue::Value(U128(unused))
    }
}

impl Contract {
    fn handle_transfer(&mut self, sender_id: &AccountId, amount: u128, msg: &str) -> Result<u128, String> {
        let parsed: TransferMsg =
            serde_json::from_str(msg).map_err(|e| format!("Invalid msg: {e}"))?;
        match parsed {
            TransferMsg::BuyIn { game_id } => {
                let now = env::block_timestamp();
                let game = self.games.get_mut(&game_id).ok_or("Unknown game")?;
                if game.state != GameState::Open {
                    return Err("Game is not open".into());
                }
                if now > game.deadline_ns.0 {
                    return Err("Buy-in deadline has passed".into());
                }
                let buy_in = game.buy_in.0;
                let seat = game
                    .seats
                    .iter_mut()
                    .find(|s| s.account_id == *sender_id)
                    .ok_or("Sender has no seat in this game")?;
                if seat.deposited {
                    return Err("Buy-in already paid".into());
                }
                if amount < buy_in {
                    return Err("Amount is below the buy-in".into());
                }
                seat.deposited = true;
                game.total_deposited = U128(game.total_deposited.0 + buy_in);
                emit(
                    "buy_in",
                    json!({ "game_id": game_id, "account_id": sender_id, "amount": U128(buy_in) }),
                );
                Ok(amount - buy_in)
            }
            TransferMsg::DealPayment { agent_id, offer_id } => {
                if !is_valid_id(&offer_id) {
                    return Err("Invalid offer_id".into());
                }
                if self.offers.contains_key(&offer_id) {
                    return Err("Offer already paid".into());
                }
                let agent = self.agents.get_mut(&agent_id).ok_or("Unknown agent")?;
                agent.credit(amount);
                self.offers.insert(
                    offer_id.clone(),
                    OfferPayment {
                        offer_id: offer_id.clone(),
                        payer_id: sender_id.clone(),
                        agent_id: agent_id.clone(),
                        amount: U128(amount),
                        paid_at_ns: U64(env::block_timestamp()),
                    },
                );
                emit(
                    "deal_paid",
                    json!({ "offer_id": offer_id, "payer_id": sender_id,
                            "agent_id": agent_id, "amount": U128(amount) }),
                );
                Ok(0)
            }
            TransferMsg::FundAgent { agent_id } => {
                let agent = self.agents.get_mut(&agent_id).ok_or("Unknown agent")?;
                agent.credit(amount);
                emit(
                    "agent_funded",
                    json!({ "agent_id": agent_id, "from": sender_id, "amount": U128(amount) }),
                );
                Ok(0)
            }
        }
    }

    /// Refunds every unrefunded deposit of a game. Agents are credited internally.
    fn refund_all(&mut self, game_id: &String) {
        let game = self.game_mut(game_id);
        let buy_in = game.buy_in.0;
        let mut recipients = vec![];
        for seat in game.seats.iter_mut().filter(|s| s.deposited && !s.refunded) {
            seat.refunded = true;
            recipients.push(seat.account_id.clone());
        }
        for account_id in recipients {
            self.pay_out(&account_id, buy_in, "Raccoon Royale refund");
        }
    }

    /// Agents receive funds as internal balance; everyone else gets an ft_transfer.
    fn pay_out(&mut self, account_id: &AccountId, amount: u128, memo: &str) {
        if let Some(agent) = self.agents.get_mut(account_id) {
            agent.credit(amount);
        } else {
            self.ft_transfer_with_resolve(account_id.clone(), amount, memo, TransferKind::Payout)
                .detach();
        }
    }

    fn ft_transfer_with_resolve(
        &self,
        receiver_id: AccountId,
        amount: u128,
        memo: &str,
        kind: TransferKind,
    ) -> Promise {
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(receiver_id.clone(), U128(amount), Some(memo.to_string()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .on_transfer_complete(receiver_id, U128(amount), kind),
            )
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
        json!({ "standard": "trash-casino", "version": "1.0.0", "event": event, "data": [data] })
    );
}

#[cfg(test)]
mod tests;
