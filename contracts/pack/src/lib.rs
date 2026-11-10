//! Keyless account contract that holds a position's assets inside NEAR Intents.

use near_sdk::near;

#[near(contract_state)]
#[derive(Debug, Default)]
pub struct Pack {}

#[near]
impl Pack {}
