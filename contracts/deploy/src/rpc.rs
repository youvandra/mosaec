//! The few RPC reads and the one write the deploy needs.

use anyhow::{Context, Result, bail};
use near_crypto::{PublicKey, Signer};
use near_jsonrpc_client::{JsonRpcClient, methods};
use near_jsonrpc_primitives::types::query::QueryResponseKind;
use near_primitives::action::Action;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Transaction, TransactionV0};
use near_primitives::types::{AccountId, BlockReference, Finality};
use near_primitives::views::{
    AccessKeyPermissionView, FinalExecutionStatus, QueryRequest, TxExecutionStatus,
};

/// What the chain holds for one account.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountState {
    pub code_hash: CryptoHash,
    pub storage_usage: u64,
}

/// The outcome of one sent transaction.
#[derive(Debug, Clone)]
pub struct Sent {
    pub tx_hash: CryptoHash,
}

pub struct Rpc {
    client: JsonRpcClient,
}

impl std::fmt::Debug for Rpc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Rpc")
    }
}

impl Rpc {
    #[must_use]
    pub fn connect(url: &str) -> Self {
        Self {
            client: JsonRpcClient::connect(url),
        }
    }

    /// # Errors
    /// When the node is unreachable.
    pub async fn chain_id(&self) -> Result<String> {
        let status = self.client.call(methods::status::RpcStatusRequest).await?;
        Ok(status.chain_id)
    }

    async fn query(
        &self,
        request: QueryRequest,
    ) -> Result<Option<(QueryResponseKind, CryptoHash)>> {
        let res = self
            .client
            .call(methods::query::RpcQueryRequest {
                block_reference: BlockReference::Finality(Finality::Final),
                request,
            })
            .await;
        match res {
            Ok(r) => Ok(Some((r.kind, r.block_hash))),
            Err(e) if is_missing(&e.to_string()) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// The account, or `None` when it does not exist.
    ///
    /// # Errors
    /// On RPC failure.
    pub async fn account(&self, account_id: &AccountId) -> Result<Option<AccountState>> {
        let request = QueryRequest::ViewAccount {
            account_id: account_id.clone(),
        };
        Ok(match self.query(request).await? {
            Some((QueryResponseKind::ViewAccount(a), _)) => Some(AccountState {
                code_hash: a.code_hash,
                storage_usage: a.storage_usage,
            }),
            _ => None,
        })
    }

    /// True when `public_key` is a full-access key of `account_id`.
    ///
    /// # Errors
    /// On RPC failure.
    pub async fn has_full_access(
        &self,
        account_id: &AccountId,
        public_key: &PublicKey,
    ) -> Result<bool> {
        let request = QueryRequest::ViewAccessKey {
            account_id: account_id.clone(),
            public_key: public_key.clone(),
        };
        Ok(matches!(
            self.query(request).await?,
            Some((QueryResponseKind::AccessKey(k), _)) if matches!(k.permission, AccessKeyPermissionView::FullAccess)
        ))
    }

    /// True when a global contract is published under `code_hash`.
    ///
    /// # Errors
    /// On RPC failure.
    pub async fn global_code_exists(&self, code_hash: CryptoHash) -> Result<bool> {
        let request = QueryRequest::ViewGlobalContractCode { code_hash };
        Ok(self.query(request).await?.is_some())
    }

    /// Calls a view method and parses its JSON result.
    ///
    /// # Errors
    /// On RPC failure or a non-JSON result.
    pub async fn view(
        &self,
        account_id: &AccountId,
        method: &str,
        args: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        let request = QueryRequest::CallFunction {
            account_id: account_id.clone(),
            method_name: method.to_owned(),
            args: args.to_string().into_bytes().into(),
        };
        match self.query(request).await? {
            Some((QueryResponseKind::CallResult(r), _)) => Ok(serde_json::from_slice(&r.result)?),
            _ => bail!("view {account_id}.{method} returned nothing"),
        }
    }

    /// Signs `actions` from `signer` to `receiver`, sends them and waits for finality.
    ///
    /// # Errors
    /// When the transaction or any receipt fails.
    pub async fn send(
        &self,
        signer: &Signer,
        receiver: &AccountId,
        actions: Vec<Action>,
    ) -> Result<Sent> {
        let public_key = signer.public_key();
        let request = QueryRequest::ViewAccessKey {
            account_id: signer.get_account_id(),
            public_key: public_key.clone(),
        };
        let Some((QueryResponseKind::AccessKey(key), block_hash)) = self.query(request).await?
        else {
            bail!("{} has no access key {public_key}", signer.get_account_id());
        };
        let tx = Transaction::V0(TransactionV0 {
            signer_id: signer.get_account_id(),
            public_key,
            nonce: key.nonce + 1,
            receiver_id: receiver.clone(),
            block_hash,
            actions,
        });
        let signed_tx = tx.sign(signer);
        let tx_hash = signed_tx.get_hash();
        let outcome = self
            .client
            .call(methods::send_tx::RpcSendTransactionRequest {
                signed_transaction: signed_tx,
                wait_until: TxExecutionStatus::Final,
            })
            .await?
            .final_execution_outcome
            .context("node returned no outcome")?
            .into_outcome();
        let failures: Vec<String> = outcome
            .receipts_outcome
            .iter()
            .filter_map(|r| match &r.outcome.status {
                near_primitives::views::ExecutionStatusView::Failure(e) => Some(format!("{e:?}")),
                _ => None,
            })
            .collect();
        if !matches!(outcome.status, FinalExecutionStatus::SuccessValue(_)) || !failures.is_empty()
        {
            bail!("tx {tx_hash} failed: {:?} {failures:?}", outcome.status);
        }
        Ok(Sent { tx_hash })
    }
}

fn is_missing(message: &str) -> bool {
    [
        "UNKNOWN_ACCOUNT",
        "does not exist",
        "UNKNOWN_ACCESS_KEY",
        "NoGlobalContractCode",
        "has never been observed",
        "not found",
    ]
    .iter()
    .any(|m| message.contains(m))
}
