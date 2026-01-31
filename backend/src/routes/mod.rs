use axum::Router;

use crate::state::AppState;

mod campaigns;

pub fn app_routes(state: AppState) -> Router {
    let api_routes = Router::new()
        .nest("/campaigns", campaigns::campaign_routes());

    Router::new()
        .nest("/api/v1", api_routes)
        .fallback(common::handle_404)
        .with_state(state)
}

mod common {
    use axum::http::StatusCode;

    use crate::common::response::ApiErrorResponse;

    pub async fn handle_404() -> ApiErrorResponse {
        ApiErrorResponse::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("The requested endpoint does not exist.")
    }
}
