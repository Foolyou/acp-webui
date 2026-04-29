use std::{
    fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Context;
use clap::Parser;

const DEFAULT_WORK_DIR_NAME: &str = ".acp-webui";
const DEFAULT_DATABASE_FILE: &str = "acp-webui.db";
pub const CODEX_AGENT_ID: &str = "codex";
pub const CLAUDE_AGENT_ID: &str = "claude";
pub const DEFAULT_AGENT_ID: &str = CODEX_AGENT_ID;
#[cfg(not(feature = "embedded-frontend"))]
const DEFAULT_FRONTEND_DIST: &str = "frontend/dist";

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_host: String,
    pub bind_port: u16,
    pub work_dir: PathBuf,
    pub database_url: String,
    pub codex_acp_command: String,
    pub codex_acp_args: Vec<String>,
    pub claude_acp_enabled: bool,
    pub claude_acp_command: String,
    pub claude_acp_args: Vec<String>,
    pub frontend_dist: Option<PathBuf>,
    pub pairing_token: Option<String>,
    pub disable_auth: bool,
    pub trusted_clients: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentConfig {
    pub id: String,
    pub title: String,
    pub command: String,
    pub args: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Parser)]
#[command(name = "acp-webui", about = "Mobile-first local web UI for ACP agents")]
struct RawConfig {
    #[arg(long, env = "ACP_WEBUI_BIND_HOST", default_value = "127.0.0.1")]
    bind_host: String,

    #[arg(long, env = "ACP_WEBUI_BIND_PORT", default_value_t = 7635)]
    bind_port: u16,

    #[arg(long, env = "ACP_WEBUI_WORK_DIR")]
    work_dir: Option<PathBuf>,

    #[arg(long, env = "ACP_WEBUI_DATABASE_URL")]
    database_url: Option<String>,

    #[arg(long, env = "ACP_WEBUI_CODEX_ACP_COMMAND", default_value = "codex-acp")]
    codex_acp_command: String,

    #[arg(long = "codex-acp-arg", env = "ACP_WEBUI_CODEX_ACP_ARG")]
    codex_acp_args: Vec<String>,

    #[arg(long, env = "ACP_WEBUI_CLAUDE_ACP_ENABLED", default_value_t = true)]
    claude_acp_enabled: bool,

    #[arg(long, env = "ACP_WEBUI_CLAUDE_ACP_COMMAND", default_value = "npx")]
    claude_acp_command: String,

    #[arg(long = "claude-acp-arg", env = "ACP_WEBUI_CLAUDE_ACP_ARG")]
    claude_acp_args: Vec<String>,

    #[arg(long, env = "ACP_WEBUI_FRONTEND_DIST")]
    frontend_dist: Option<PathBuf>,

    #[arg(long, env = "ACP_WEBUI_PAIRING_TOKEN")]
    pairing_token: Option<String>,

    #[arg(long, env = "ACP_WEBUI_DISABLE_AUTH", default_value_t = false)]
    disable_auth: bool,

    #[arg(
        long = "trusted-client",
        env = "ACP_WEBUI_TRUSTED_CLIENTS",
        value_delimiter = ','
    )]
    trusted_clients: Vec<String>,
}

impl Config {
    pub fn parse_args() -> anyhow::Result<Self> {
        Self::from_raw(RawConfig::parse())
    }

    pub fn bind_addr(&self) -> anyhow::Result<SocketAddr> {
        Ok(format!("{}:{}", self.bind_host, self.bind_port).parse()?)
    }

    pub fn ensure_work_dir(&self) -> anyhow::Result<()> {
        fs::create_dir_all(&self.work_dir).with_context(|| {
            format!(
                "failed to create application work directory {}",
                self.work_dir.display()
            )
        })?;

        let probe = self.work_dir.join(format!(
            ".write-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default()
        ));
        fs::write(&probe, b"ok").with_context(|| {
            format!(
                "failed to write to application work directory {}",
                self.work_dir.display()
            )
        })?;
        fs::remove_file(&probe).with_context(|| {
            format!(
                "failed to remove write test file from application work directory {}",
                self.work_dir.display()
            )
        })?;
        Ok(())
    }

    fn from_raw(raw: RawConfig) -> anyhow::Result<Self> {
        let home_dir = if raw.work_dir.is_some() {
            PathBuf::new()
        } else {
            user_home_dir().context(
                "failed to resolve user home directory; pass --work-dir or set ACP_WEBUI_WORK_DIR",
            )?
        };
        Ok(Self::from_raw_with_home(raw, &home_dir))
    }

    fn from_raw_with_home(raw: RawConfig, home_dir: &Path) -> Self {
        let work_dir = raw
            .work_dir
            .unwrap_or_else(|| home_dir.join(DEFAULT_WORK_DIR_NAME));
        let database_url = raw
            .database_url
            .unwrap_or_else(|| default_database_url(&work_dir));

        Self {
            bind_host: raw.bind_host,
            bind_port: raw.bind_port,
            work_dir,
            database_url,
            codex_acp_command: raw.codex_acp_command,
            codex_acp_args: raw.codex_acp_args,
            claude_acp_enabled: raw.claude_acp_enabled,
            claude_acp_command: raw.claude_acp_command,
            claude_acp_args: if raw.claude_acp_args.is_empty() {
                vec![
                    "--yes".to_string(),
                    "@agentclientprotocol/claude-agent-acp".to_string(),
                ]
            } else {
                raw.claude_acp_args
            },
            frontend_dist: raw.frontend_dist,
            pairing_token: raw.pairing_token,
            disable_auth: raw.disable_auth,
            trusted_clients: raw.trusted_clients,
        }
    }

    pub fn default_agent_id(&self) -> &'static str {
        DEFAULT_AGENT_ID
    }

    pub fn agent_configs(&self) -> Vec<AgentConfig> {
        vec![
            AgentConfig {
                id: CODEX_AGENT_ID.to_string(),
                title: "Codex".to_string(),
                command: self.codex_acp_command.clone(),
                args: self.codex_acp_args.clone(),
                enabled: true,
            },
            AgentConfig {
                id: CLAUDE_AGENT_ID.to_string(),
                title: "Claude".to_string(),
                command: self.claude_acp_command.clone(),
                args: self.claude_acp_args.clone(),
                enabled: self.claude_acp_enabled,
            },
        ]
    }
}

#[cfg(not(feature = "embedded-frontend"))]
pub fn default_frontend_dist() -> PathBuf {
    PathBuf::from(DEFAULT_FRONTEND_DIST)
}

fn default_database_url(work_dir: &Path) -> String {
    format!(
        "sqlite://{}",
        work_dir.join(DEFAULT_DATABASE_FILE).display()
    )
}

fn user_home_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("USERPROFILE")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .or_else(|| {
                let drive = std::env::var_os("HOMEDRIVE")?;
                let path = std::env::var_os("HOMEPATH")?;
                let mut home = PathBuf::from(drive);
                home.push(path);
                Some(home)
            })
            .or_else(|| {
                std::env::var_os("HOME")
                    .filter(|value| !value.is_empty())
                    .map(PathBuf::from)
            })
    } else {
        std::env::var_os("HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn raw_config() -> RawConfig {
        RawConfig {
            bind_host: "127.0.0.1".to_string(),
            bind_port: 7635,
            work_dir: None,
            database_url: None,
            codex_acp_command: "codex-acp".to_string(),
            codex_acp_args: vec![],
            claude_acp_enabled: true,
            claude_acp_command: "npx".to_string(),
            claude_acp_args: vec![],
            frontend_dist: None,
            pairing_token: None,
            disable_auth: false,
            trusted_clients: vec![],
        }
    }

    #[test]
    fn default_work_dir_uses_hidden_directory_under_home() {
        let home = PathBuf::from("/home/test-user");
        let config = Config::from_raw_with_home(raw_config(), &home);

        assert_eq!(config.work_dir, home.join(DEFAULT_WORK_DIR_NAME));
        assert_eq!(
            config.database_url,
            default_database_url(&home.join(DEFAULT_WORK_DIR_NAME))
        );
    }

    #[test]
    fn default_database_is_independent_of_current_directory() {
        let home = PathBuf::from("/home/test-user");
        let first = Config::from_raw_with_home(raw_config(), &home);
        let second = Config::from_raw_with_home(raw_config(), &home);

        assert_eq!(first.database_url, second.database_url);
    }

    #[test]
    fn work_dir_override_changes_default_database_path() {
        let mut raw = raw_config();
        raw.work_dir = Some(PathBuf::from("/tmp/acp-webui"));

        let config = Config::from_raw_with_home(raw, Path::new("/home/test-user"));

        assert_eq!(config.work_dir, PathBuf::from("/tmp/acp-webui"));
        assert_eq!(
            config.database_url,
            default_database_url(Path::new("/tmp/acp-webui"))
        );
    }

    #[test]
    fn explicit_database_url_takes_precedence() {
        let mut raw = raw_config();
        raw.work_dir = Some(PathBuf::from("/tmp/acp-webui"));
        raw.database_url = Some("sqlite::memory:".to_string());

        let config = Config::from_raw_with_home(raw, Path::new("/home/test-user"));

        assert_eq!(config.database_url, "sqlite::memory:");
    }

    #[test]
    fn cli_work_dir_is_parsed() {
        let raw = RawConfig::try_parse_from(["acp-webui", "--work-dir", "cli-state"]).unwrap();

        assert_eq!(raw.work_dir, Some(PathBuf::from("cli-state")));
    }

    #[test]
    fn env_work_dir_is_parsed() {
        let _guard = env_lock().lock().unwrap();
        let previous = std::env::var_os("ACP_WEBUI_WORK_DIR");
        std::env::set_var("ACP_WEBUI_WORK_DIR", "env-state");

        let raw = RawConfig::try_parse_from(["acp-webui"]).unwrap();

        match previous {
            Some(value) => std::env::set_var("ACP_WEBUI_WORK_DIR", value),
            None => std::env::remove_var("ACP_WEBUI_WORK_DIR"),
        }
        assert_eq!(raw.work_dir, Some(PathBuf::from("env-state")));
    }

    #[test]
    fn ensure_work_dir_creates_directory() {
        let dir = tempfile::tempdir().unwrap();
        let work_dir = dir.path().join("state");
        let mut raw = raw_config();
        raw.work_dir = Some(work_dir.clone());
        let config = Config::from_raw_with_home(raw, dir.path());

        config.ensure_work_dir().unwrap();

        assert!(work_dir.is_dir());
    }

    #[test]
    fn ensure_work_dir_fails_for_file_path() {
        let dir = tempfile::tempdir().unwrap();
        let work_dir = dir.path().join("state-file");
        fs::write(&work_dir, b"not a directory").unwrap();
        let mut raw = raw_config();
        raw.work_dir = Some(work_dir);
        let config = Config::from_raw_with_home(raw, dir.path());

        assert!(config.ensure_work_dir().is_err());
    }

    #[test]
    fn agent_configs_include_codex_and_claude_by_default() {
        let home = PathBuf::from("/home/test-user");
        let config = Config::from_raw_with_home(raw_config(), &home);
        let agents = config.agent_configs();

        assert_eq!(agents[0].id, CODEX_AGENT_ID);
        assert!(agents[0].enabled);
        assert_eq!(agents[1].id, CLAUDE_AGENT_ID);
        assert!(agents[1].enabled);
        assert_eq!(
            agents[1].args,
            vec![
                "--yes".to_string(),
                "@agentclientprotocol/claude-agent-acp".to_string()
            ]
        );
    }
}
