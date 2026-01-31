use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// A single recipient in a campaign
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipient {
    pub wallet: String,
    pub amount: f64,
    pub claimed: bool,
    pub claimed_at: Option<DateTime<Utc>>,
}

/// Campaign data stored in the backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Campaign {
    pub id: String,
    pub address: String,
    pub name: String,
    pub merkle_root: String,
    pub total_amount: f64,
    pub creator_wallet: String,
    pub tx_signature: Option<String>,
    pub vault_address: Option<String>, // PDA vault address for claims
    pub created_at: DateTime<Utc>,
    pub recipients: Vec<Recipient>,
}

/// Response for campaign info (without recipient list for privacy)
#[derive(Debug, Serialize)]
pub struct CampaignInfo {
    pub id: String,
    pub address: String,
    pub name: String,
    pub total_amount: f64,
    pub total_recipients: usize,
    pub claimed_count: usize,
    pub creator_wallet: String,
    pub vault_address: Option<String>, // PDA vault address for claims
    pub tx_signature: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<&Campaign> for CampaignInfo {
    fn from(campaign: &Campaign) -> Self {
        CampaignInfo {
            id: campaign.id.clone(),
            address: campaign.address.clone(),
            name: campaign.name.clone(),
            total_amount: campaign.total_amount,
            total_recipients: campaign.recipients.len(),
            claimed_count: campaign.recipients.iter().filter(|r| r.claimed).count(),
            creator_wallet: campaign.creator_wallet.clone(),
            vault_address: campaign.vault_address.clone(),
            tx_signature: campaign.tx_signature.clone(),
            created_at: campaign.created_at,
        }
    }
}

/// Eligibility check response
#[derive(Debug, Serialize)]
pub struct EligibilityResponse {
    pub eligible: bool,
    pub amount: Option<f64>,
    pub already_claimed: bool,
}

/// In-memory campaign store (can be replaced with database later)
#[derive(Debug, Clone, Default)]
pub struct CampaignStore {
    campaigns: Arc<RwLock<HashMap<String, Campaign>>>,
}

impl CampaignStore {
    pub fn new() -> Self {
        Self {
            campaigns: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new campaign
    pub async fn create(&self, campaign: Campaign) -> Campaign {
        let mut campaigns = self.campaigns.write().await;
        campaigns.insert(campaign.address.clone(), campaign.clone());
        campaign
    }

    /// Get a campaign by address
    pub async fn get(&self, address: &str) -> Option<Campaign> {
        let campaigns = self.campaigns.read().await;
        campaigns.get(address).cloned()
    }

    /// Get all campaigns for a wallet
    pub async fn get_by_wallet(&self, wallet: &str) -> Vec<Campaign> {
        let campaigns = self.campaigns.read().await;
        campaigns
            .values()
            .filter(|c| c.creator_wallet == wallet)
            .cloned()
            .collect()
    }

    /// Check eligibility for a wallet in a campaign
    pub async fn check_eligibility(&self, address: &str, wallet: &str) -> Option<EligibilityResponse> {
        let campaigns = self.campaigns.read().await;
        let campaign = campaigns.get(address)?;
        
        let recipient = campaign.recipients.iter().find(|r| r.wallet == wallet);
        
        Some(match recipient {
            Some(r) => EligibilityResponse {
                eligible: !r.claimed,
                amount: Some(r.amount),
                already_claimed: r.claimed,
            },
            None => EligibilityResponse {
                eligible: false,
                amount: None,
                already_claimed: false,
            },
        })
    }

    /// Mark a recipient as claimed
    pub async fn mark_claimed(&self, address: &str, wallet: &str) -> bool {
        let mut campaigns = self.campaigns.write().await;
        if let Some(campaign) = campaigns.get_mut(address) {
            if let Some(recipient) = campaign.recipients.iter_mut().find(|r| r.wallet == wallet) {
                if !recipient.claimed {
                    recipient.claimed = true;
                    recipient.claimed_at = Some(Utc::now());
                    return true;
                }
            }
        }
        false
    }
}
