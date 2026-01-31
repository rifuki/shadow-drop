mod error;
mod success;

pub use error::ApiErrorResponse;
pub use success::ApiSuccessResponse;

pub type ApiResponse<T> = Result<ApiSuccessResponse<T>, ApiErrorResponse>;
