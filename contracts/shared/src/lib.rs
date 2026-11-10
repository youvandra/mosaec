//! Types, errors, events and constants shared by the Mosaec pack and registry contracts.
//!
//! Everything here is free of storage. The contracts own their state and call into these modules
//! for every rule both of them must agree on and for the function-call promises they build.

pub mod constants;
pub mod contents;
pub mod error;
pub mod events;
pub mod promise;
pub mod terms;
pub mod types;

pub use error::{MosaecError, MosaecResult};
