use std::{sync::Arc, time::Instant};

use crate::config::Config;
use crate::models::CampaignStore;

#[derive(Clone)]
pub struct AppState {
    pub start_time: Instant,
    pub config: Arc<Config>,
    pub campaign_store: CampaignStore,
}

impl AppState {
    pub fn new(config: Arc<Config>) -> Self {
        AppState {
            start_time: Instant::now(),
            config,
            campaign_store: CampaignStore::new(),
        }
    }
}
