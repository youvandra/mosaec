//! NFT collection for Titles and Tickets, offer book and settlement venue.
//!
//! The registry creates keyless packs, records each pack's position, and settles fills. It reads
//! no price. A fill decides in one value-returning receipt and delivers the principal and the
//! pack's encumbrance by retryable detached promises. A pause-only guardian can stop new
//! positions; it has no method that moves funds or changes holders, terms or caps.

mod calls;
mod nft;
mod position;

use std::collections::HashSet;

use mosaec_shared::constants::{
    BATCH_MAX_TOKENS, COMMAND_GAS, FILL_DECIDE_GAS, FILL_GAS, GAS_DELIVERY_CALLBACK,
    GAS_NFT_RESOLVE, GAS_VERIFIER_VIEW, MAX_ACCOUNT_ID_LEN, MAX_PAGE, MINT_DEPOSIT, MINT_GAS,
    NFT_TRANSFER_CALL_GAS, Network, PACK_OPS_RESERVE, PACK_STORAGE, token_rule,
};
use mosaec_shared::contents::Contents;
use mosaec_shared::error::ensure;
use mosaec_shared::events::{CancelReason, MosaecEvent};
use mosaec_shared::promise::{read_json, succeeded, then_self};
use mosaec_shared::types::{Destination, NftKind, Terms, TransferMsg};
use mosaec_shared::{MosaecError, MosaecResult};
use near_sdk::json_types::{Base58CryptoHash, U128};
use near_sdk::serde_json::{self, Value, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, CryptoHash, FunctionError, Gas, NearToken, PanicOnDefault, PromiseIndex, env, near,
};

use crate::nft::{Nft, TokenRecord, token_metadata};
use crate::position::{FillReads, Offer, Position, Stage};

/// Storage prefix of the positions map. NFT collections use `n:` prefixes.
const PREFIX_POSITIONS: &[u8] = b"p";

#[near(
    contract_state,
    contract_metadata(
        link = "https://github.com/youvandra/mosaec",
        standard(standard = "nep330", version = "1.2.0"),
        standard(standard = "nep171", version = "1.2.0"),
        standard(standard = "nep177", version = "2.0.0"),
        standard(standard = "nep181", version = "1.0.0"),
        standard(standard = "nep245-receiver", version = "1.0.0")
    )
)]
#[derive(Debug, PanicOnDefault)]
pub struct Registry {
    guardian: AccountId,
    pack_code_hash: CryptoHash,
    network: Network,
    /// The NEAR Intents verifier every pack of this registry holds its balances in.
    verifier: AccountId,
    paused: bool,
    next_index: u64,
    positions: LookupMap<AccountId, Position>,
    nft: Nft,
}

/// Registry settings, fixed at init.
#[near(serializers = [json])]
#[derive(Debug)]
pub struct Config {
    pub guardian: AccountId,
    pub pack_code_hash: Base58CryptoHash,
    pub network: Network,
    pub verifier: AccountId,
    pub paused: bool,
    pub packs_created: u64,
    pub mint_deposit: NearToken,
}

/// A position with the holders of its Title and Ticket.
#[near(serializers = [json])]
#[derive(Debug)]
pub struct PositionView {
    pub pack: AccountId,
    pub position: Position,
    pub title_owner: Option<AccountId>,
    pub ticket_owner: Option<AccountId>,
    pub title_pending: bool,
    pub ticket_pending: bool,
}

/// One NEP-171 token as views return it.
#[near(serializers = [json])]
#[derive(Debug)]
pub struct JsonToken {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: Value,
}

#[near]
#[allow(
    clippy::needless_pass_by_value,
    reason = "contract methods receive owned arguments deserialized by the SDK"
)]
impl Registry {
    /// Deploy-time init. `pack_code_hash` names the global pack contract every pack runs. A
    /// mainnet registry accepts only `intents.near` as its verifier, and every registry must sit
    /// under its network's top-level suffix, so a testnet build can never run as mainnet.
    #[init]
    #[private]
    #[must_use]
    pub fn new(
        guardian: AccountId,
        pack_code_hash: Base58CryptoHash,
        network: Network,
        verifier: AccountId,
    ) -> Self {
        if let Err(error) = check_network(network, &verifier) {
            error.panic();
        }
        Self {
            guardian,
            pack_code_hash: pack_code_hash.into(),
            network,
            verifier,
            paused: false,
            next_index: 0,
            positions: LookupMap::new(PREFIX_POSITIONS),
            nft: Nft::new(),
        }
    }

    // -----------------------------------------------------------------------------------------
    // Mint
    // -----------------------------------------------------------------------------------------

    /// Creates a keyless pack and, once it exists, mints its Title to the caller. Attach
    /// `mint_deposit`; any excess is returned. Panics with `E_PAUSED`, `E_STORAGE` or `E_GAS`.
    #[payable]
    pub fn mint(&mut self) {
        let chain = self.try_mint().unwrap_or_else(|e| e.panic());
        env::promise_return(chain);
    }

    #[private]
    pub fn on_minted(&mut self, pack: AccountId, owner_id: AccountId, index: u64) -> bool {
        if !succeeded(0) {
            calls::refund_near(&owner_id, MINT_DEPOSIT);
            return false;
        }
        let title_id = nft::title_id(index);
        self.positions
            .insert(pack.clone(), Position::new(index, title_id.clone()));
        self.nft.mint(
            title_id.clone(),
            TokenRecord {
                owner_id: owner_id.clone(),
                kind: NftKind::Title,
                pack: pack.clone(),
            },
        );
        MosaecEvent::PackMinted {
            pack,
            title_id,
            owner_id,
        }
        .emit();
        true
    }

    // -----------------------------------------------------------------------------------------
    // Offer and cancel
    // -----------------------------------------------------------------------------------------

    /// Opens an offer on a `Free` pack: the caller sells the Title for `price` and keeps a Ticket
    /// on `terms`. The contents are the pack's full balances of `token_ids`, read now.
    #[allow(
        clippy::too_many_arguments,
        reason = "mirrors the offer fields one to one"
    )]
    pub fn offer(
        &mut self,
        pack: AccountId,
        token_ids: Vec<String>,
        terms: Terms,
        pay_token: String,
        price: U128,
        offer_expires_at_ns: u64,
    ) {
        let request = OfferRequest {
            token_ids,
            terms,
            pay_token,
            price,
            offer_expires_at_ns,
        };
        let chain = self
            .try_offer(&pack, &request)
            .unwrap_or_else(|e| e.panic());
        env::promise_return(chain);
    }

    #[private]
    pub fn on_offer_balances(
        &mut self,
        pack: AccountId,
        maker_id: AccountId,
        request: OfferRequest,
    ) -> bool {
        let Some(position) = self.positions.get(&pack).cloned() else {
            return false;
        };
        self.nft.clear_pending(&position.title_id);
        match self.decide_offer(&pack, &maker_id, position, request) {
            Ok(()) => true,
            Err(error) => {
                emit_refused(&pack, &maker_id, error);
                false
            }
        }
    }

    /// Closes the open offer. Never blocked by a pause.
    ///
    /// # Errors
    /// `E_NOT_PACK`, `E_HOLDER`, `E_PENDING` or `E_STATE`.
    #[handle_result(aliased)]
    pub fn cancel(&mut self, pack: AccountId) -> MosaecResult<()> {
        let position = self.position(&pack)?;
        self.require_title_holder(&position)?;
        ensure(position.offer().is_some(), MosaecError::State)?;
        self.positions
            .insert(pack.clone(), position.cancel_offer()?);
        MosaecEvent::OfferCancelled {
            pack,
            reason: CancelReason::Cancelled,
        }
        .emit();
        Ok(())
    }

    // -----------------------------------------------------------------------------------------
    // Fill: check, read, decide, deliver
    // -----------------------------------------------------------------------------------------

    /// NEP-245 receiver. Accepts only a fill paying exactly the offer's price; every other
    /// transfer is refunded in full.
    pub fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) {
        let _ = previous_owner_ids;
        if env::predecessor_account_id() != self.verifier {
            MosaecError::NotVerifier.panic();
        }
        match self.route_fill(&sender_id, &token_ids, &amounts, &msg) {
            Ok(chain) => env::promise_return(chain),
            Err((pack, error)) => {
                emit_refused(&pack, &sender_id, error);
                env::value_return(json!(amounts).to_string());
            }
        }
    }

    /// The fill's value-returning receipt. Returns `[0]` to keep the price or `[price]` to refund.
    /// It writes the decision and schedules the deliveries; it moves no value itself.
    #[private]
    pub fn on_fill_checked(
        &mut self,
        pack: AccountId,
        taker_id: AccountId,
        price: U128,
    ) -> Vec<U128> {
        let reads = FillReads {
            public_keys: read_json::<HashSet<String>>(0),
            auth_by_predecessor: read_json(1),
            locked: read_json(2),
            balances: read_json(3),
        };
        match self.decide_fill(&pack, &taker_id, &reads) {
            Ok(()) => vec![U128(0)],
            Err(error) => {
                emit_refused(&pack, &taker_id, error);
                vec![price]
            }
        }
    }

    /// Retries delivery of a maker's principal. Anyone may call it.
    ///
    /// # Errors
    /// `E_GAS`, `E_NOT_PACK`, `E_STATE` without a payout owed, `E_PENDING` while one is in flight.
    #[handle_result(aliased)]
    pub fn claim_payout(&mut self, pack: AccountId) -> MosaecResult<()> {
        require_gas(COMMAND_GAS)?;
        let mut position = self.position(&pack)?;
        let payout = position.payout.as_mut().ok_or(MosaecError::State)?;
        ensure(!payout.in_flight, MosaecError::Pending)?;
        payout.in_flight = true;
        let send = calls::verifier_transfer(
            &self.verifier,
            &payout.maker_id,
            &payout.token_id,
            payout.amount,
        );
        self.positions.insert(pack.clone(), position);
        let _ = then_self(
            send,
            "on_paid",
            &json!({ "pack": pack }).to_string(),
            GAS_DELIVERY_CALLBACK,
        );
        Ok(())
    }

    #[private]
    pub fn on_paid(&mut self, pack: AccountId) {
        let Some(mut position) = self.positions.get(&pack).cloned() else {
            return;
        };
        let delivered = succeeded(0);
        if let Some(payout) = position.payout.as_mut() {
            payout.in_flight = false;
            if delivered {
                MosaecEvent::PayoutDelivered {
                    pack: pack.clone(),
                    maker_id: payout.maker_id.clone(),
                    amount: payout.amount,
                }
                .emit();
                position.payout = None;
            }
        }
        self.positions.insert(pack, position);
    }

    /// Pushes the registry's encumbrance to the pack again. Anyone may call it.
    ///
    /// # Errors
    /// `E_GAS`, `E_NOT_PACK`, or `E_STATE` unless a written pawn is still unsynced.
    #[handle_result(aliased)]
    pub fn sync_encumbrance(&mut self, pack: AccountId) -> MosaecResult<()> {
        require_gas(COMMAND_GAS)?;
        let position = self.position(&pack)?;
        let Stage::Written {
            encumbrance,
            ticket_id,
            synced: false,
        } = &position.stage
        else {
            return Err(MosaecError::State);
        };
        send_encumbrance(&pack, encumbrance, ticket_id);
        Ok(())
    }

    #[private]
    pub fn on_encumbered(&mut self, pack: AccountId, ticket_id: String) {
        if !succeeded(0) {
            return;
        }
        let Some(position) = self.positions.get(&pack).cloned() else {
            return;
        };
        if position.ticket_id() == Some(ticket_id.as_str()) {
            self.positions.insert(pack, position.mark_synced());
        }
    }

    // -----------------------------------------------------------------------------------------
    // Exercise hooks, called by packs
    // -----------------------------------------------------------------------------------------

    /// Marks the Ticket `Pending` for an exercise. Called only by the pack.
    ///
    /// # Errors
    /// `E_NOT_PACK`; `E_STATE` without a written pawn; `E_HOLDER` unless `sender_id` directly owns
    /// the Ticket; `E_PENDING` while it is already in a transfer or decision.
    #[handle_result(aliased)]
    pub fn begin_exercise(&mut self, pack: AccountId, sender_id: AccountId) -> MosaecResult<()> {
        let position = self.calling_pack(&pack)?;
        let ticket_id = position.ticket_id().ok_or(MosaecError::State)?;
        ensure(
            self.nft.is_owner(ticket_id, &sender_id),
            MosaecError::Holder,
        )?;
        ensure(self.nft.set_pending(ticket_id), MosaecError::Pending)
    }

    /// Burns the Ticket after a decided exercise (`ok`) or clears its `Pending` flag (`!ok`).
    /// Called only by the pack.
    ///
    /// # Errors
    /// `E_NOT_PACK`.
    #[handle_result(aliased)]
    pub fn end_exercise(&mut self, pack: AccountId, ok: bool) -> MosaecResult<()> {
        let position = self.calling_pack(&pack)?;
        if ok {
            self.close_pawn(&pack, position);
        } else if let Some(ticket_id) = position.ticket_id() {
            self.nft.clear_pending(ticket_id);
        }
        Ok(())
    }

    /// Settles an exercise whose `end_exercise` never arrived, from the pack's own state.
    /// Anyone may call it.
    ///
    /// # Errors
    /// `E_GAS`, `E_NOT_PACK`, or `E_STATE` unless the Ticket is `Pending`.
    #[handle_result(aliased)]
    pub fn finalize_exercise(&mut self, pack: AccountId) -> MosaecResult<()> {
        require_gas(COMMAND_GAS)?;
        let position = self.position(&pack)?;
        let ticket_id = position.ticket_id().ok_or(MosaecError::State)?;
        ensure(self.nft.is_pending(ticket_id), MosaecError::State)?;
        let status = calls::pack_status(&pack);
        let args = json!({ "pack": pack, "ticket_id": ticket_id });
        let _ = then_self(
            status,
            "on_finalize_status",
            &args.to_string(),
            GAS_DELIVERY_CALLBACK,
        );
        Ok(())
    }

    #[private]
    pub fn on_finalize_status(&mut self, pack: AccountId, ticket_id: String) {
        let Some(status) = read_json::<PackStatusView>(0) else {
            return;
        };
        let Some(position) = self.positions.get(&pack).cloned() else {
            return;
        };
        if position.ticket_id() != Some(ticket_id.as_str()) || status.exercise_in_flight {
            return;
        }
        match status.phase.state.as_str() {
            "releasing" | "free" => self.close_pawn(&pack, position),
            "written" => self.nft.clear_pending(&ticket_id),
            _ => {}
        }
    }

    // -----------------------------------------------------------------------------------------
    // Expire and withdraw
    // -----------------------------------------------------------------------------------------

    /// Ends an unexercised pawn after `T`. The pack checks the deadline itself, including any
    /// grace window, and the Ticket burns only once the pack has dropped its encumbrance.
    /// Anyone may call it; never blocked by a pause.
    ///
    /// # Errors
    /// `E_GAS`, `E_NOT_PACK`, `E_STATE` before `T`, `E_PENDING` during an exercise or command.
    #[handle_result(aliased)]
    pub fn expire(&mut self, pack: AccountId) -> MosaecResult<()> {
        require_gas(COMMAND_GAS)?;
        let mut position = self.position(&pack)?;
        position.check_expire(env::block_timestamp())?;
        let ticket_id = position.ticket_id().ok_or(MosaecError::State)?.to_owned();
        ensure(!self.nft.is_pending(&ticket_id), MosaecError::Pending)?;
        position.command_in_flight = true;
        self.positions.insert(pack.clone(), position);
        let drop = calls::pack_unencumber(&pack);
        let args = json!({ "pack": pack, "ticket_id": ticket_id });
        let _ = then_self(
            drop,
            "on_unencumbered",
            &args.to_string(),
            GAS_DELIVERY_CALLBACK,
        );
        Ok(())
    }

    #[private]
    pub fn on_unencumbered(&mut self, pack: AccountId, ticket_id: String) {
        let Some(mut position) = self.positions.get(&pack).cloned() else {
            return;
        };
        position.command_in_flight = false;
        if succeeded(0) && position.ticket_id() == Some(ticket_id.as_str()) {
            self.close_pawn(&pack, position);
            MosaecEvent::Expired { pack }.emit();
        } else {
            self.positions.insert(pack, position);
        }
    }

    /// Moves value out of a `Free` pack on the Title holder's command. Never blocked by a pause.
    /// Panics with `E_GAS`, `E_NOT_PACK`, `E_HOLDER`, `E_PENDING`, `E_STATE`, `E_AMOUNT`,
    /// `E_TOKEN` or `E_MIN_WITHDRAW`.
    pub fn withdraw(
        &mut self,
        pack: AccountId,
        token_id: String,
        amount: U128,
        destination: Destination,
    ) {
        let chain = self
            .try_withdraw(&pack, &token_id, amount, &destination)
            .unwrap_or_else(|e| e.panic());
        env::promise_return(chain);
    }

    #[private]
    pub fn on_withdrawn(
        &mut self,
        pack: AccountId,
        token_id: String,
        amount: U128,
        destination: Destination,
    ) -> bool {
        let Some(mut position) = self.positions.get(&pack).cloned() else {
            return false;
        };
        position.command_in_flight = false;
        self.nft.clear_pending(&position.title_id);
        self.positions.insert(pack.clone(), position);
        let delivered = succeeded(0);
        if delivered {
            MosaecEvent::Withdrawn {
                pack,
                token_id,
                amount,
                destination,
            }
            .emit();
        }
        delivered
    }

    // -----------------------------------------------------------------------------------------
    // Guardian
    // -----------------------------------------------------------------------------------------

    /// Stops `mint`, `offer` and `fill`. Nothing else.
    ///
    /// # Errors
    /// `E_NOT_GUARDIAN`.
    #[handle_result(aliased)]
    pub fn pause_new(&mut self) -> MosaecResult<()> {
        self.require_guardian()?;
        self.paused = true;
        MosaecEvent::Paused {
            guardian_id: self.guardian.clone(),
        }
        .emit();
        Ok(())
    }

    /// Resumes `mint`, `offer` and `fill`.
    ///
    /// # Errors
    /// `E_NOT_GUARDIAN`.
    #[handle_result(aliased)]
    pub fn unpause_new(&mut self) -> MosaecResult<()> {
        self.require_guardian()?;
        self.paused = false;
        MosaecEvent::Unpaused {
            guardian_id: self.guardian.clone(),
        }
        .emit();
        Ok(())
    }

    // -----------------------------------------------------------------------------------------
    // NEP-171 core
    // -----------------------------------------------------------------------------------------

    /// Panics with `E_AMOUNT` without exactly 1 yoctoNEAR, `E_MSG` with an approval id,
    /// `E_HOLDER` unless the caller owns the token, `E_PENDING` while it is `Pending`.
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.try_transfer(&receiver_id, &token_id, approval_id, memo.as_deref())
            .unwrap_or_else(|e| e.panic());
    }

    /// Moves the token, keeps it `Pending` until `nft_resolve_transfer` settles the owner, and
    /// returns whether the receiver kept it.
    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) {
        let chain = self
            .try_transfer_call(&receiver_id, &token_id, approval_id, memo.as_deref(), &msg)
            .unwrap_or_else(|e| e.panic());
        env::promise_return(chain);
    }

    #[private]
    pub fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        approved_account_ids: Option<Value>,
    ) -> bool {
        let _ = approved_account_ids;
        self.nft.clear_pending(&token_id);
        let returned = read_json::<bool>(0).unwrap_or(true);
        if !returned {
            return true;
        }
        if self.nft.is_owner(&token_id, &receiver_id) {
            self.move_token(&token_id, &previous_owner_id, None);
            return false;
        }
        true
    }

    #[must_use]
    pub fn nft_token(&self, token_id: String) -> Option<JsonToken> {
        self.nft
            .get(&token_id)
            .map(|record| json_token(&token_id, record))
    }

    // -----------------------------------------------------------------------------------------
    // NEP-177 and NEP-181
    // -----------------------------------------------------------------------------------------

    #[must_use]
    pub fn nft_metadata(&self) -> Value {
        let _ = self;
        json!({
            "spec": "nft-2.0.0",
            "name": "Mosaec",
            "symbol": "MOSAEC",
            "icon": null,
            "base_uri": null,
            "reference": null,
            "reference_hash": null,
        })
    }

    #[must_use]
    pub fn nft_total_supply(&self) -> U128 {
        U128(u128::from(self.nft.total_supply()))
    }

    #[must_use]
    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<JsonToken> {
        let (from, limit) = page_bounds(from_index, limit);
        self.nft
            .page(from, limit)
            .iter()
            .map(|(id, record)| json_token(id, record))
            .collect()
    }

    #[must_use]
    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(u128::from(self.nft.supply_for_owner(&account_id)))
    }

    #[must_use]
    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<JsonToken> {
        let (from, limit) = page_bounds(from_index, limit);
        self.nft
            .owner_page(&account_id, from, limit)
            .iter()
            .filter_map(|id| self.nft.get(id).map(|record| json_token(id, record)))
            .collect()
    }

    // -----------------------------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------------------------

    #[must_use]
    pub fn config(&self) -> Config {
        Config {
            guardian: self.guardian.clone(),
            pack_code_hash: self.pack_code_hash.into(),
            network: self.network,
            verifier: self.verifier.clone(),
            paused: self.paused,
            packs_created: self.next_index,
            mint_deposit: MINT_DEPOSIT,
        }
    }

    #[must_use]
    pub fn position_of(&self, pack: AccountId) -> Option<PositionView> {
        let position = self.positions.get(&pack)?.clone();
        let ticket = position.ticket_id().map(str::to_owned);
        Some(PositionView {
            title_owner: self.nft.get(&position.title_id).map(|t| t.owner_id.clone()),
            ticket_owner: ticket
                .as_deref()
                .and_then(|id| self.nft.get(id))
                .map(|t| t.owner_id.clone()),
            title_pending: self.nft.is_pending(&position.title_id),
            ticket_pending: ticket.as_deref().is_some_and(|id| self.nft.is_pending(id)),
            pack,
            position,
        })
    }
}

/// The inputs of an offer, carried through the balance read.
#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct OfferRequest {
    pub token_ids: Vec<String>,
    pub terms: Terms,
    pub pay_token: String,
    pub price: U128,
    pub offer_expires_at_ns: u64,
}

/// The part of `pack::status()` the registry reads.
#[near(serializers = [json])]
#[derive(Debug)]
struct PackStatusView {
    phase: PhaseTag,
    exercise_in_flight: bool,
}

#[near(serializers = [json])]
#[derive(Debug)]
struct PhaseTag {
    state: String,
}

impl Registry {
    fn position(&self, pack: &AccountId) -> MosaecResult<Position> {
        self.positions
            .get(pack)
            .cloned()
            .ok_or(MosaecError::NotPack)
    }

    /// The position of the pack calling now; refuses any other caller.
    fn calling_pack(&self, pack: &AccountId) -> MosaecResult<Position> {
        ensure(env::predecessor_account_id() == *pack, MosaecError::NotPack)?;
        self.position(pack)
    }

    fn require_guardian(&self) -> MosaecResult<()> {
        ensure(
            env::predecessor_account_id() == self.guardian,
            MosaecError::NotGuardian,
        )
    }

    fn require_title_holder(&self, position: &Position) -> MosaecResult<AccountId> {
        let caller = env::predecessor_account_id();
        ensure(
            self.nft.is_owner(&position.title_id, &caller),
            MosaecError::Holder,
        )?;
        ensure(
            !self.nft.is_pending(&position.title_id),
            MosaecError::Pending,
        )?;
        Ok(caller)
    }

    fn try_mint(&mut self) -> MosaecResult<PromiseIndex> {
        ensure(!self.paused, MosaecError::Paused)?;
        require_gas(MINT_GAS)?;
        let attached = env::attached_deposit();
        ensure(attached >= MINT_DEPOSIT, MosaecError::Storage)?;
        let owner_id = env::predecessor_account_id();
        let index = self.next_index;
        let pack: AccountId = format!("{index}.{}", env::current_account_id())
            .parse()
            .map_err(|_| MosaecError::State)?;
        ensure(pack.len() <= MAX_ACCOUNT_ID_LEN, MosaecError::State)?;
        self.next_index = index.saturating_add(1);
        calls::refund_near(&owner_id, attached.saturating_sub(MINT_DEPOSIT));
        let funding = PACK_STORAGE.saturating_add(PACK_OPS_RESERVE);
        let create = calls::create_pack(&pack, funding, &self.pack_code_hash, &self.verifier);
        let args = json!({ "pack": pack, "owner_id": owner_id, "index": index });
        Ok(then_self(
            create,
            "on_minted",
            &args.to_string(),
            GAS_DELIVERY_CALLBACK,
        ))
    }

    fn try_offer(
        &mut self,
        pack: &AccountId,
        request: &OfferRequest,
    ) -> MosaecResult<PromiseIndex> {
        ensure(!self.paused, MosaecError::Paused)?;
        require_gas(Gas::from_tgas(
            GAS_VERIFIER_VIEW.as_tgas() + GAS_DELIVERY_CALLBACK.as_tgas(),
        ))?;
        let position = self.position(pack)?;
        let maker_id = self.require_title_holder(&position)?;
        ensure(
            !request.token_ids.is_empty() && request.token_ids.len() <= BATCH_MAX_TOKENS,
            MosaecError::Batch,
        )?;
        position.check_new_offer(
            &request.terms,
            &request.pay_token,
            request.price,
            request.offer_expires_at_ns,
            env::block_timestamp(),
            self.network,
        )?;
        self.nft.set_pending(&position.title_id);
        let read = calls::balances(&self.verifier, pack, &request.token_ids);
        let args = json!({ "pack": pack, "maker_id": maker_id, "request": request });
        Ok(then_self(
            read,
            "on_offer_balances",
            &args.to_string(),
            GAS_DELIVERY_CALLBACK,
        ))
    }

    fn decide_offer(
        &mut self,
        pack: &AccountId,
        maker_id: &AccountId,
        position: Position,
        request: OfferRequest,
    ) -> MosaecResult<()> {
        ensure(!self.paused, MosaecError::Paused)?;
        ensure(
            self.nft.is_owner(&position.title_id, maker_id),
            MosaecError::Holder,
        )?;
        let balances: Vec<U128> = read_json(0).ok_or(MosaecError::Contents)?;
        let contents = Contents::from_balances(request.token_ids, &balances, self.network)?;
        let offer = Offer {
            maker_id: maker_id.clone(),
            terms: request.terms,
            pay_token: request.pay_token,
            price: request.price,
            open_until_ns: request.offer_expires_at_ns,
            contents_hash: contents.hash_hex(),
            contents,
        };
        let opened = position.open_offer(offer.clone())?;
        self.positions.insert(pack.clone(), opened);
        MosaecEvent::OfferCreated {
            pack: pack.clone(),
            maker_id: offer.maker_id,
            terms: offer.terms,
            pay_token: offer.pay_token,
            price: offer.price,
            offer_expires_at_ns: offer.open_until_ns,
            contents_hash: offer.contents_hash,
            contents: offer.contents,
        }
        .emit();
        Ok(())
    }

    fn route_fill(
        &mut self,
        taker_id: &AccountId,
        token_ids: &[String],
        amounts: &[U128],
        msg: &str,
    ) -> Result<PromiseIndex, (AccountId, MosaecError)> {
        let here = env::current_account_id();
        let parsed: TransferMsg =
            serde_json::from_str(msg).map_err(|_| (here.clone(), MosaecError::Msg))?;
        let TransferMsg::Fill(fill) = parsed else {
            return Err((here, MosaecError::State));
        };
        let pack = fill.pack.clone();
        self.check_fill(taker_id, token_ids, amounts, &fill)
            .map_err(|e| (pack.clone(), e))
    }

    fn check_fill(
        &mut self,
        taker_id: &AccountId,
        token_ids: &[String],
        amounts: &[U128],
        fill: &mosaec_shared::types::FillMsg,
    ) -> MosaecResult<PromiseIndex> {
        ensure(!self.paused, MosaecError::Paused)?;
        require_gas(FILL_GAS)?;
        let position = self.position(&fill.pack)?;
        ensure(
            !self.nft.is_pending(&position.title_id),
            MosaecError::Pending,
        )?;
        let ([token_id], [paid]) = (token_ids, amounts) else {
            return Err(MosaecError::Batch);
        };
        let offer = position.check_fill(taker_id, token_id, *paid, fill, env::block_timestamp())?;
        ensure(
            self.nft.is_owner(&position.title_id, &offer.maker_id),
            MosaecError::Holder,
        )?;
        self.nft.set_pending(&position.title_id);
        let reads = calls::fill_reads(&self.verifier, &fill.pack, &offer.contents.token_ids());
        let args = json!({ "pack": fill.pack, "taker_id": taker_id, "price": paid });
        Ok(mosaec_shared::promise::then(
            reads,
            env::current_account_id(),
            "on_fill_checked",
            &args.to_string(),
            mosaec_shared::promise::NO_DEPOSIT,
            FILL_DECIDE_GAS,
        ))
    }

    fn decide_fill(
        &mut self,
        pack: &AccountId,
        taker_id: &AccountId,
        reads: &FillReads,
    ) -> MosaecResult<()> {
        let position = self.position(pack)?;
        self.nft.clear_pending(&position.title_id);
        ensure(!self.paused, MosaecError::Paused)?;
        let filled = position.decide_fill(reads, env::block_timestamp())?;
        let title_id = filled.position.title_id.clone();
        ensure(
            self.nft.is_owner(&title_id, &filled.maker_id),
            MosaecError::Holder,
        )?;
        self.nft.mint(
            filled.ticket_id.clone(),
            TokenRecord {
                owner_id: filled.maker_id.clone(),
                kind: NftKind::Ticket,
                pack: pack.clone(),
            },
        );
        self.nft.transfer(&title_id, taker_id, None);
        let payout = filled.position.payout.clone();
        self.positions.insert(pack.clone(), filled.position);
        MosaecEvent::Filled {
            pack: pack.clone(),
            maker_id: filled.maker_id.clone(),
            taker_id: taker_id.clone(),
            ticket_id: filled.ticket_id.clone(),
            price: payout.as_ref().map_or(U128(0), |p| p.amount),
            expires_at_ns: filled.encumbrance.expires_at_ns,
        }
        .emit();
        if let Some(payout) = payout {
            let send = calls::verifier_transfer(
                &self.verifier,
                &payout.maker_id,
                &payout.token_id,
                payout.amount,
            );
            let _ = then_self(
                send,
                "on_paid",
                &json!({ "pack": pack }).to_string(),
                GAS_DELIVERY_CALLBACK,
            );
        }
        send_encumbrance(pack, &filled.encumbrance, &filled.ticket_id);
        Ok(())
    }

    /// Ends the pawn, burns its Ticket and stores the `Free` position. A position that is no
    /// longer written stays as it is, so late or repeated settlements are no-ops.
    fn close_pawn(&mut self, pack: &AccountId, position: Position) {
        if let Ok((free, ticket_id)) = position.close_pawn() {
            self.nft.burn(&ticket_id);
            self.positions.insert(pack.clone(), free);
        }
    }

    fn try_withdraw(
        &mut self,
        pack: &AccountId,
        token_id: &str,
        amount: U128,
        destination: &Destination,
    ) -> MosaecResult<PromiseIndex> {
        require_gas(COMMAND_GAS)?;
        let mut position = self.position(pack)?;
        self.require_title_holder(&position)?;
        position.check_withdraw()?;
        ensure(amount.0 > 0, MosaecError::Amount)?;
        if matches!(destination, Destination::HomeChain { .. }) {
            let rule = token_rule(self.network, token_id).ok_or(MosaecError::Token)?;
            let minimum = rule.min_home_withdraw.ok_or(MosaecError::MinWithdraw)?;
            ensure(amount.0 >= minimum, MosaecError::MinWithdraw)?;
        }
        self.nft.set_pending(&position.title_id);
        position.command_in_flight = true;
        self.positions.insert(pack.clone(), position);
        let send = calls::pack_withdraw(pack, token_id, amount, destination);
        let args = json!({
            "pack": pack,
            "token_id": token_id,
            "amount": amount,
            "destination": destination,
        });
        Ok(then_self(
            send,
            "on_withdrawn",
            &args.to_string(),
            GAS_DELIVERY_CALLBACK,
        ))
    }

    fn check_transfer(
        &self,
        receiver_id: &AccountId,
        token_id: &str,
        approval_id: Option<u64>,
    ) -> MosaecResult<AccountId> {
        ensure(
            env::attached_deposit() == NearToken::from_yoctonear(1),
            MosaecError::Amount,
        )?;
        ensure(approval_id.is_none(), MosaecError::Msg)?;
        let caller = env::predecessor_account_id();
        ensure(self.nft.is_owner(token_id, &caller), MosaecError::Holder)?;
        ensure(!self.nft.is_pending(token_id), MosaecError::Pending)?;
        ensure(*receiver_id != caller, MosaecError::Holder)?;
        Ok(caller)
    }

    fn try_transfer(
        &mut self,
        receiver_id: &AccountId,
        token_id: &str,
        approval_id: Option<u64>,
        memo: Option<&str>,
    ) -> MosaecResult<()> {
        self.check_transfer(receiver_id, token_id, approval_id)?;
        self.move_token(token_id, receiver_id, memo);
        Ok(())
    }

    fn try_transfer_call(
        &mut self,
        receiver_id: &AccountId,
        token_id: &str,
        approval_id: Option<u64>,
        memo: Option<&str>,
        msg: &str,
    ) -> MosaecResult<PromiseIndex> {
        require_gas(NFT_TRANSFER_CALL_GAS)?;
        let sender = self.check_transfer(receiver_id, token_id, approval_id)?;
        self.move_token(token_id, receiver_id, memo);
        self.nft.set_pending(token_id);
        let hook = calls::nft_on_transfer(receiver_id, &sender, &sender, token_id, msg);
        let args = json!({
            "previous_owner_id": sender,
            "receiver_id": receiver_id,
            "token_id": token_id,
        });
        Ok(then_self(
            hook,
            "nft_resolve_transfer",
            &args.to_string(),
            GAS_NFT_RESOLVE,
        ))
    }

    /// Moves a token between holders. A Title leaving its holder cancels the pack's open offer.
    fn move_token(&mut self, token_id: &str, receiver_id: &AccountId, memo: Option<&str>) {
        let Some(record) = self.nft.get(token_id).cloned() else {
            return;
        };
        self.nft.transfer(token_id, receiver_id, memo);
        if record.kind != NftKind::Title {
            return;
        }
        let Some(position) = self.positions.get(&record.pack).cloned() else {
            return;
        };
        if position.offer().is_some()
            && let Ok(free) = position.cancel_offer()
        {
            self.positions.insert(record.pack.clone(), free);
            MosaecEvent::OfferCancelled {
                pack: record.pack,
                reason: CancelReason::TitleMoved,
            }
            .emit();
        }
    }
}

fn send_encumbrance(
    pack: &AccountId,
    encumbrance: &mosaec_shared::types::Encumbrance,
    ticket_id: &str,
) {
    let push = calls::pack_encumber(pack, encumbrance);
    let args = json!({ "pack": pack, "ticket_id": ticket_id });
    let _ = then_self(
        push,
        "on_encumbered",
        &args.to_string(),
        GAS_DELIVERY_CALLBACK,
    );
}

/// A registry's network fixes its account suffix and, on mainnet, its verifier.
fn check_network(network: Network, verifier: &AccountId) -> MosaecResult<()> {
    let suffix = network.account_suffix();
    ensure(
        env::current_account_id().as_str().ends_with(suffix) && verifier.as_str().ends_with(suffix),
        MosaecError::NotVerifier,
    )?;
    match network.required_verifier() {
        Some(required) => ensure(verifier.as_str() == required, MosaecError::NotVerifier),
        None => Ok(()),
    }
}

fn require_gas(required: Gas) -> MosaecResult<()> {
    let left = env::prepaid_gas().saturating_sub(env::used_gas());
    ensure(left >= required, MosaecError::Gas)
}

fn page_bounds(from_index: Option<U128>, limit: Option<u64>) -> (usize, usize) {
    let from = from_index.map_or(0, |i| usize::try_from(i.0).unwrap_or(usize::MAX));
    let limit = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE);
    (from, usize::try_from(limit).unwrap_or(0))
}

fn json_token(token_id: &str, record: &TokenRecord) -> JsonToken {
    JsonToken {
        token_id: token_id.to_owned(),
        owner_id: record.owner_id.clone(),
        metadata: token_metadata(token_id, record),
    }
}

fn emit_refused(pack: &AccountId, sender_id: &AccountId, error: MosaecError) {
    MosaecEvent::Refused {
        pack: pack.clone(),
        sender_id: sender_id.clone(),
        code: error.code().to_owned(),
    }
    .emit();
}

#[cfg(test)]
mod tests;
