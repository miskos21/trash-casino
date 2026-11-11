use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{PromiseResult, RuntimeFeesConfig, testing_env, test_vm_config};

const TRASH: u128 = 1_000_000_000_000_000_000_000_000;
const T0: u64 = 1_800_000_000 * 1_000_000_000; // some time in 2027, ns
const SEC: u64 = 1_000_000_000;

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

/// House 1,000 TRASH, max 250 per game, 400 per day. Don tips 5 / 12 per day.
/// Alice and Bob each deposited 100 TRASH.
fn setup() -> Contract {
    set_ctx(owner(), 0, T0);
    let mut c = Contract::new(owner(), token(), settler(), U128(250 * TRASH), U128(400 * TRASH));
    set_ctx(owner(), 1, T0);
    c.register_agent(don(), U128(5 * TRASH), U128(12 * TRASH));
    assert_eq!(transfer_in(&mut c, owner(), 1_000 * TRASH, r#"{"type":"fund_house"}"#), 0);
    assert_eq!(transfer_in(&mut c, alice(), 100 * TRASH, r#"{"type":"deposit"}"#), 0);
    assert_eq!(transfer_in(&mut c, bob(), 100 * TRASH, r#"{"type":"deposit"}"#), 0);
    c
}

fn transfer_in(c: &mut Contract, from: AccountId, amount: u128, msg: &str) -> u128 {
    set_ctx(token(), 0, T0);
    match c.ft_on_transfer(from, U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

fn create_game(c: &mut Contract, id: &str, players: Vec<AccountId>, house_stake: Option<u128>) {
    set_ctx(settler(), 0, T0);
    c.create_game(id.into(), U128(10 * TRASH), players, house_stake.map(U128), 600);
}

fn join(c: &mut Contract, id: &str, who: AccountId) {
    set_ctx(who, 0, T0 + 1);
    c.join_game(id.into());
}

fn settle(c: &mut Contract, id: &str, payouts: Vec<(AccountId, u128)>) {
    set_ctx(settler(), 0, T0 + 2);
    c.settle_game(
        id.into(),
        payouts
            .into_iter()
            .map(|(account_id, amount)| Payout { account_id, amount: U128(amount) })
            .collect(),
    );
}

fn balance(c: &Contract, who: AccountId) -> u128 {
    c.get_balance(who).0
}

fn house(c: &Contract) -> u128 {
    c.get_house().balance.0
}

fn state(c: &Contract, id: &str) -> GameState {
    c.get_game_status(id.into()).unwrap().state
}

/// Every test ends here: the ledger must account for exactly what came in.
fn assert_totals(c: &Contract, expected_total: u128) {
    let t = c.get_totals();
    assert_eq!(t.total.0, expected_total);
    assert_eq!(t.total.0, t.house.0 + t.player_balances.0 + t.escrow.0 + t.pending_withdrawals.0);
}

const FUNDED: u128 = 1_200 * TRASH;

// ------------------------------------------------------- deposits and messages

#[test]
fn parses_known_messages_and_rejects_unknown_fields() {
    let m: TransferMsg = serde_json::from_str(r#"{"type":"deposit"}"#).unwrap();
    assert_eq!(m, TransferMsg::Deposit {});
    let m: TransferMsg = serde_json::from_str(r#"{"type":"fund_house"}"#).unwrap();
    assert_eq!(m, TransferMsg::FundHouse {});
    assert!(serde_json::from_str::<TransferMsg>(r#"{"type":"deposit","x":1}"#).is_err());
    assert!(serde_json::from_str::<TransferMsg>(r#"{"type":"buy_in","game_id":"g1"}"#).is_err());
    assert!(serde_json::from_str::<TransferMsg>("not json").is_err());
}

#[test]
fn deposits_and_house_funding_are_credited() {
    let c = setup();
    assert_eq!(balance(&c, alice()), 100 * TRASH);
    assert_eq!(house(&c), 1_000 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
fn invalid_messages_and_agent_deposits_return_full_amount() {
    let mut c = setup();
    assert_eq!(transfer_in(&mut c, alice(), 7, "hello"), 7);
    assert_eq!(transfer_in(&mut c, alice(), 7, r#"{"type":"deposit","for":"bob.test"}"#), 7);
    assert_eq!(transfer_in(&mut c, don(), 7, r#"{"type":"deposit"}"#), 7);
    assert_eq!(balance(&c, don()), 0);
    assert_totals(&c, FUNDED);
}

#[test]
#[should_panic(expected = "Only the configured TRASH token is accepted")]
fn rejects_other_tokens() {
    let mut c = setup();
    set_ctx(acc("fake-token.test"), 0, T0);
    let _ = c.ft_on_transfer(alice(), U128(1), r#"{"type":"deposit"}"#.into());
}

// ------------------------------------------------------------------ withdrawals

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
fn withdraw_debits_then_confirms() {
    let mut c = setup();
    set_ctx(alice(), 1, T0);
    let _ = c.withdraw(U128(40 * TRASH));
    assert_eq!(balance(&c, alice()), 60 * TRASH);
    assert_eq!(c.get_totals().pending_withdrawals.0, 40 * TRASH);
    assert_totals(&c, FUNDED);
    callback_ctx(PromiseResult::Successful(vec![]));
    assert!(c.on_withdraw_complete(alice(), U128(40 * TRASH)));
    assert_eq!(c.get_totals().pending_withdrawals.0, 0);
    assert_totals(&c, FUNDED - 40 * TRASH);
}

#[test]
fn failed_withdraw_restores_balance() {
    let mut c = setup();
    set_ctx(alice(), 1, T0);
    let _ = c.withdraw(U128(100 * TRASH));
    assert_eq!(balance(&c, alice()), 0);
    callback_ctx(PromiseResult::Failed);
    assert!(!c.on_withdraw_complete(alice(), U128(100 * TRASH)));
    assert_eq!(balance(&c, alice()), 100 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_needs_full_access_key() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    let _ = c.withdraw(U128(1));
}

#[test]
#[should_panic(expected = "Insufficient casino balance")]
fn cannot_withdraw_more_than_balance() {
    let mut c = setup();
    set_ctx(alice(), 1, T0);
    let _ = c.withdraw(U128(100 * TRASH + 1));
}

// ------------------------------------------------------------------- games

#[test]
fn human_game_escrows_settles_once_and_pays_balances() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()], None);
    join(&mut c, "g1", alice());
    join(&mut c, "g1", bob());
    assert_eq!(balance(&c, alice()), 90 * TRASH);
    assert_eq!(c.get_totals().escrow.0, 20 * TRASH);
    assert_totals(&c, FUNDED);
    settle(&mut c, "g1", vec![(alice(), 20 * TRASH)]);
    assert_eq!(state(&c, "g1"), GameState::Settled);
    assert_eq!(balance(&c, alice()), 110 * TRASH);
    assert_eq!(balance(&c, bob()), 90 * TRASH);
    assert_eq!(c.get_totals().escrow.0, 0);
    assert_totals(&c, FUNDED);
}

#[test]
fn agent_seats_use_house_money_and_winnings_return_to_house() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), don()], None);
    assert_eq!(house(&c), 990 * TRASH, "Don's buy-in came from the house");
    assert_eq!(c.get_house().staked_today.0, 10 * TRASH);
    join(&mut c, "g1", alice());
    settle(&mut c, "g1", vec![(don(), 20 * TRASH)]);
    assert_eq!(house(&c), 1_010 * TRASH);
    assert_eq!(balance(&c, don()), 0, "agents never hold a player balance");
    assert_eq!(c.get_game_status("g1".into()).unwrap().house_payout.0, 20 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
fn player_beats_agent_and_takes_house_money() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), don()], None);
    join(&mut c, "g1", alice());
    settle(&mut c, "g1", vec![(alice(), 20 * TRASH)]);
    assert_eq!(balance(&c, alice()), 110 * TRASH);
    assert_eq!(house(&c), 990 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
fn single_player_game_against_house_stake() {
    let mut c = setup();
    create_game(&mut c, "bj", vec![alice()], Some(25 * TRASH));
    join(&mut c, "bj", alice());
    // Alice ends 7 TRASH up; the remainder of the escrow returns to the house.
    settle(&mut c, "bj", vec![(alice(), 17 * TRASH)]);
    assert_eq!(balance(&c, alice()), 107 * TRASH);
    assert_eq!(house(&c), 993 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
#[should_panic(expected = "A game needs two players or a house stake")]
fn single_player_without_house_stake_is_rejected() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice()], None);
}

#[test]
#[should_panic(expected = "Insufficient casino balance for the buy-in")]
fn join_needs_casino_balance() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), acc("carol.test")], None);
    join(&mut c, "g1", acc("carol.test"));
}

#[test]
#[should_panic(expected = "Buy-in already paid")]
fn cannot_join_twice() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()], None);
    join(&mut c, "g1", alice());
    join(&mut c, "g1", alice());
}

#[test]
#[should_panic(expected = "Caller has no seat in this game")]
fn strangers_cannot_join() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()], None);
    join(&mut c, "g1", acc("mallory.test"));
}

#[test]
#[should_panic(expected = "Buy-in deadline has passed")]
fn cannot_join_after_deadline() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()], None);
    set_ctx(alice(), 0, T0 + 601 * SEC);
    c.join_game("g1".into());
}

#[test]
#[should_panic(expected = "Game id already used")]
fn game_ids_are_unique() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()], None);
    create_game(&mut c, "g1", vec![alice(), bob()], None);
}

#[test]
#[should_panic(expected = "Only the settler can call this method")]
fn only_settler_creates_games() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    c.create_game("g1".into(), U128(1), vec![alice(), bob()], None, 60);
}

// -------------------------------------------------------------- settlement

fn funded_game(c: &mut Contract) {
    create_game(c, "g1", vec![alice(), bob()], None);
    join(c, "g1", alice());
    join(c, "g1", bob());
}

#[test]
#[should_panic(expected = "Game is not open")]
fn rejects_double_settlement() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, "g1", vec![(alice(), 20 * TRASH)]);
    settle(&mut c, "g1", vec![(alice(), 20 * TRASH)]);
}

#[test]
#[should_panic(expected = "Payouts exceed the escrowed total")]
fn never_pays_more_than_received() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, "g1", vec![(alice(), 21 * TRASH)]);
}

#[test]
#[should_panic(expected = "Payout recipient is not a player in this game")]
fn payouts_only_to_players() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, "g1", vec![(settler(), 20 * TRASH)]);
}

#[test]
#[should_panic(expected = "Duplicate payout recipient")]
fn payout_recipients_unique() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, "g1", vec![(alice(), 10 * TRASH), (alice(), 10 * TRASH)]);
}

#[test]
#[should_panic(expected = "Not every player has paid the buy-in")]
fn cannot_settle_partially_funded_game() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()], None);
    join(&mut c, "g1", alice());
    settle(&mut c, "g1", vec![(alice(), 10 * TRASH)]);
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
    set_ctx(settler(), 0, T0 + 601 * SEC);
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
fn claim_refund_after_deadline_returns_everything() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), don()], Some(5 * TRASH));
    join(&mut c, "g1", alice());
    set_ctx(alice(), 0, T0 + 601 * SEC);
    c.claim_refund("g1".into());
    let g = c.get_game_status("g1".into()).unwrap();
    assert_eq!(g.state, GameState::Expired);
    assert!(g.seats.iter().all(|s| s.refunded));
    assert_eq!(balance(&c, alice()), 100 * TRASH);
    assert_eq!(house(&c), 1_000 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
fn cancel_refunds_humans_and_house() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), don()], None);
    join(&mut c, "g1", alice());
    set_ctx(settler(), 0, T0 + 2);
    c.cancel_game("g1".into());
    assert_eq!(state(&c, "g1"), GameState::Cancelled);
    assert_eq!(balance(&c, alice()), 100 * TRASH);
    assert_eq!(house(&c), 1_000 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
fn cancel_before_anyone_paid_refunds_only_house() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice(), bob()], None);
    set_ctx(settler(), 0, T0 + 2);
    c.cancel_game("g1".into());
    assert_eq!(balance(&c, alice()), 100 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
#[should_panic(expected = "Game is not open")]
fn cannot_cancel_settled_game() {
    let mut c = setup();
    funded_game(&mut c);
    settle(&mut c, "g1", vec![(bob(), 20 * TRASH)]);
    set_ctx(settler(), 0, T0 + 3);
    c.cancel_game("g1".into());
}

// ------------------------------------------------------------- house limits

#[test]
#[should_panic(expected = "House stake exceeds the per-game limit")]
fn house_stake_per_game_limit() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice()], Some(251 * TRASH));
}

#[test]
#[should_panic(expected = "House stake exceeds the daily limit")]
fn house_stake_daily_limit() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice()], Some(250 * TRASH));
    create_game(&mut c, "g2", vec![bob()], Some(151 * TRASH));
}

#[test]
fn house_daily_limit_resets_next_day() {
    let mut c = setup();
    create_game(&mut c, "g1", vec![alice()], Some(250 * TRASH));
    set_ctx(settler(), 0, T0 + DAY_NS);
    c.create_game("g2".into(), U128(10 * TRASH), vec![bob()], Some(U128(250 * TRASH)), 600);
    assert_eq!(c.get_house().staked_today.0, 250 * TRASH);
}

#[test]
#[should_panic(expected = "Only the owner can call this method")]
fn settler_cannot_raise_house_limits() {
    let mut c = setup();
    set_ctx(settler(), 1, T0);
    c.set_house_limits(U128(u128::MAX), U128(u128::MAX));
}

// ------------------------------------------------------------- agent tips

#[test]
fn agent_pay_tips_from_house_and_resets_next_day() {
    let mut c = setup();
    set_ctx(don(), 0, T0);
    c.agent_pay(alice(), U128(5 * TRASH), Some("tip".into()));
    c.agent_pay(alice(), U128(5 * TRASH), None);
    let view = c.get_agent_limits(don()).unwrap();
    assert_eq!(view.tipped_today.0, 10 * TRASH);
    assert_eq!(view.remaining_today.0, 2 * TRASH);
    assert_eq!(balance(&c, alice()), 110 * TRASH);
    assert_eq!(house(&c), 990 * TRASH);
    assert_totals(&c, FUNDED);

    set_ctx(don(), 0, T0 + DAY_NS);
    assert_eq!(c.get_agent_limits(don()).unwrap().tipped_today.0, 0);
    c.agent_pay(alice(), U128(5 * TRASH), None);
    assert_eq!(c.get_agent_limits(don()).unwrap().tipped_today.0, 5 * TRASH);
}

#[test]
fn tip_can_reach_an_account_without_a_balance() {
    let mut c = setup();
    set_ctx(don(), 0, T0);
    c.agent_pay(acc("carol.test"), U128(3 * TRASH), None);
    assert_eq!(balance(&c, acc("carol.test")), 3 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
#[should_panic(expected = "Amount exceeds the agent per-transfer limit")]
fn agent_pay_per_transfer_limit() {
    let mut c = setup();
    set_ctx(don(), 0, T0);
    c.agent_pay(alice(), U128(5 * TRASH + 1), None);
}

#[test]
#[should_panic(expected = "Amount exceeds the agent daily limit")]
fn agent_pay_daily_limit() {
    let mut c = setup();
    set_ctx(don(), 0, T0);
    c.agent_pay(alice(), U128(5 * TRASH), None);
    c.agent_pay(alice(), U128(5 * TRASH), None);
    c.agent_pay(alice(), U128(3 * TRASH), None);
}

#[test]
#[should_panic(expected = "Caller is not a registered agent")]
fn only_agents_use_agent_pay() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    c.agent_pay(bob(), U128(1), None);
}

#[test]
#[should_panic(expected = "Invalid receiver")]
fn agents_cannot_tip_themselves() {
    let mut c = setup();
    set_ctx(don(), 0, T0);
    c.agent_pay(don(), U128(1), None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn owner_methods_require_full_access_key() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_agent_limits(don(), U128(1000 * TRASH), U128(1000 * TRASH));
}

#[test]
#[should_panic(expected = "Only the owner can call this method")]
fn agents_cannot_raise_their_limits() {
    let mut c = setup();
    set_ctx(don(), 1, T0);
    c.set_agent_limits(don(), U128(1000 * TRASH), U128(1000 * TRASH));
}

// ------------------------------------------------------------------- deals

#[test]
fn pay_offer_moves_balance_to_house_once() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    c.pay_offer("offer-1".into(), don(), U128(3 * TRASH));
    let paid = c.get_offer_payment("offer-1".into()).unwrap();
    assert_eq!(paid.payer_id, alice());
    assert_eq!(paid.amount.0, 3 * TRASH);
    assert_eq!(balance(&c, alice()), 97 * TRASH);
    assert_eq!(house(&c), 1_003 * TRASH);
    assert_totals(&c, FUNDED);
}

#[test]
#[should_panic(expected = "Offer already paid")]
fn pay_offer_rejects_duplicates() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    c.pay_offer("offer-1".into(), don(), U128(3 * TRASH));
    c.pay_offer("offer-1".into(), don(), U128(3 * TRASH));
}

#[test]
#[should_panic(expected = "Unknown agent")]
fn pay_offer_only_to_agents() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    c.pay_offer("offer-1".into(), bob(), U128(3 * TRASH));
}
