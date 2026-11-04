use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{PromiseResult, RuntimeFeesConfig, testing_env, test_vm_config};

const TRASH: u128 = 1_000_000_000_000_000_000_000_000;
const T0: u64 = 1_800_000_000 * 1_000_000_000; // some time in 2027, ns

fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}
fn owner() -> AccountId {
    acc("owner.test")
}
fn token() -> AccountId {
    acc("token.test")
}
fn settler() -> AccountId {
    acc("settler.test")
}
fn casino() -> AccountId {
    acc("casino.test")
}
fn alice() -> AccountId {
    acc("alice.test")
}
fn bob() -> AccountId {
    acc("bob.test")
}
fn don() -> AccountId {
    acc("don.test")
}

fn set_ctx(predecessor: AccountId, deposit: u128, now: u64) {
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(casino())
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(now)
            .build()
    );
}

fn setup() -> Contract {
    set_ctx(owner(), 0, T0);
    let mut c = Contract::new(owner(), token(), settler());
    set_ctx(owner(), 1, T0);
    // per-transfer 5, daily 12, max buy-in 10
    c.register_agent(don(), U128(5 * TRASH), U128(12 * TRASH), U128(10 * TRASH));
    c
}

fn transfer_in(c: &mut Contract, from: AccountId, amount: u128, msg: &str, now: u64) -> u128 {
    set_ctx(token(), 0, now);
    match c.ft_on_transfer(from, U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

fn fund_don(c: &mut Contract, amount: u128) {
    let unused = transfer_in(c, owner(), amount, r#"{"type":"fund_agent","agent_id":"don.test"}"#, T0);
    assert_eq!(unused, 0);
}

fn create_game(c: &mut Contract, id: &str, players: Vec<AccountId>) {
    set_ctx(settler(), 0, T0);
    c.create_game(id.into(), U128(10 * TRASH), players, 600);
}

fn buy_in(c: &mut Contract, id: &str, from: AccountId, amount: u128) -> u128 {
    transfer_in(c, from, amount, &format!(r#"{{"type":"buy_in","game_id":"{id}"}}"#), T0 + 1)
}

fn state(c: &Contract, id: &str) -> GameState {
    c.get_game_status(id.into()).unwrap().state
}

// ------------------------------------------------------------ message parsing

#[test]
fn parses_known_messages_and_rejects_unknown_fields() {
    let m: TransferMsg = serde_json::from_str(r#"{"type":"buy_in","game_id":"g1"}"#).unwrap();
    assert_eq!(m, TransferMsg::BuyIn { game_id: "g1".into() });
    assert!(serde_json::from_str::<TransferMsg>(r#"{"type":"buy_in","game_id":"g1","x":1}"#).is_err());
    assert!(serde_json::from_str::<TransferMsg>(r#"{"type":"steal","game_id":"g1"}"#).is_err());
    assert!(serde_json::from_str::<TransferMsg>("not json").is_err());
}

#[test]
fn invalid_message_returns_full_amount() {
    let mut c = setup();
    assert_eq!(transfer_in(&mut c, alice(), 7, "hello", T0), 7);
    assert_eq!(transfer_in(&mut c, alice(), 7, r#"{"type":"fund_agent","agent_id":"nobody.test"}"#, T0), 7);
}

#[test]
#[should_panic(expected = "Only the configured TRASH token is accepted")]
fn rejects_other_tokens() {
    let mut c = setup();
    set_ctx(acc("fake-token.test"), 0, T0);
    let _ = c.ft_on_transfer(alice(), U128(1), r#"{"type":"fund_agent","agent_id":"don.test"}"#.into());
}

// ------------------------------------------------------------------ buy-ins

#[test]
fn buy_in_accepts_listed_players_and_returns_excess() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()]);
    assert_eq!(buy_in(&mut c, "g1", alice(), 12 * TRASH), 2 * TRASH);
    assert_eq!(buy_in(&mut c, "g1", alice(), 10 * TRASH), 10 * TRASH, "double buy-in refunded");
    assert_eq!(buy_in(&mut c, "g1", acc("mallory.test"), 10 * TRASH), 10 * TRASH, "stranger refunded");
    assert_eq!(buy_in(&mut c, "g1", bob(), 9 * TRASH), 9 * TRASH, "underpayment refunded");
    assert_eq!(buy_in(&mut c, "unknown", bob(), 10 * TRASH), 10 * TRASH);
    let g = c.get_game_status("g1".into()).unwrap();
    assert_eq!(g.total_deposited.0, 10 * TRASH);
}

#[test]
fn buy_in_after_deadline_is_refunded() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()]);
    let late = T0 + 601 * 1_000_000_000;
    assert_eq!(transfer_in(&mut c, alice(), 10 * TRASH, r#"{"type":"buy_in","game_id":"g1"}"#, late), 10 * TRASH);
}

#[test]
#[should_panic(expected = "Game id already used")]
fn game_ids_are_unique() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()]);
    create_game(&mut c, "g1", vec![alice(), bob()]);
}

#[test]
#[should_panic(expected = "Only the settler can call this method")]
fn only_settler_creates_games() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    c.create_game("g1".into(), U128(1), vec![alice(), bob()], 60);
}

// --------------------------------------------------------------- settlement

fn funded_game(c: &mut Contract) {
    create_game(c, "g1", vec![alice(), bob()]);
    buy_in(c, "g1", alice(), 10 * TRASH);
    buy_in(c, "g1", bob(), 10 * TRASH);
}

fn settle(c: &mut Contract, payouts: Vec<(AccountId, u128)>) {
    set_ctx(settler(), 0, T0 + 2);
    c.settle_game(
        "g1".into(),
        payouts
            .into_iter()
            .map(|(account_id, amount)| Payout { account_id, amount: U128(amount) })
            .collect(),
    );
}

#[test]
fn settles_once_for_exact_total() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, vec![(alice(), 20 * TRASH)]);
    assert_eq!(state(&c, "g1"), GameState::Settled);
}

#[test]
#[should_panic(expected = "Game is not open")]
fn rejects_double_settlement() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, vec![(alice(), 20 * TRASH)]);
    settle(&mut c, vec![(alice(), 20 * TRASH)]);
}

#[test]
#[should_panic(expected = "Payouts must equal the escrowed total exactly")]
fn never_pays_more_than_received() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, vec![(alice(), 21 * TRASH)]);
}

#[test]
#[should_panic(expected = "Payout recipient is not a player in this game")]
fn payouts_only_to_players() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, vec![(settler(), 20 * TRASH)]);
}

#[test]
#[should_panic(expected = "Duplicate payout recipient")]
fn payout_recipients_unique() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, vec![(alice(), 10 * TRASH), (alice(), 10 * TRASH)]);
}

#[test]
#[should_panic(expected = "Not every player has paid the buy-in")]
fn cannot_settle_partially_funded_game() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()]);
    buy_in(&mut c, "g1", alice(), 10 * TRASH);
    settle(&mut c, vec![(alice(), 10 * TRASH)]);
}

#[test]
#[should_panic(expected = "Only the settler can call this method")]
fn players_cannot_settle() {
    let mut c = setup();
    funded_game(&mut c);
    set_ctx(alice(), 0, T0 + 2);
    c.settle_game("g1".into(), vec![Payout { account_id: alice(), amount: U128(20 * TRASH) }]);
}

#[test]
#[should_panic(expected = "Deadline passed; the game can only be refunded")]
fn cannot_settle_after_deadline() {
    let mut c = setup();
    funded_game(&mut c);
    set_ctx(settler(), 0, T0 + 601 * 1_000_000_000);
    c.settle_game("g1".into(), vec![Payout { account_id: alice(), amount: U128(20 * TRASH) }]);
}

// ------------------------------------------------------------------ refunds

#[test]
#[should_panic(expected = "Refunds open after the deadline")]
fn claim_refund_waits_for_deadline() {
    let mut c = setup();
    funded_game(&mut c);
    set_ctx(alice(), 0, T0 + 2);
    c.claim_refund("g1".into());
}

#[test]
fn claim_refund_after_deadline_expires_and_blocks_settlement() {
    let mut c = setup();
    funded_game(&mut c);
    set_ctx(alice(), 0, T0 + 601 * 1_000_000_000);
    c.claim_refund("g1".into());
    let g = c.get_game_status("g1".into()).unwrap();
    assert_eq!(g.state, GameState::Expired);
    assert!(g.seats.iter().all(|s| s.refunded));
}

#[test]
fn cancel_refunds_agent_internally() {
    let mut c = setup();
    fund_don(&mut c, 20 * TRASH);
    create_game(&mut c, "g1", vec![alice(), don()]);
    buy_in(&mut c, "g1", alice(), 10 * TRASH);
    set_ctx(don(), 0, T0 + 1);
    c.agent_join_game("g1".into());
    assert_eq!(c.get_agent_limits(don()).unwrap().balance.0, 10 * TRASH);
    set_ctx(settler(), 0, T0 + 2);
    c.cancel_game("g1".into());
    assert_eq!(state(&c, "g1"), GameState::Cancelled);
    assert_eq!(c.get_agent_limits(don()).unwrap().balance.0, 20 * TRASH);
}

#[test]
#[should_panic(expected = "Game is not open")]
fn cannot_cancel_settled_game() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, vec![(bob(), 20 * TRASH)]);
    set_ctx(settler(), 0, T0 + 3);
    c.cancel_game("g1".into());
}

// ------------------------------------------------------------- agent limits

#[test]
fn agent_pay_tracks_daily_spending_and_resets_next_day() {
    let mut c = setup();
    fund_don(&mut c, 100 * TRASH);
    set_ctx(don(), 0, T0);
    let _ = c.agent_pay(alice(), U128(5 * TRASH), Some("tip".into()));
    let _ = c.agent_pay(alice(), U128(5 * TRASH), None);
    let view = c.get_agent_limits(don()).unwrap();
    assert_eq!(view.spent_today.0, 10 * TRASH);
    assert_eq!(view.remaining_today.0, 2 * TRASH);
    assert_eq!(view.balance.0, 90 * TRASH);

    set_ctx(don(), 0, T0 + DAY_NS);
    let view = c.get_agent_limits(don()).unwrap();
    assert_eq!(view.spent_today.0, 0);
    let _ = c.agent_pay(alice(), U128(5 * TRASH), None);
    assert_eq!(c.get_agent_limits(don()).unwrap().spent_today.0, 5 * TRASH);
}

#[test]
#[should_panic(expected = "Amount exceeds the agent per-transfer limit")]
fn agent_pay_per_transfer_limit() {
    let mut c = setup();
    fund_don(&mut c, 100 * TRASH);
    set_ctx(don(), 0, T0);
    let _ = c.agent_pay(alice(), U128(5 * TRASH + 1), None);
}

#[test]
#[should_panic(expected = "Amount exceeds the agent daily limit")]
fn agent_pay_daily_limit() {
    let mut c = setup();
    fund_don(&mut c, 100 * TRASH);
    set_ctx(don(), 0, T0);
    let _ = c.agent_pay(alice(), U128(5 * TRASH), None);
    let _ = c.agent_pay(alice(), U128(5 * TRASH), None);
    let _ = c.agent_pay(alice(), U128(3 * TRASH), None);
}

#[test]
#[should_panic(expected = "Insufficient agent balance")]
fn agent_pay_needs_balance() {
    let mut c = setup();
    fund_don(&mut c, TRASH);
    set_ctx(don(), 0, T0);
    let _ = c.agent_pay(alice(), U128(2 * TRASH), None);
}

#[test]
#[should_panic(expected = "Caller is not a registered agent")]
fn only_agents_use_agent_pay() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    let _ = c.agent_pay(bob(), U128(1), None);
}

#[test]
#[should_panic(expected = "Buy-in exceeds the agent max buy-in")]
fn agent_max_buy_in() {
    let mut c = setup();
    fund_don(&mut c, 100 * TRASH);
    set_ctx(settler(), 0, T0);
    c.create_game("big".into(), U128(11 * TRASH), vec![alice(), don()], 600);
    set_ctx(don(), 0, T0 + 1);
    c.agent_join_game("big".into());
}

#[test]
fn agent_buy_in_counts_toward_daily_limit_and_winnings_are_internal() {
    let mut c = setup();
    fund_don(&mut c, 100 * TRASH);
    create_game(&mut c, "g1", vec![alice(), don()]);
    buy_in(&mut c, "g1", alice(), 10 * TRASH);
    set_ctx(don(), 0, T0 + 1);
    c.agent_join_game("g1".into());
    assert_eq!(c.get_agent_limits(don()).unwrap().remaining_today.0, 2 * TRASH);
    settle(&mut c, vec![(don(), 20 * TRASH)]);
    assert_eq!(c.get_agent_limits(don()).unwrap().balance.0, 110 * TRASH);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn owner_methods_require_full_access_key() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_agent_limits(don(), U128(1000 * TRASH), U128(1000 * TRASH), U128(0));
}

#[test]
#[should_panic(expected = "Only the owner can call this method")]
fn agents_cannot_raise_their_limits() {
    let mut c = setup();
    set_ctx(don(), 1, T0);
    c.set_agent_limits(don(), U128(1000 * TRASH), U128(1000 * TRASH), U128(0));
}

// -------------------------------------------------------- deals and callbacks

#[test]
fn deal_payment_credits_agent_once() {
    let mut c = setup();
    let msg = r#"{"type":"deal_payment","agent_id":"don.test","offer_id":"offer-1"}"#;
    assert_eq!(transfer_in(&mut c, alice(), 3 * TRASH, msg, T0), 0);
    assert_eq!(transfer_in(&mut c, alice(), 3 * TRASH, msg, T0), 3 * TRASH, "duplicate refunded");
    let paid = c.get_offer_payment("offer-1".into()).unwrap();
    assert_eq!(paid.payer_id, alice());
    assert_eq!(paid.amount.0, 3 * TRASH);
    assert_eq!(c.get_agent_limits(don()).unwrap().balance.0, 3 * TRASH);
}

fn callback_ctx(result: PromiseResult) {
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(casino())
            .predecessor_account_id(casino())
            .block_timestamp(T0)
            .build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

#[test]
fn failed_agent_pay_restores_balance_and_daily_spending() {
    let mut c = setup();
    fund_don(&mut c, 100 * TRASH);
    set_ctx(don(), 0, T0);
    let _ = c.agent_pay(alice(), U128(5 * TRASH), None);
    callback_ctx(PromiseResult::Failed);
    let ok = c.on_transfer_complete(
        alice(),
        U128(5 * TRASH),
        TransferKind::AgentPay { agent_id: don(), day: U64(T0 / DAY_NS) },
    );
    assert!(!ok);
    let view = c.get_agent_limits(don()).unwrap();
    assert_eq!(view.balance.0, 100 * TRASH);
    assert_eq!(view.spent_today.0, 0);
}

#[test]
fn failed_payout_becomes_claimable() {
    let mut c = setup();
    callback_ctx(PromiseResult::Failed);
    assert!(!c.on_transfer_complete(alice(), U128(20 * TRASH), TransferKind::Payout));
    assert_eq!(c.get_claimable(alice()).0, 20 * TRASH);
}
