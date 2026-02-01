use std::{sync::Arc, time::Instant};

use crate::config::Config;
use crate::models::CampaignStore;

use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub start_time: Instant,
    pub config: Arc<Config>,
    pub campaign_store: CampaignStore,
}

impl AppState {
    pub fn new(config: Arc<Config>, db: PgPool) -> Self {
        AppState {
            start_time: Instant::now(),
            config,
            campaign_store: CampaignStore::new(db),
        }
    }
}
