use std::{net::SocketAddr, path::PathBuf};

use clap::Parser;

#[derive(Debug, Clone, Parser)]
#[command(name = "acp-webui", about = "Mobile-first local web UI for ACP agents")]
pub struct Config {
    #[arg(long, env = "ACP_WEBUI_BIND_HOST", default_value = "127.0.0.1")]
    pub bind_host: String,

    #[arg(long, env = "ACP_WEBUI_BIND_PORT", default_value_t = 7635)]
    pub bind_port: u16,

    #[arg(
        long,
        env = "ACP_WEBUI_DATABASE_URL",
        default_value = "sqlite://.data/acp-webui.db"
    )]
    pub database_url: String,

    #[arg(long, env = "ACP_WEBUI_CODEX_ACP_COMMAND", default_value = "codex-acp")]
    pub codex_acp_command: String,

    #[arg(long = "codex-acp-arg", env = "ACP_WEBUI_CODEX_ACP_ARG")]
    pub codex_acp_args: Vec<String>,

    #[arg(long, env = "ACP_WEBUI_FRONTEND_DIST", default_value = "frontend/dist")]
    pub frontend_dist: PathBuf,
}

impl Config {
    pub fn parse_args() -> Self {
        Self::parse()
    }

    pub fn bind_addr(&self) -> anyhow::Result<SocketAddr> {
        Ok(format!("{}:{}", self.bind_host, self.bind_port).parse()?)
    }
}
