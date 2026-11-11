//! Trash Coin (TRASH): a NEP-141 / NEP-145 fungible token for Trashnino.
//!
//! TRASH exists on NEAR Testnet only and has no real-world value.
//!
//! The token logic is the official `near-contract-standards` reference
//! implementation. The initial supply is minted once to `owner_id`; the deploy
//! script moves all of it into the casino's house bankroll.
//!
//! The only addition is a rate-limited **test faucet**: any account can mint a
//! fixed amount for itself once per cooldown. It replaces buying TRASH from the
//! casino while the game runs on testnet. The owner can change or disable it.

use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::{U64, U128};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    assert_one_yocto, env, log, near, require,
};

pub const NAME: &str = "Trash Coin";
pub const SYMBOL: &str = "TRASH";
pub const DECIMALS: u8 = 24;
/// 1 TRASH in the smallest unit (yoctoTRASH).
pub const ONE_TRASH: u128 = 10u128.pow(DECIMALS as u32);
/// The faucet can never be configured above this per claim.
pub const MAX_FAUCET_AMOUNT: u128 = 10_000 * ONE_TRASH;
const NS_PER_SECOND: u64 = 1_000_000_000;

const ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232f3b2f'/%3E%3Crect x='16' y='22' width='32' height='32' rx='4' fill='%238fbf5a'/%3E%3Crect x='12' y='14' width='40' height='7' rx='3' fill='%23b7e07c'/%3E%3Crect x='27' y='9' width='10' height='6' rx='2' fill='%23b7e07c'/%3E%3Cpath d='M25 28v20M32 28v20M39 28v20' stroke='%232f3b2f' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Accounts,
    FaucetClaims,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FaucetView {
    /// TRASH minted per claim, in yoctoTRASH. Zero means the faucet is disabled.
    pub amount: U128,
    pub cooldown_seconds: u64,
    /// Earliest block time (ns) at which `account_id` can claim again; 0 = now.
    pub next_claim_ns: U64,
    /// Whether `account_id` is registered with the token (otherwise the first
    /// claim must attach `storage_deposit_yocto`).
    pub registered: bool,
    pub storage_deposit_yocto: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    owner_id: AccountId,
    faucet_amount: u128,
    faucet_cooldown_ns: u64,
    /// Block time (ns) of each account's last faucet claim.
    faucet_claims: LookupMap<AccountId, u64>,
}

#[near]
impl Contract {
    /// Mints the initial supply to `owner_id` and configures the faucet. Callable once.
    #[init]
    pub fn new(
        owner_id: AccountId,
        total_supply: U128,
        faucet_amount: U128,
        faucet_cooldown_seconds: u64,
    ) -> Self {
        require!(total_supply.0 > 0, "Total supply must be positive");
        validate_faucet(faucet_amount.0);
        let mut this = Self {
            token: FungibleToken::new(StorageKey::Accounts),
            owner_id: owner_id.clone(),
            faucet_amount: faucet_amount.0,
            faucet_cooldown_ns: faucet_cooldown_seconds.saturating_mul(NS_PER_SECOND),
            faucet_claims: LookupMap::new(StorageKey::FaucetClaims),
        };
        this.token.internal_register_account(&owner_id);
        this.token.internal_deposit(&owner_id, total_supply.0);
        FtMint {
            owner_id: &owner_id,
            amount: total_supply,
            memo: Some("Initial supply for the casino house. TRASH has no real-world value."),
        }
        .emit();
        this
    }

    /// Test faucet: mints `faucet_amount` to the caller, at most once per cooldown.
    ///
    /// An unregistered caller must attach at least the NEP-145 storage minimum;
    /// the faucet registers the account and refunds the rest. A registered caller
    /// gets any attached deposit back. Returns the minted amount.
    #[payable]
    pub fn faucet(&mut self) -> U128 {
        require!(self.faucet_amount > 0, "The faucet is disabled");
        let account_id = env::predecessor_account_id();
        let now = env::block_timestamp();
        if let Some(last) = self.faucet_claims.get(&account_id) {
            require!(
                now >= last.saturating_add(self.faucet_cooldown_ns),
                "Faucet cooldown: try again later"
            );
        }

        let attached = env::attached_deposit();
        let mut refund = attached;
        if !self.token.accounts.contains_key(&account_id) {
            let min = self.token.storage_balance_bounds().min;
            if attached < min {
                env::panic_str(&format!(
                    "Attach {} yoctoNEAR to register with TRASH on the first claim",
                    min.as_yoctonear()
                ));
            }
            self.token.internal_register_account(&account_id);
            refund = attached.saturating_sub(min);
        }

        self.faucet_claims.insert(account_id.clone(), now);
        self.token.internal_deposit(&account_id, self.faucet_amount);
        FtMint {
            owner_id: &account_id,
            amount: U128(self.faucet_amount),
            memo: Some("Test faucet. TRASH has no real-world value."),
        }
        .emit();
        if !refund.is_zero() {
            Promise::new(account_id).transfer(refund).detach();
        }
        U128(self.faucet_amount)
    }

    /// Changes the faucet. `amount = 0` disables it. Requires exactly 1 yoctoNEAR.
    #[payable]
    pub fn set_faucet(&mut self, amount: U128, cooldown_seconds: u64) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can call this method"
        );
        validate_faucet(amount.0);
        self.faucet_amount = amount.0;
        self.faucet_cooldown_ns = cooldown_seconds.saturating_mul(NS_PER_SECOND);
    }

    pub fn get_faucet(&self, account_id: AccountId) -> FaucetView {
        let next_claim_ns = self
            .faucet_claims
            .get(&account_id)
            .map(|last| last.saturating_add(self.faucet_cooldown_ns))
            .unwrap_or(0);
        FaucetView {
            amount: U128(self.faucet_amount),
            cooldown_seconds: self.faucet_cooldown_ns / NS_PER_SECOND,
            next_claim_ns: U64(next_claim_ns),
            registered: self.token.accounts.contains_key(&account_id),
            storage_deposit_yocto: U128(self.token.storage_balance_bounds().min.as_yoctonear()),
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }
}

fn validate_faucet(amount: u128) {
    require!(amount <= MAX_FAUCET_AMOUNT, "Faucet amount is too large");
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used_amount, burned_amount) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned_amount > 0 {
            log!("Account @{} burned {}", sender_id, burned_amount);
        }
        used_amount.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            if balance > 0 {
                FtBurn {
                    owner_id: &account_id,
                    amount: U128(balance),
                    memo: Some("Account unregistered with force"),
                }
                .emit();
            }
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: NAME.to_string(),
            symbol: SYMBOL.to_string(),
            icon: Some(ICON.to_string()),
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    const SUPPLY: u128 = 1_000_000_000 * ONE_TRASH;
    const FAUCET: u128 = 100 * ONE_TRASH;
    const T0: u64 = 1_800_000_000 * NS_PER_SECOND;

    fn context(predecessor: AccountId, deposit: u128, now: u64) {
        testing_env!(
            VMContextBuilder::new()
                .predecessor_account_id(predecessor)
                .attached_deposit(NearToken::from_yoctonear(deposit))
                .block_timestamp(now)
                .build()
        );
    }

    fn setup() -> Contract {
        context(accounts(0), 0, T0);
        Contract::new(accounts(0), U128(SUPPLY), U128(FAUCET), 60)
    }

    fn storage_min(c: &Contract) -> u128 {
        c.storage_balance_bounds().min.as_yoctonear()
    }

    #[test]
    fn mints_initial_supply_to_owner_with_metadata() {
        let contract = setup();
        assert_eq!(contract.ft_total_supply().0, SUPPLY);
        assert_eq!(contract.ft_balance_of(accounts(0)).0, SUPPLY);
        let meta = contract.ft_metadata();
        assert_eq!(meta.symbol, "TRASH");
        assert_eq!(meta.name, "Trash Coin");
        assert_eq!(meta.decimals, 24);
        meta.assert_valid();
    }

    #[test]
    fn faucet_registers_mints_and_raises_supply() {
        let mut c = setup();
        let min = storage_min(&c);
        assert!(!c.get_faucet(accounts(1)).registered);
        context(accounts(1), min, T0);
        assert_eq!(c.faucet().0, FAUCET);
        assert_eq!(c.ft_balance_of(accounts(1)).0, FAUCET);
        assert_eq!(c.ft_total_supply().0, SUPPLY + FAUCET);
        let view = c.get_faucet(accounts(1));
        assert!(view.registered);
        assert_eq!(view.next_claim_ns.0, T0 + 60 * NS_PER_SECOND);
    }

    #[test]
    #[should_panic(expected = "to register with TRASH on the first claim")]
    fn first_claim_needs_storage_deposit() {
        let mut c = setup();
        context(accounts(1), 0, T0);
        c.faucet();
    }

    #[test]
    #[should_panic(expected = "Faucet cooldown")]
    fn faucet_cooldown_applies_per_account() {
        let mut c = setup();
        let min = storage_min(&c);
        context(accounts(1), min, T0);
        c.faucet();
        context(accounts(1), 0, T0 + 59 * NS_PER_SECOND);
        c.faucet();
    }

    #[test]
    fn faucet_works_again_after_cooldown_and_for_other_accounts() {
        let mut c = setup();
        let min = storage_min(&c);
        context(accounts(1), min, T0);
        c.faucet();
        context(accounts(2), min, T0 + 1);
        c.faucet();
        context(accounts(1), 0, T0 + 60 * NS_PER_SECOND);
        c.faucet();
        assert_eq!(c.ft_balance_of(accounts(1)).0, 2 * FAUCET);
        assert_eq!(c.ft_balance_of(accounts(2)).0, FAUCET);
    }

    #[test]
    #[should_panic(expected = "The faucet is disabled")]
    fn owner_can_disable_faucet() {
        let mut c = setup();
        context(accounts(0), 1, T0);
        c.set_faucet(U128(0), 60);
        context(accounts(1), storage_min(&c), T0);
        c.faucet();
    }

    #[test]
    #[should_panic(expected = "Only the owner can call this method")]
    fn others_cannot_change_faucet() {
        let mut c = setup();
        context(accounts(1), 1, T0);
        c.set_faucet(U128(MAX_FAUCET_AMOUNT), 0);
    }

    #[test]
    #[should_panic(expected = "Faucet amount is too large")]
    fn faucet_amount_is_capped() {
        let mut c = setup();
        context(accounts(0), 1, T0);
        c.set_faucet(U128(MAX_FAUCET_AMOUNT + 1), 0);
    }
}
