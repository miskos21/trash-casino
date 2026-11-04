//! Trash Coin (TRASH): a NEP-141 / NEP-145 fungible token for Raccoon Royale.
//!
//! TRASH exists on NEAR Testnet only and has no real-world value.
//!
//! The token logic is the official `near-contract-standards` reference
//! implementation. The only addition is `ft_burn`, which lets any holder destroy
//! their own tokens (used later by the "dumpster" memecoin mechanic). Supply is
//! fixed: everything is minted once to `owner_id` at initialisation and there is
//! no mint method afterwards.

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
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue, assert_one_yocto, env,
    log, near, require,
};

pub const NAME: &str = "Trash Coin";
pub const SYMBOL: &str = "TRASH";
pub const DECIMALS: u8 = 24;
/// 1 TRASH in the smallest unit (yoctoTRASH).
pub const ONE_TRASH: u128 = 10u128.pow(DECIMALS as u32);
const MAX_MEMO_LEN: usize = 256;

const ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232f3b2f'/%3E%3Crect x='16' y='22' width='32' height='32' rx='4' fill='%238fbf5a'/%3E%3Crect x='12' y='14' width='40' height='7' rx='3' fill='%23b7e07c'/%3E%3Crect x='27' y='9' width='10' height='6' rx='2' fill='%23b7e07c'/%3E%3Cpath d='M25 28v20M32 28v20M39 28v20' stroke='%232f3b2f' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Accounts,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
}

#[near]
impl Contract {
    /// Mints the whole fixed supply to `owner_id`. Callable once.
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128) -> Self {
        require!(total_supply.0 > 0, "Total supply must be positive");
        let mut this = Self {
            token: FungibleToken::new(StorageKey::Accounts),
        };
        this.token.internal_register_account(&owner_id);
        this.token.internal_deposit(&owner_id, total_supply.0);
        FtMint {
            owner_id: &owner_id,
            amount: total_supply,
            memo: Some("Initial fixed supply. TRASH has no real-world value."),
        }
        .emit();
        this
    }

    /// Burns `amount` of the caller's own tokens and lowers the total supply.
    /// Requires exactly 1 yoctoNEAR, so only a full-access key can burn.
    #[payable]
    pub fn ft_burn(&mut self, amount: U128, memo: Option<String>) {
        assert_one_yocto();
        require!(amount.0 > 0, "The amount should be a positive number");
        if let Some(memo) = &memo {
            require!(memo.len() <= MAX_MEMO_LEN, "Memo is too long");
        }
        let owner_id = env::predecessor_account_id();
        self.token.internal_withdraw(&owner_id, amount.0);
        FtBurn {
            owner_id: &owner_id,
            amount,
            memo: memo.as_deref(),
        }
        .emit();
    }
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

    fn context(predecessor: AccountId, deposit: NearToken) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .predecessor_account_id(predecessor)
            .attached_deposit(deposit);
        builder
    }

    #[test]
    fn mints_fixed_supply_to_owner_with_metadata() {
        testing_env!(context(accounts(0), NearToken::from_yoctonear(0)).build());
        let contract = Contract::new(accounts(0), U128(SUPPLY));
        assert_eq!(contract.ft_total_supply().0, SUPPLY);
        assert_eq!(contract.ft_balance_of(accounts(0)).0, SUPPLY);
        let meta = contract.ft_metadata();
        assert_eq!(meta.symbol, "TRASH");
        assert_eq!(meta.name, "Trash Coin");
        assert_eq!(meta.decimals, 24);
        meta.assert_valid();
    }

    #[test]
    fn burn_lowers_balance_and_supply() {
        testing_env!(context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = Contract::new(accounts(0), U128(SUPPLY));
        testing_env!(context(accounts(0), NearToken::from_yoctonear(1)).build());
        contract.ft_burn(U128(5 * ONE_TRASH), Some("dumpster".into()));
        assert_eq!(contract.ft_total_supply().0, SUPPLY - 5 * ONE_TRASH);
        assert_eq!(contract.ft_balance_of(accounts(0)).0, SUPPLY - 5 * ONE_TRASH);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn burn_requires_one_yocto() {
        testing_env!(context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = Contract::new(accounts(0), U128(SUPPLY));
        contract.ft_burn(U128(1), None);
    }

    #[test]
    #[should_panic(expected = "The account doesn't have enough balance")]
    fn cannot_burn_more_than_balance() {
        testing_env!(context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = Contract::new(accounts(0), U128(SUPPLY));
        testing_env!(context(accounts(0), NearToken::from_yoctonear(1)).build());
        contract.ft_burn(U128(SUPPLY + 1), None);
    }

    #[test]
    #[should_panic(expected = "The amount should be a positive number")]
    fn cannot_burn_zero() {
        testing_env!(context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = Contract::new(accounts(0), U128(SUPPLY));
        testing_env!(context(accounts(0), NearToken::from_yoctonear(1)).build());
        contract.ft_burn(U128(0), None);
    }
}
