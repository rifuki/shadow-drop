use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use serde::Serialize;

/// Contains the specific details of an error.
#[derive(Debug, Serialize)]
pub struct Errors {
    pub code: u16,
    pub message: String,
    pub details: Option<String>,
}

/// The standardized application error response structure.
#[derive(Debug, Serialize)]
pub struct ApiErrorResponse {
    pub success: bool,
    pub errors: Errors,
    pub timestamp: i64,
}

// Idiomatic implementation of `Default`.
// Delegates to `Self::new()` to enable standard default instance creation
impl Default for ApiErrorResponse {
    fn default() -> Self {
        Self {
            success: false,
            errors: Errors {
                code: 500,
                message: "An internal server error occurred.".to_owned(),
                details: None,
            },
            timestamp: Utc::now().timestamp(),
        }
    }
}

/// --- Builder Methods ---
/// Allows for fluent construction of an `ApiErrorResponse`.
impl ApiErrorResponse {
    /// Sets the HTTP status code for the error.
    pub fn with_code(mut self, code: StatusCode) -> Self {
        self.errors.code = code.as_u16();
        self
    }
    /// Sets the primary error message.
    pub fn with_message(mut self, message: &str) -> Self {
        self.errors.message = message.to_owned();
        self
    }
    /// Adds optional, more detailed information about the error.
    pub fn with_details(mut self, details: String) -> Self {
        self.errors.details = Some(details);
        self
    }
}

/// --- IntoResponse Implementation ---
/// Enables `ApiErrorResponse` to be returned directly from Axum handlers.
impl IntoResponse for ApiErrorResponse {
    fn into_response(self) -> Response {
        let status_code =
            StatusCode::from_u16(self.errors.code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let body = Json(self);

        (status_code, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use serde_json::Value;

    #[test]
    fn test_default_app_error() {
        // ARRANGE
        let default_error = ApiErrorResponse::default();

        // ASSERT
        assert!(!default_error.success);
        assert_eq!(default_error.errors.code, 500);
        assert_eq!(
            default_error.errors.message,
            "An internal server error occurred."
        );
        assert!(default_error.errors.details.is_none());
    }

    #[test]
    fn test_app_error_builder_methods() {
        // ARRANGE
        let custom_error = ApiErrorResponse::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Resource not found")
            .with_details("The requested item with ID 123 does not exist.".to_string());

        // ASSERT
        assert_eq!(custom_error.errors.code, 404);
        assert_eq!(custom_error.errors.message, "Resource not found");
        assert_eq!(
            custom_error.errors.details,
            Some("The requested item with ID 123 does not exist.".to_string())
        );
    }

    #[tokio::test]
    async fn test_into_response_conversion() {
        // ARRANGE
        let app_error = ApiErrorResponse::default()
            .with_code(StatusCode::UNAUTHORIZED)
            .with_message("Authentication required");

        // Unwrap the Result to get the actual serde_json::Value
        let expected_json = serde_json::to_value(&app_error).unwrap();

        // ACTION
        let response = app_error.into_response();

        // ASSERT
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let body_bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        // Unwrap the Result here as well
        let body_json: Value = serde_json::from_slice(&body_bytes).unwrap();

        // Now you can index into the Value
        assert_eq!(body_json["success"], expected_json["success"]);
        assert_eq!(body_json["errors"], expected_json["errors"]);
    }
}
