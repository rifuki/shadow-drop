//! ZK Proof Generation Routes (Sunspot)

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::{
    common::{
        merkle::{compute_nullifier, generate_secret, MerkleTree},
        response::{ApiErrorResponse, ApiResponse, ApiSuccessResponse},
    },
    state::AppState,
    zk::{SunspotProver, ZkProofInput},
};

/// Request for ZK proof generation
#[derive(Debug, Deserialize)]
pub struct GenerateZkProofRequest {
    pub wallet: String,
}

/// Response with ZK proof data
#[derive(Debug, Serialize)]
pub struct ZkProofResponse {
    /// Groth16 proof (hex encoded, 256 bytes)
    pub groth16_proof: String,
    /// Public inputs (hex encoded, 96 bytes)
    pub public_inputs: String,
    /// Nullifier hash for Light Protocol (hex)
    pub nullifier_hash: String,
    /// Nullifier bytes for contract (32 bytes, hex)
    pub nullifier: String,
    /// Claim amount in lamports
    pub amount: u64,
    /// Secret used (for reference)
    pub secret: String,
    /// Merkle root (for verification)
    pub merkle_root: String,
    /// Leaf index
    pub leaf_index: usize,
}

/// Build ZK proof routes
pub fn zk_proof_routes() -> Router<AppState> {
    Router::new().route("/{address}/generate", post(generate_zk_proof))
}

/// POST /api/v1/zk-proofs/:address/generate - Generate Sunspot ZK proof for claim
async fn generate_zk_proof(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Json(body): Json<GenerateZkProofRequest>,
) -> ApiResponse<ZkProofResponse> {
    // Get campaign
    let campaign = match state.campaign_store.get(&address).await {
        Some(c) => c,
        None => {
            return Err(ApiErrorResponse::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Campaign not found"))
        }
    };

    // Find recipient
    let recipient = match campaign.recipients.iter().find(|r| r.wallet == body.wallet) {
        Some(r) => r,
        None => {
            return Err(ApiErrorResponse::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Wallet not found in campaign recipients"))
        }
    };

    // Check if already claimed
    if recipient.claimed {
        return Err(ApiErrorResponse::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Already claimed"));
    }

    // Generate secret for this claim
    let secret = generate_secret();

    // Build merkle tree with secrets
    let recipients_with_secrets: Vec<(String, f64, [u8; 32])> = campaign
        .recipients
        .iter()
        .map(|r| {
            let mut recipient_secret = [0u8; 32];
            if r.wallet == body.wallet {
                recipient_secret = secret;
            } else {
                // Use wallet hash as placeholder secret for other recipients
                let wallet_bytes = r.wallet.as_bytes();
                for (i, b) in wallet_bytes.iter().enumerate() {
                    recipient_secret[i % 32] ^= *b;
                }
            }
            (r.wallet.clone(), r.amount, recipient_secret)
        })
        .collect();

    let tree = MerkleTree::from_recipients(&recipients_with_secrets);

    // Get proof for wallet
    let proof = match tree.get_proof(&body.wallet) {
        Some(p) => p,
        None => {
            return Err(ApiErrorResponse::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to generate merkle proof"))
        }
    };

    // Compute nullifier
    let nullifier = compute_nullifier(&secret, proof.leaf_index);

    // Convert wallet to field element (use first 31 bytes of pubkey)
    let wallet_field = wallet_to_field(&body.wallet);

    // Prepare ZK proof input
    let zk_input = ZkProofInput {
        merkle_root: format!("0x{}", hex::encode(tree.root())),
        nullifier_hash: format!("0x{}", hex::encode(nullifier)),
        recipient: format!("0x{}", wallet_field),
        amount: ((recipient.amount * 1_000_000_000.0) as u64).to_string(), // Convert to lamports
        secret: format!("0x{}", hex::encode(secret)),
        leaf_index: proof.leaf_index as u64,
        merkle_path: proof
            .siblings
            .iter()
            .map(|s| format!("0x{}", hex::encode(s)))
            .collect(),
    };

    // Initialize Sunspot prover
    let circuits_dir = PathBuf::from(
        std::env::var("CIRCUITS_DIR")
            .unwrap_or_else(|_| "../circuits".to_string()),
    );
    let prover = SunspotProver::new(circuits_dir);

    // Check prover health
    if let Err(e) = prover.health_check().await {
        tracing::warn!("Sunspot prover not configured: {}", e);

        // Return mock proof for development (when Sunspot not available)
        return Ok(ApiSuccessResponse::default()
            .with_data(ZkProofResponse {
                groth16_proof: "0x".to_string() + &"00".repeat(256),
                public_inputs: format!(
                    "{}{}{}",
                    hex::encode(tree.root()),
                    hex::encode(nullifier),
                    wallet_field
                ),
                nullifier_hash: hex::encode(nullifier),
                nullifier: hex::encode(nullifier),
                amount: (recipient.amount * 1_000_000_000.0) as u64,
                secret: hex::encode(secret),
                merkle_root: hex::encode(tree.root()),
                leaf_index: proof.leaf_index,
            })
            .with_message("Mock proof generated (Sunspot not configured)"));
    }

    // Generate real proof
    match prover.generate_proof(zk_input).await {
        Ok(zk_output) => {
            Ok(ApiSuccessResponse::default()
                .with_data(ZkProofResponse {
                    groth16_proof: zk_output.proof,
                    public_inputs: zk_output.public_inputs,
                    nullifier_hash: hex::encode(nullifier),
                    nullifier: hex::encode(nullifier),
                    amount: (recipient.amount * 1_000_000_000.0) as u64,
                    secret: hex::encode(secret),
                    merkle_root: hex::encode(tree.root()),
                    leaf_index: proof.leaf_index,
                })
                .with_message("ZK proof generated successfully"))
        }
        Err(e) => {
            tracing::error!("Failed to generate ZK proof: {}", e);
            Err(ApiErrorResponse::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message(&format!("Failed to generate ZK proof: {}", e)))
        }
    }
}

/// Convert wallet address to field element (hex string)
fn wallet_to_field(wallet: &str) -> String {
    // Decode base58 pubkey and take first 31 bytes (to fit in field)
    let decoded: Result<Vec<u8>, _> = bs58::decode(wallet).into_vec();
    match decoded {
        Ok(bytes) => {
            let mut field_bytes = [0u8; 32];
            let len = bytes.len().min(31);
            field_bytes[32 - len..].copy_from_slice(&bytes[..len]);
            hex::encode(field_bytes)
        }
        Err(_) => {
            // Fallback: hash the wallet string
            let mut hash = [0u8; 32];
            for (i, b) in wallet.as_bytes().iter().enumerate() {
                hash[i % 32] ^= *b;
            }
            hex::encode(hash)
        }
    }
}
