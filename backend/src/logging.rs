use tracing::Subscriber;
use tracing_subscriber::{
    EnvFilter, Registry, fmt,
    layer::SubscriberExt,
    reload::{self, Handle},
};

use crate::config::Config;

pub type ReloadFilterHandle = Handle<EnvFilter, Registry>;

pub fn setup_subscriber(
    config: &Config,
) -> (Box<dyn Subscriber + Send + Sync>, ReloadFilterHandle) {
    // A small factory closure to create a base EnvFilter from the config.
    let main_filter =
        EnvFilter::try_new(&config.logging.level).expect("Invalid RUST_LOG value in config");
    // Create a reloadable layer from the main filter. This allows changing the log level at runtime.
    let (filter_layer, log_reload_handle) = reload::Layer::new(main_filter);

    // ===================================================================
    // Appender Layers Configuration
    // ===================================================================
    // Terminal Appender: For logging to the console (stdout).
    let terminal_appender_layer = fmt::layer()
        .with_writer(std::io::stdout) // Direct output to the standard output.
        .with_ansi(true) // Enable ANSI color codes for pretty, colored logs in the terminal.
        .with_target(true) // Include the log's target (e.g., module path).
        .with_file(false) // Don't show file names in terminal for cleaner output
        .with_line_number(false) // Don't show line numbers in terminal
        .with_level(true)
        .compact(); // Compact formatting for cleaner output.

    // ===================================================================
    // Subscriber Assembly
    // ===================================================================
    // Combine all layers into a single subscriber registry.
    // The order matters: filter layer comes first, then the formatters.
    let registry = tracing_subscriber::registry()
        .with(filter_layer) // Global filter layer.
        .with(terminal_appender_layer); // Logs that pass the filter go to the terminal.

    (Box::new(registry), log_reload_handle)
}
