//! Proof generation routes for ZK claims

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::{
    common::{
        merkle::{compute_nullifier, generate_secret, MerkleTree},
        response::{ApiErrorResponse, ApiResponse, ApiSuccessResponse},
    },
    state::AppState,
};

/// Request body for generating a proof
#[derive(Debug, Deserialize)]
pub struct GenerateProofRequest {
    pub wallet: String,
}

/// Response containing proof data for ZK claim
#[derive(Debug, Serialize)]
pub struct ProofResponse {
    /// Merkle root (32 bytes hex)
    pub merkle_root: String,
    /// Nullifier hash (32 bytes hex)
    pub nullifier_hash: String,
    /// Leaf index in tree
    pub leaf_index: usize,
    /// Merkle proof path (array of 32-byte hashes)
    pub merkle_path: Vec<String>,
    /// Claim amount in SOL
    pub amount: f64,
    /// Secret for this claim (should be stored securely by user)
    pub secret: String,
}

/// Build proof routes
pub fn proof_routes() -> Router<AppState> {
    Router::new()
        .route("/{address}/generate", post(generate_proof))
}

/// POST /api/v1/proofs/:address/generate - Generate ZK proof for claim
async fn generate_proof(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Json(body): Json<GenerateProofRequest>,
) -> ApiResponse<ProofResponse> {
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

    // Generate secret for this claim (in real app, this would be stored per-user)
    let secret = generate_secret();

    // Build merkle tree with secrets
    let recipients_with_secrets: Vec<(String, f64, [u8; 32])> = campaign
        .recipients
        .iter()
        .map(|r| {
            // For demo: use deterministic secret based on wallet
            // In production: secrets would be stored per-recipient
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
                .with_message("Failed to generate proof"))
        }
    };

    // Compute nullifier
    let nullifier = compute_nullifier(&secret, proof.leaf_index);

    // Convert to hex strings
    let merkle_root_hex = hex::encode(tree.root());
    let nullifier_hex = hex::encode(nullifier);
    let secret_hex = hex::encode(secret);
    let merkle_path: Vec<String> = proof.siblings.iter().map(|s| hex::encode(s)).collect();

    Ok(ApiSuccessResponse::default()
        .with_data(ProofResponse {
            merkle_root: merkle_root_hex,
            nullifier_hash: nullifier_hex,
            leaf_index: proof.leaf_index,
            merkle_path,
            amount: recipient.amount,
            secret: secret_hex,
        })
        .with_message("Proof generated successfully"))
}
