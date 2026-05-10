use std::{
    collections::BTreeMap,
    fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Context;
use clap::Parser;

use crate::models::{
    permission_mode, AgentControl, AgentControlSelection, AgentControlValue, AgentPermissionMode,
};

const DEFAULT_WORK_DIR_NAME: &str = ".acp-webui";
const DEFAULT_DATABASE_FILE: &str = "acp-webui.db";
pub const CODEX_AGENT_ID: &str = "codex";
pub const CLAUDE_AGENT_ID: &str = "claude";
pub const OPENCODE_AGENT_ID: &str = "opencode";
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
    pub opencode_acp_enabled: bool,
    pub opencode_acp_command: String,
    pub opencode_acp_args: Vec<String>,
    pub frontend_dist: Option<PathBuf>,
    pub pairing_token: Option<String>,
    pub disable_auth: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentConfig {
    pub id: String,
    pub provider_id: String,
    pub title: String,
    pub command: String,
    pub args: Vec<String>,
    pub enabled: bool,
    pub permission_modes: Vec<AgentPermissionMode>,
    pub launch_controls: Vec<AgentControl>,
    pub launch_profiles: Vec<AgentLaunchProfile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentLaunchProfile {
    pub id: String,
    pub key: String,
    pub permission_mode: String,
    pub args: Vec<String>,
    pub summary: Vec<AgentControlSelection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedAgentLaunchProfile {
    pub id: String,
    pub key: String,
    pub permission_mode: String,
    pub summary: Vec<AgentControlSelection>,
}

impl AgentConfig {
    pub fn supports_permission_mode(&self, mode: &str) -> bool {
        self.permission_modes.iter().any(|item| item.id == mode)
    }

    pub fn runtime_config_for_permission_mode(&self, mode: &str) -> anyhow::Result<Self> {
        let profile = self
            .launch_profiles
            .iter()
            .find(|profile| profile.key == mode || profile.permission_mode == mode)
            .ok_or_else(|| {
                anyhow::anyhow!("{} does not support launch profile `{mode}`", self.title)
            })?;
        let mut config = self.clone();
        config.args = profile.args.clone();
        Ok(config)
    }

    pub fn default_launch_profile_key_for_permission_mode(&self, mode: &str) -> Option<&str> {
        self.launch_profiles
            .iter()
            .find(|profile| profile.permission_mode == mode)
            .map(|profile| profile.key.as_str())
    }

    pub fn resolve_launch_profile(
        &self,
        requested_permission_mode: Option<&str>,
        values: Option<&BTreeMap<String, String>>,
    ) -> anyhow::Result<ResolvedAgentLaunchProfile> {
        let values = values.cloned().unwrap_or_default();
        let permission = values
            .get("permission")
            .map(String::as_str)
            .or(requested_permission_mode)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(permission_mode::MANUAL);
        if !permission_mode::is_known(permission) {
            anyhow::bail!("Unknown permission mode `{permission}`");
        }
        if !self.supports_permission_mode(permission) {
            anyhow::bail!(
                "{} does not support permission mode `{permission}`",
                self.title
            );
        }

        let mut selected = BTreeMap::new();
        selected.insert("permission".to_string(), permission.to_string());
        for control in &self.launch_controls {
            if control.id == "permission" {
                continue;
            }
            let value = values
                .get(&control.id)
                .map(String::as_str)
                .unwrap_or(&control.default_value);
            if !control.options.iter().any(|option| option.value == value) {
                anyhow::bail!(
                    "{} launch control `{}` does not support value `{value}`",
                    self.title,
                    control.id
                );
            }
            selected.insert(control.id.clone(), value.to_string());
        }

        let key = launch_profile_key(&selected);
        let profile = self
            .launch_profiles
            .iter()
            .find(|profile| profile.key == key);
        let Some(profile) = profile else {
            anyhow::bail!("{} launch profile `{key}` is not available", self.title);
        };
        Ok(ResolvedAgentLaunchProfile {
            id: profile.id.clone(),
            key: profile.key.clone(),
            permission_mode: profile.permission_mode.clone(),
            summary: profile.summary.clone(),
        })
    }
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

    #[arg(long, env = "ACP_WEBUI_OPENCODE_ACP_ENABLED", default_value_t = false)]
    opencode_acp_enabled: bool,

    #[arg(
        long,
        env = "ACP_WEBUI_OPENCODE_ACP_COMMAND",
        default_value = "opencode"
    )]
    opencode_acp_command: String,

    #[arg(long = "opencode-acp-arg", env = "ACP_WEBUI_OPENCODE_ACP_ARG")]
    opencode_acp_args: Vec<String>,

    #[arg(long, env = "ACP_WEBUI_FRONTEND_DIST")]
    frontend_dist: Option<PathBuf>,

    #[arg(long, env = "ACP_WEBUI_PAIRING_TOKEN")]
    pairing_token: Option<String>,

    #[arg(long, env = "ACP_WEBUI_DISABLE_AUTH", default_value_t = false)]
    disable_auth: bool,
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
            opencode_acp_enabled: raw.opencode_acp_enabled,
            opencode_acp_command: raw.opencode_acp_command,
            opencode_acp_args: if raw.opencode_acp_args.is_empty() {
                vec!["acp".to_string()]
            } else {
                raw.opencode_acp_args
            },
            frontend_dist: raw.frontend_dist,
            pairing_token: raw.pairing_token,
            disable_auth: raw.disable_auth,
        }
    }

    pub fn default_agent_id(&self) -> &'static str {
        DEFAULT_AGENT_ID
    }

    pub fn agent_configs(&self) -> Vec<AgentConfig> {
        vec![
            codex_agent_config(
                self.codex_acp_command.clone(),
                self.codex_acp_args.clone(),
                true,
            ),
            generic_agent_config(
                CLAUDE_AGENT_ID,
                "claude",
                "Claude",
                self.claude_acp_command.clone(),
                self.claude_acp_args.clone(),
                self.claude_acp_enabled,
            ),
            generic_agent_config(
                OPENCODE_AGENT_ID,
                "opencode",
                "OpenCode",
                self.opencode_acp_command.clone(),
                self.opencode_acp_args.clone(),
                self.opencode_acp_enabled,
            ),
        ]
    }
}

fn codex_agent_config(command: String, base_args: Vec<String>, enabled: bool) -> AgentConfig {
    let launch_controls = codex_launch_controls();
    let launch_profiles = codex_launch_profiles(&base_args);
    AgentConfig {
        id: CODEX_AGENT_ID.to_string(),
        provider_id: "codex".to_string(),
        title: "Codex".to_string(),
        command,
        args: base_args,
        enabled,
        permission_modes: codex_permission_modes(),
        launch_controls,
        launch_profiles,
    }
}

fn generic_agent_config(
    id: &str,
    provider_id: &str,
    title: &str,
    command: String,
    base_args: Vec<String>,
    enabled: bool,
) -> AgentConfig {
    let controls = vec![permission_launch_control(vec![manual_permission_mode()])];
    let values = BTreeMap::from([(
        "permission".to_string(),
        permission_mode::MANUAL.to_string(),
    )]);
    let summary = control_summary(&controls, &values);
    AgentConfig {
        id: id.to_string(),
        provider_id: provider_id.to_string(),
        title: title.to_string(),
        command,
        args: base_args.clone(),
        enabled,
        permission_modes: vec![manual_permission_mode()],
        launch_controls: controls,
        launch_profiles: vec![AgentLaunchProfile {
            id: permission_mode::MANUAL.to_string(),
            key: launch_profile_key(&values),
            permission_mode: permission_mode::MANUAL.to_string(),
            args: base_args,
            summary,
        }],
    }
}

pub fn codex_acp_args_for_permission_mode(
    base_args: &[String],
    mode: &str,
) -> anyhow::Result<Vec<String>> {
    let mut args = base_args.to_vec();
    match mode {
        permission_mode::MANUAL => {}
        permission_mode::FULL_AUTO => {
            args.extend([
                "-c".to_string(),
                "approval_policy=\"on-request\"".to_string(),
                "-c".to_string(),
                "sandbox_mode=\"workspace-write\"".to_string(),
            ]);
        }
        permission_mode::YOLO => {
            args.extend([
                "-c".to_string(),
                "approval_policy=\"never\"".to_string(),
                "-c".to_string(),
                "sandbox_mode=\"danger-full-access\"".to_string(),
            ]);
        }
        _ => anyhow::bail!("Unknown Codex permission mode `{mode}`"),
    }
    Ok(args)
}

fn codex_acp_args_for_launch_profile(
    base_args: &[String],
    values: &BTreeMap<String, String>,
) -> anyhow::Result<Vec<String>> {
    let permission = values
        .get("permission")
        .map(String::as_str)
        .unwrap_or(permission_mode::MANUAL);
    let mut args = codex_acp_args_for_permission_mode(base_args, permission)?;
    if let Some(reasoning) = values.get("reasoning_effort") {
        if reasoning != "default" {
            args.extend([
                "-c".to_string(),
                format!("model_reasoning_effort=\"{reasoning}\""),
            ]);
        }
    }
    if values.get("response_mode").map(String::as_str) == Some("fast")
        && !matches!(
            values.get("reasoning_effort").map(String::as_str),
            Some("minimal" | "low")
        )
    {
        args.extend([
            "-c".to_string(),
            "model_reasoning_effort=\"minimal\"".to_string(),
        ]);
    }
    Ok(args)
}

fn codex_launch_controls() -> Vec<AgentControl> {
    vec![
        permission_launch_control(codex_permission_modes()),
        AgentControl {
            id: "reasoning_effort".to_string(),
            label: "Reasoning".to_string(),
            description: Some(
                "Controls model reasoning effort when the provider supports it".to_string(),
            ),
            category: "model".to_string(),
            scope: "launch".to_string(),
            control_type: "select".to_string(),
            default_value: "default".to_string(),
            options: vec![
                control_value("default", "Provider default", None, None),
                control_value("minimal", "Minimal", None, None),
                control_value("low", "Low", None, None),
                control_value("medium", "Medium", None, None),
                control_value("high", "High", None, None),
            ],
        },
        AgentControl {
            id: "response_mode".to_string(),
            label: "Response mode".to_string(),
            description: Some("Prefers lower-latency behavior for new sessions".to_string()),
            category: "performance".to_string(),
            scope: "launch".to_string(),
            control_type: "select".to_string(),
            default_value: "standard".to_string(),
            options: vec![
                control_value("standard", "Standard", None, None),
                control_value(
                    "fast",
                    "Fast",
                    Some("Uses minimal reasoning unless explicitly overridden"),
                    None,
                ),
            ],
        },
    ]
}

fn codex_launch_profiles(base_args: &[String]) -> Vec<AgentLaunchProfile> {
    let controls = codex_launch_controls();
    let mut profiles = Vec::new();
    for permission in [
        permission_mode::MANUAL,
        permission_mode::FULL_AUTO,
        permission_mode::YOLO,
    ] {
        for reasoning in ["default", "minimal", "low", "medium", "high"] {
            for response_mode in ["standard", "fast"] {
                let values = BTreeMap::from([
                    ("permission".to_string(), permission.to_string()),
                    ("reasoning_effort".to_string(), reasoning.to_string()),
                    ("response_mode".to_string(), response_mode.to_string()),
                ]);
                let key = launch_profile_key(&values);
                let args = codex_acp_args_for_launch_profile(base_args, &values)
                    .expect("built-in Codex launch profile is valid");
                profiles.push(AgentLaunchProfile {
                    id: key.clone(),
                    key,
                    permission_mode: permission.to_string(),
                    args,
                    summary: control_summary(&controls, &values),
                });
            }
        }
    }
    profiles
}

fn permission_launch_control(modes: Vec<AgentPermissionMode>) -> AgentControl {
    AgentControl {
        id: "permission".to_string(),
        label: "Permission".to_string(),
        description: Some(
            "Controls approval and sandbox posture for the launched runtime".to_string(),
        ),
        category: "permission".to_string(),
        scope: "launch".to_string(),
        control_type: "select".to_string(),
        default_value: permission_mode::MANUAL.to_string(),
        options: modes
            .into_iter()
            .map(|mode| AgentControlValue {
                value: mode.id,
                label: mode.label,
                description: Some(mode.description),
                risk_level: Some(mode.risk_level),
            })
            .collect(),
    }
}

fn control_value(
    value: &str,
    label: &str,
    description: Option<&str>,
    risk_level: Option<&str>,
) -> AgentControlValue {
    AgentControlValue {
        value: value.to_string(),
        label: label.to_string(),
        description: description.map(str::to_string),
        risk_level: risk_level.map(str::to_string),
    }
}

fn launch_profile_key(values: &BTreeMap<String, String>) -> String {
    values
        .iter()
        .filter(|(_, value)| !value.trim().is_empty())
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join(";")
}

fn control_summary(
    controls: &[AgentControl],
    values: &BTreeMap<String, String>,
) -> Vec<AgentControlSelection> {
    controls
        .iter()
        .filter_map(|control| {
            let value = values.get(&control.id)?;
            let option = control
                .options
                .iter()
                .find(|option| &option.value == value)?;
            Some(AgentControlSelection {
                id: control.id.clone(),
                label: control.label.clone(),
                value: value.clone(),
                value_label: option.label.clone(),
                category: control.category.clone(),
                scope: control.scope.clone(),
                risk_level: option.risk_level.clone(),
            })
        })
        .collect()
}

pub fn manual_permission_mode() -> AgentPermissionMode {
    AgentPermissionMode {
        id: permission_mode::MANUAL.to_string(),
        label: "Manual".to_string(),
        description: "Ask before approval-managed actions".to_string(),
        risk_level: "low".to_string(),
    }
}

pub fn codex_permission_modes() -> Vec<AgentPermissionMode> {
    vec![
        manual_permission_mode(),
        AgentPermissionMode {
            id: permission_mode::FULL_AUTO.to_string(),
            label: "Full auto".to_string(),
            description: "Sandboxed automatic execution".to_string(),
            risk_level: "medium".to_string(),
        },
        AgentPermissionMode {
            id: permission_mode::YOLO.to_string(),
            label: "YOLO".to_string(),
            description: "No approvals / no sandbox".to_string(),
            risk_level: "high".to_string(),
        },
    ]
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
            opencode_acp_enabled: false,
            opencode_acp_command: "opencode-acp".to_string(),
            opencode_acp_args: vec![],
            frontend_dist: None,
            pairing_token: None,
            disable_auth: false,
        }
    }

    fn test_home() -> PathBuf {
        PathBuf::from("test-home")
    }

    #[test]
    fn default_work_dir_uses_hidden_directory_under_home() {
        let home = test_home();
        let config = Config::from_raw_with_home(raw_config(), &home);

        assert_eq!(config.work_dir, home.join(DEFAULT_WORK_DIR_NAME));
        assert_eq!(
            config.database_url,
            default_database_url(&home.join(DEFAULT_WORK_DIR_NAME))
        );
    }

    #[test]
    fn default_database_is_independent_of_current_directory() {
        let home = test_home();
        let first = Config::from_raw_with_home(raw_config(), &home);
        let second = Config::from_raw_with_home(raw_config(), &home);

        assert_eq!(first.database_url, second.database_url);
    }

    #[test]
    fn work_dir_override_changes_default_database_path() {
        let mut raw = raw_config();
        raw.work_dir = Some(PathBuf::from("custom-state"));

        let config = Config::from_raw_with_home(raw, &test_home());

        assert_eq!(config.work_dir, PathBuf::from("custom-state"));
        assert_eq!(
            config.database_url,
            default_database_url(Path::new("custom-state"))
        );
    }

    #[test]
    fn explicit_database_url_takes_precedence() {
        let mut raw = raw_config();
        raw.work_dir = Some(PathBuf::from("custom-state"));
        raw.database_url = Some("sqlite::memory:".to_string());

        let config = Config::from_raw_with_home(raw, &test_home());

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
        let home = test_home();
        let config = Config::from_raw_with_home(raw_config(), &home);
        let agents = config.agent_configs();

        assert_eq!(agents[0].id, CODEX_AGENT_ID);
        assert!(agents[0].enabled);
        assert!(agents[0].supports_permission_mode(permission_mode::YOLO));
        assert_eq!(agents[1].id, CLAUDE_AGENT_ID);
        assert!(agents[1].enabled);
        assert!(agents[1].supports_permission_mode(permission_mode::MANUAL));
        assert!(!agents[1].supports_permission_mode(permission_mode::YOLO));
        assert_eq!(
            agents[1].args,
            vec![
                "--yes".to_string(),
                "@agentclientprotocol/claude-agent-acp".to_string()
            ]
        );
    }

    #[test]
    fn codex_manual_mode_preserves_base_args() {
        let base_args = vec!["--base".to_string()];
        let args = codex_acp_args_for_permission_mode(&base_args, permission_mode::MANUAL).unwrap();

        assert_eq!(args, base_args);
    }

    #[test]
    fn codex_full_auto_mode_adds_sandboxed_auto_overrides() {
        let args =
            codex_acp_args_for_permission_mode(&["--base".to_string()], permission_mode::FULL_AUTO)
                .unwrap();

        assert_eq!(
            args,
            vec![
                "--base",
                "-c",
                "approval_policy=\"on-request\"",
                "-c",
                "sandbox_mode=\"workspace-write\""
            ]
        );
    }

    #[test]
    fn codex_yolo_mode_adds_no_approval_no_sandbox_overrides() {
        let args =
            codex_acp_args_for_permission_mode(&["--base".to_string()], permission_mode::YOLO)
                .unwrap();

        assert_eq!(
            args,
            vec![
                "--base",
                "-c",
                "approval_policy=\"never\"",
                "-c",
                "sandbox_mode=\"danger-full-access\""
            ]
        );
    }
}
