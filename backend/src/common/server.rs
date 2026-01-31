use std::net::{IpAddr, Ipv6Addr, SocketAddr};

use tokio::net::TcpListener;

/// Creates a TCP listener that attempts to bind to both IPv6 and IPv4 (dual-stack).
///
/// If binding to a dual-stack socket fails, it gracefully falls back to an
/// IPv4-only socket. This provides maximum compatibility across different
/// network environments.
pub async fn create_dual_stack_listener(port: u16) -> std::io::Result<TcpListener> {
    let addr = SocketAddr::from((IpAddr::V6(Ipv6Addr::UNSPECIFIED), port));

    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            // Log dual-stack success
            match listener.local_addr() {
                Ok(addr) => {
                    let access_url = format!(
                        "http://127.0.0.1:{} or http://[::1]:{}",
                        addr.port(),
                        addr.port()
                    );
                    tracing::info!(
                        address = %addr,
                        port = addr.port(),
                        stack = "dual-stack (IPv4/IPv6)",
                        access = access_url,
                        "🌐 Server listening and ready to accept connections"
                    );
                }
                Err(e) => {
                    tracing::warn!(error = %e, "⚠️ Dual-stack listener created but could not determine address");
                }
            }
            Ok(listener)
        }
        Err(e) => {
            tracing::debug!("🔄 Dual-stack bind failed: {}, falling back to IPv4", e);

            // Fallback to IPv4 only
            let addr_v4 = SocketAddr::from(([0, 0, 0, 0], port));
            match tokio::net::TcpListener::bind(addr_v4).await {
                Ok(listener) => {
                    // Log IPv4-only success
                    match listener.local_addr() {
                        Ok(addr) => {
                            let access_url = format!("http://127.0.0.1:{}", addr.port());
                            tracing::info!(
                                address = %addr,
                                port = addr.port(),
                                stack = "IPv4 only",
                                access = access_url,
                                "🌐 Server listening and ready to accept connections"
                            );
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, port = port, "⚠️ IPv4 listener created but could not determine address");
                        }
                    }
                    Ok(listener)
                }
                Err(ipv4_err) => {
                    tracing::error!(
                        ipv6_error = %e,
                        ipv4_error = %ipv4_err,
                        port = port,
                        "❌ Failed to bind to both IPv6 and IPv4"
                    );
                    Err(ipv4_err)
                }
            }
        }
    }
}
