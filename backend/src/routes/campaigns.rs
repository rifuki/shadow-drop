use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use serde::Deserialize;

use crate::{
    common::response::{ApiErrorResponse, ApiResponse, ApiSuccessResponse},
    models::{Campaign, CampaignInfo, EligibilityResponse, EligibleCampaign, Recipient},
    state::AppState,
};

/// Request body for creating a campaign
#[derive(Debug, Deserialize)]
pub struct CreateCampaignRequest {
    pub address: String,
    pub name: String,
    pub merkle_root: String,
    pub total_amount: f64,
    pub creator_wallet: String,
    pub tx_signature: Option<String>,
    pub vault_address: Option<String>, // PDA vault address for claims
    pub recipients: Vec<RecipientInput>,
    // Vesting fields (optional, defaults to instant)
    #[serde(default)]
    pub airdrop_type: Option<String>,
    #[serde(default)]
    pub vesting_start: Option<i64>,
    #[serde(default)]
    pub vesting_cliff_seconds: Option<i64>,
    #[serde(default)]
    pub vesting_duration_seconds: Option<i64>,
    // Token fields (optional, None = SOL campaign)
    #[serde(default)]
    pub token_mint: Option<String>,
    #[serde(default)]
    pub token_symbol: Option<String>,
    #[serde(default)]
    pub token_decimals: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct RecipientInput {
    pub wallet: String,
    pub amount: f64,
}

/// Request body for checking eligibility
#[derive(Debug, Deserialize)]
pub struct CheckEligibilityRequest {
    pub wallet: String,
}

/// Request body for marking as claimed
#[derive(Debug, Deserialize)]
pub struct MarkClaimedRequest {
    pub wallet: String,
}

/// Build campaign routes
pub fn campaign_routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_campaign))
        .route("/eligible/{wallet}", get(get_eligible_campaigns))
        .route("/{address}", get(get_campaign))
        .route("/{address}/check", post(check_eligibility))
        .route("/{address}/claim", post(mark_claimed))
        .route("/wallet/{wallet}", get(get_campaigns_by_wallet))
}

/// POST /api/v1/campaigns - Create a new campaign
async fn create_campaign(
    State(state): State<AppState>,
    Json(body): Json<CreateCampaignRequest>,
) -> ApiResponse<CampaignInfo> {
    let now = Utc::now().timestamp();
    let campaign = Campaign {
        id: uuid_simple(),
        address: body.address,
        name: body.name,
        merkle_root: body.merkle_root,
        total_amount: body.total_amount,
        creator_wallet: body.creator_wallet,
        tx_signature: body.tx_signature,
        vault_address: body.vault_address, // Store vault PDA address
        created_at: Utc::now(),
        recipients: body
            .recipients
            .into_iter()
            .map(|r| Recipient {
                wallet: r.wallet,
                amount: r.amount,
                claimed: false,
                claimed_at: None,
                id: None,
            })
            .collect(),
        // Vesting fields with defaults
        airdrop_type: body.airdrop_type.unwrap_or_else(|| "instant".to_string()),
        vesting_start: body.vesting_start.unwrap_or(now),
        vesting_cliff_seconds: body.vesting_cliff_seconds.unwrap_or(0),
        vesting_duration_seconds: body.vesting_duration_seconds.unwrap_or(0),
        // Token fields
        token_mint: body.token_mint,
        token_symbol: body.token_symbol,
        token_decimals: body.token_decimals,
    };

    let created = state.campaign_store.create(campaign).await;
    let info = CampaignInfo::from(&created);

    Ok(ApiSuccessResponse::default()
        .with_code(StatusCode::CREATED)
        .with_data(info)
        .with_message("Campaign created successfully"))
}

/// GET /api/v1/campaigns/:address - Get campaign info
async fn get_campaign(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> ApiResponse<CampaignInfo> {
    match state.campaign_store.get(&address).await {
        Some(campaign) => Ok(ApiSuccessResponse::default()
            .with_data(CampaignInfo::from(&campaign))
            .with_message("Campaign found")),
        None => Err(ApiErrorResponse::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Campaign not found")),
    }
}

/// POST /api/v1/campaigns/:address/check - Check eligibility
async fn check_eligibility(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Json(body): Json<CheckEligibilityRequest>,
) -> ApiResponse<EligibilityResponse> {
    match state.campaign_store.check_eligibility(&address, &body.wallet).await {
        Some(eligibility) => Ok(ApiSuccessResponse::default()
            .with_data(eligibility)
            .with_message("Eligibility checked")),
        None => Err(ApiErrorResponse::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Campaign not found")),
    }
}

/// POST /api/v1/campaigns/:address/claim - Mark as claimed
async fn mark_claimed(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Json(body): Json<MarkClaimedRequest>,
) -> ApiResponse<()> {
    if state.campaign_store.mark_claimed(&address, &body.wallet).await {
        Ok(ApiSuccessResponse::default()
            .with_message("Claimed successfully"))
    } else {
        Err(ApiErrorResponse::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Claim failed - already claimed or not eligible"))
    }
}

/// GET /api/v1/campaigns/eligible/:wallet - Get campaigns where wallet is eligible
async fn get_eligible_campaigns(
    State(state): State<AppState>,
    Path(wallet): Path<String>,
) -> ApiResponse<Vec<EligibleCampaign>> {
    let campaigns = state.campaign_store.get_eligible_for_wallet(&wallet).await;

    Ok(ApiSuccessResponse::default()
        .with_data(campaigns)
        .with_message("Eligible campaigns retrieved"))
}

/// GET /api/v1/campaigns/wallet/:wallet - Get campaigns by creator wallet
async fn get_campaigns_by_wallet(
    State(state): State<AppState>,
    Path(wallet): Path<String>,
) -> ApiResponse<Vec<CampaignInfo>> {
    let campaigns = state.campaign_store.get_by_wallet(&wallet).await;
    let infos: Vec<CampaignInfo> = campaigns.iter().map(CampaignInfo::from).collect();

    Ok(ApiSuccessResponse::default()
        .with_data(infos)
        .with_message("Campaigns retrieved"))
}

/// Simple UUID generator (without external dependency)
fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", now)
}
