use std::env;

use dotenv::dotenv;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct LoggingConfig {
    pub level: String,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub rust_env: String,
    pub is_production: bool,

    pub server: ServerConfig,
    pub logging: LoggingConfig,
}

impl Config {
    pub fn from_env() -> Self {
        if cfg!(not(test)) {
            dotenv().ok();
        }

        let rust_env = Self::get_rust_env();
        let is_production = rust_env == "production";

        Self {
            rust_env,
            is_production,
            server: ServerConfig {
                port: env::var("PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .expect("PORT must be set and a valid number"),
                cors_allowed_origins: env::var("CORS_ALLOWED_ORIGINS")
                    .expect("CORS_ALLOWED_ORIGINS must be set")
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect(),
            },
            logging: LoggingConfig {
                level: env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            },
        }
    }

    fn get_rust_env() -> String {
        if cfg!(debug_assertions) {
            "development".to_string()
        } else {
            "production".to_string()
        }
    }
}
