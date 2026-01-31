use axum::{
    body::Body,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::Utc;
use serde::Serialize;

/// A generic struct for creating standardized successful API responses.
///
/// It is generic over `T`, allowing any serializable type to be used as the
/// response data. It also includes support for setting custom headers and cookies.
#[derive(Serialize)]
pub struct ApiSuccessResponse<T: Serialize> {
    success: bool,
    code: u16,
    // `Option<T>` allows for responses with or without a data payload.
    pub data: Option<T>,
    pub message: String,
    timestamp: i64,
}

/// Provides a default success response.
impl<T: Serialize> Default for ApiSuccessResponse<T> {
    fn default() -> Self {
        Self {
            success: true,
            code: 200,
            data: None,
            message: "Success".to_string(),
            timestamp: Utc::now().timestamp(),
        }
    }
}

/// Implementation of the builder pattern for `ApiResponse`.
///
/// These methods allow for a fluent and readable way to construct responses
/// in the handler functions.
impl<T: Serialize> ApiSuccessResponse<T> {
    /// Sets the HTTP status code for the response.
    pub fn with_code(mut self, code: StatusCode) -> Self {
        self.code = code.as_u16();
        self
    }

    /// Attaches a data payload to the response.
    pub fn with_data(mut self, data: T) -> Self {
        self.data = Some(data);
        self
    }

    /// Sets a custom success message for the response.
    pub fn with_message(mut self, message: &str) -> Self {
        self.message = message.to_owned();
        self
    }
}

/// Implements `IntoResponse`, allowing `ApiResponse` to be returned directly
/// from an Axum handler.
///
/// This is the core logic that transforms the `ApiResponse` struct into a
/// real HTTP response, serializing the body to JSON and attaching all
/// headers and cookies.
impl<T: Serialize> IntoResponse for ApiSuccessResponse<T> {
    fn into_response(self) -> Response {
        // Determine the final HTTP status code.
        let status_code =
            StatusCode::from_u16(self.code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

        // Serialize the struct into a JSON string for the response body.
        let body = serde_json::to_string(&self)
            .expect("Failed to serialize ApiResponse. This should never happen.");

        // Start building the response with the status code.
        let builder = Response::builder().status(status_code);

        // Build the final response with the correct content type and body.
        builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body))
            .expect("Failed to build response. This should never happen.")
    }
}
