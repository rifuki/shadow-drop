use std::{net::SocketAddr, sync::Arc};

use axum::{
    http::{HeaderValue, Method, header},
    middleware,
};

use shadow_drop_api::{
    common::server::create_dual_stack_listener, config::Config, logging,
    middleware::http_trace_middleware::http_trace_middleware, routes::app_routes, state::AppState,
};
use tower_http::cors::CorsLayer;
use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    info!("🚀 Starting API...");
    let config = Arc::new(Config::from_env());

    let (subscriber, _log_reload_handle) = logging::setup_subscriber(&config);

    subscriber.init();
    info!("✅ Logging initialized");

    info!(
        env = %config.rust_env,
        port = config.server.port,
        log_level = %config.logging.level,
        "🚀 Starting server"
    );

    let app_state = AppState::new(config.clone());
    info!("✅ Application state initialized");

    let allowed_origins: Vec<_> = app_state
        .config
        .server
        .cors_allowed_origins
        .iter()
        .map(|origin| {
            origin
                .parse::<HeaderValue>()
                .expect("Invalid CORS origin in config")
        })
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::ACCEPT, header::CONTENT_TYPE]);

    let app = app_routes(app_state.clone())
        .layer(middleware::from_fn(http_trace_middleware))
        .layer(cors)
        .into_make_service_with_connect_info::<SocketAddr>();

    let listener = create_dual_stack_listener(app_state.config.server.port).await?;

    axum::serve(listener, app).await
}
