//! ZK Proof Generation Module
//!
//! Handles Noir circuit compilation and Sunspot proof generation

pub mod prover;
pub mod types;

pub use prover::SunspotProver;
pub use types::*;
