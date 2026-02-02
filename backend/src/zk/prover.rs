//! Sunspot Prover - Generates Groth16 proofs for Noir circuits

use std::path::PathBuf;
use std::process::Command;
use tokio::fs;

use super::types::{ZkProofInput, ZkProofOutput, GROTH16_PROOF_SIZE, PUBLIC_INPUTS_SIZE};

/// Sunspot Prover configuration
#[derive(Debug, Clone)]
pub struct SunspotProver {
    /// Path to circuits directory
    circuits_dir: PathBuf,
    /// Path to sunspot binary
    sunspot_bin: PathBuf,
}

impl SunspotProver {
    /// Create a new SunspotProver
    pub fn new(circuits_dir: PathBuf) -> Self {
        // Default sunspot binary location
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        let sunspot_bin = PathBuf::from(format!("{}/sunspot/go/sunspot", home));

        Self {
            circuits_dir,
            sunspot_bin,
        }
    }

    /// Set custom sunspot binary path
    pub fn with_sunspot_bin(mut self, path: PathBuf) -> Self {
        self.sunspot_bin = path;
        self
    }

    /// Generate a Groth16 proof for the given inputs
    pub async fn generate_proof(&self, input: ZkProofInput) -> Result<ZkProofOutput, ProverError> {
        // Step 1: Write Prover.toml
        let prover_toml_path = self.circuits_dir.join("Prover.toml");
        let prover_content = input.to_prover_toml();
        fs::write(&prover_toml_path, &prover_content)
            .await
            .map_err(|e| ProverError::IoError(format!("Failed to write Prover.toml: {}", e)))?;

        tracing::info!("Wrote Prover.toml to {:?}", prover_toml_path);

        // Step 2: Run nargo execute to generate witness
        let witness_name = "shadow_drop_witness";
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        let nargo_bin = format!("{}/.nargo/bin/nargo", home);
        
        let nargo_result = Command::new(&nargo_bin)
            .current_dir(&self.circuits_dir)
            .args(["execute", witness_name])
            .output()
            .map_err(|e| ProverError::CommandError(format!("Failed to run nargo: {}", e)))?;

        if !nargo_result.status.success() {
            let stderr = String::from_utf8_lossy(&nargo_result.stderr);
            let stdout = String::from_utf8_lossy(&nargo_result.stdout);
            return Err(ProverError::NargoError(format!(
                "nargo execute failed: stderr={}, stdout={}",
                stderr, stdout
            )));
        }

        tracing::info!("Generated witness successfully");

        // Step 3: Run sunspot prove
        // Usage: sunspot prove [acir_file] [witness_file] [ccs_file] [pk_file]
        let acir_path = self.circuits_dir.join("target/shadow_drop.json");
        let witness_path = self.circuits_dir.join(format!("target/{}.gz", witness_name));
        let ccs_path = self.circuits_dir.join("target/shadow_drop.ccs");
        let pk_path = self.circuits_dir.join("target/shadow_drop.pk");
        // Sunspot outputs proof to target/shadow_drop.proof and public witness to target/shadow_drop.pw
        let proof_path = self.circuits_dir.join("target/shadow_drop.proof");

        let sunspot_result = Command::new(&self.sunspot_bin)
            .args([
                "prove",
                acir_path.to_str().unwrap(),
                witness_path.to_str().unwrap(),
                ccs_path.to_str().unwrap(),
                pk_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| ProverError::CommandError(format!("Failed to run sunspot: {}", e)))?;

        if !sunspot_result.status.success() {
            let stderr = String::from_utf8_lossy(&sunspot_result.stderr);
            return Err(ProverError::SunspotError(format!(
                "sunspot prove failed: {}",
                stderr
            )));
        }

        tracing::info!("Generated Groth16 proof successfully");

        // Step 4: Read proof file (first 256 bytes = Groth16 proof)
        let proof_bytes = fs::read(&proof_path)
            .await
            .map_err(|e| ProverError::IoError(format!("Failed to read proof: {}", e)))?;

        if proof_bytes.len() < GROTH16_PROOF_SIZE {
            return Err(ProverError::InvalidProof(format!(
                "Proof too short: {} bytes, expected {}",
                proof_bytes.len(),
                GROTH16_PROOF_SIZE
            )));
        }

        // Step 5: Read public witness from .pw file (FULL file, including 12-byte header)
        // The gnark-solana verifier expects: proof || full_pw_file
        // It calculates: proof_len = total - (12 + NR_INPUTS * 32)
        // For 3 inputs: proof_len = total - 108, so we need to send full .pw file
        let pw_path = self.circuits_dir.join("target/shadow_drop.pw");
        let pw_bytes = fs::read(&pw_path)
            .await
            .map_err(|e| ProverError::IoError(format!("Failed to read public witness: {}", e)))?;

        // Expect: 12-byte header + 96 bytes public inputs = 108 bytes total
        let expected_pw_size = 12 + PUBLIC_INPUTS_SIZE;
        if pw_bytes.len() < expected_pw_size {
            return Err(ProverError::InvalidProof(format!(
                "Public witness too short: {} bytes, expected at least {}",
                pw_bytes.len(),
                expected_pw_size
            )));
        }

        // Send the FULL .pw file content (108 bytes) for on-chain verification
        tracing::info!("Read {} bytes of public witness from .pw file", pw_bytes.len());

        Ok(ZkProofOutput {
            // Send FULL proof file (388 bytes used by Gnark verifier with 1 commitment)
            proof: hex::encode(&proof_bytes),
            // Send FULL .pw file (108 bytes), not just 96 bytes
            public_inputs: hex::encode(&pw_bytes[..expected_pw_size]),
            merkle_root: input.merkle_root,
            nullifier_hash: input.nullifier_hash,
        })


    }

    /// Check if the prover is properly configured
    pub async fn health_check(&self) -> Result<(), ProverError> {
        // Check circuits directory exists
        if !self.circuits_dir.exists() {
            return Err(ProverError::ConfigError(format!(
                "Circuits directory not found: {:?}",
                self.circuits_dir
            )));
        }

        // Check sunspot binary exists
        if !self.sunspot_bin.exists() {
            return Err(ProverError::ConfigError(format!(
                "Sunspot binary not found: {:?}",
                self.sunspot_bin
            )));
        }

        // Check proving keys exist
        let pk_path = self.circuits_dir.join("sunspot-out/keys/pk.bin");
        if !pk_path.exists() {
            return Err(ProverError::ConfigError(
                "Proving keys not found. Run 'just sunspot-setup' first.".to_string(),
            ));
        }

        Ok(())
    }
}

/// Convert hex string to bytes
#[allow(dead_code)]
fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, ProverError> {
    let clean_hex = hex.strip_prefix("0x").unwrap_or(hex);
    hex::decode(clean_hex).map_err(|e| ProverError::InvalidInput(format!("Invalid hex: {}", e)))
}

/// Prover errors
#[derive(Debug, thiserror::Error)]
pub enum ProverError {
    #[error("IO error: {0}")]
    IoError(String),

    #[error("Command execution error: {0}")]
    CommandError(String),

    #[error("Nargo error: {0}")]
    NargoError(String),

    #[error("Sunspot error: {0}")]
    SunspotError(String),

    #[error("Invalid proof: {0}")]
    InvalidProof(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),
}
