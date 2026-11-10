//! Types, errors, events and constants shared by the Mosaec pack and registry contracts.
//!
//! Everything here is pure: no storage, no promises. The contracts own their side effects and call
//! into these modules for every rule that both of them must agree on.

pub mod constants;
pub mod contents;
pub mod error;
pub mod events;
pub mod terms;
pub mod types;

pub use error::{MosaecError, MosaecResult};
