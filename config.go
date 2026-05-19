package main

import (
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	defaultWorkDirName  = ".acp-webui"
	defaultDatabaseFile = "acp-webui.db"
	defaultFrontendDist = "frontend/dist"

	defaultTranscriptionModel = "Systran/faster-whisper-large-v3"

	claudeACPModeConfigID          = "mode"
	claudeACPModeDefault           = "default"
	claudeACPModeBypassPermissions = "bypassPermissions"
)

type Config struct {
	BindHost                   string
	BindPort                   int
	WorkDir                    string
	DatabaseURL                string
	CodexACPCommand            string
	CodexACPArgs               []string
	ClaudeACPEnabled           bool
	ClaudeACPCommand           string
	ClaudeACPArgs              []string
	OpenCodeACPEnabled         bool
	OpenCodeACPCommand         string
	OpenCodeACPArgs            []string
	FrontendDist               string
	DisableAuth                bool
	TranscriptionProvider      string
	TranscriptionBaseURL       string
	TranscriptionAPIKey        string
	TranscriptionModel         string
	TranscriptionLanguage      string
	TranscriptionTimeout       time.Duration
	TranscriptionMaxAudioBytes int64
}

type AgentConfig struct {
	ID              string
	ProviderID      string
	Title           string
	Command         string
	Args            []string
	Enabled         bool
	PermissionModes []AgentPermissionMode
	LaunchControls  []AgentControl
	LaunchProfiles  []AgentLaunchProfile
}

type AgentLaunchProfile struct {
	ID             string
	Key            string
	PermissionMode string
	Args           []string
	Summary        []AgentControlSelection
}

type ResolvedAgentLaunchProfile struct {
	ID             string
	Key            string
	PermissionMode string
	Summary        []AgentControlSelection
}

func parseConfig(args []string) (Config, error) {
	raw := map[string][]string{}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if !strings.HasPrefix(arg, "--") {
			return Config{}, fmt.Errorf("unexpected argument %q", arg)
		}
		nameValue := strings.TrimPrefix(arg, "--")
		name, value, ok := strings.Cut(nameValue, "=")
		if !ok {
			if takesValue(name) {
				if i+1 >= len(args) {
					return Config{}, fmt.Errorf("--%s requires a value", name)
				}
				i++
				value = args[i]
			} else {
				value = "true"
			}
		}
		raw[name] = append(raw[name], value)
	}

	home, err := userHomeDir()
	if err != nil && first(raw, "work-dir", env("ACP_WEBUI_WORK_DIR")) == "" {
		return Config{}, err
	}
	workDir := first(raw, "work-dir", env("ACP_WEBUI_WORK_DIR"))
	if workDir == "" {
		workDir = filepath.Join(home, defaultWorkDirName)
	}
	databaseURL := first(raw, "database-url", env("ACP_WEBUI_DATABASE_URL"))
	if databaseURL == "" {
		databaseURL = "sqlite://" + filepath.Join(workDir, defaultDatabaseFile)
	}
	bindPort, err := strconv.Atoi(defaulted(first(raw, "bind-port", env("ACP_WEBUI_BIND_PORT")), "7635"))
	if err != nil || bindPort <= 0 || bindPort > 65535 {
		return Config{}, fmt.Errorf("--bind-port must be a valid TCP port")
	}
	transcriptionTimeoutSeconds, err := strconv.Atoi(defaulted(first(raw, "transcription-timeout-seconds", env("ACP_WEBUI_TRANSCRIPTION_TIMEOUT_SECONDS")), "60"))
	if err != nil || transcriptionTimeoutSeconds <= 0 {
		return Config{}, fmt.Errorf("--transcription-timeout-seconds must be at least 1")
	}
	transcriptionMaxAudioMB, err := strconv.Atoi(defaulted(first(raw, "transcription-max-audio-mb", env("ACP_WEBUI_TRANSCRIPTION_MAX_AUDIO_MB")), "25"))
	if err != nil || transcriptionMaxAudioMB <= 0 {
		return Config{}, fmt.Errorf("--transcription-max-audio-mb must be at least 1")
	}
	transcriptionProvider := strings.TrimSpace(first(raw, "transcription-provider", env("ACP_WEBUI_TRANSCRIPTION_PROVIDER")))
	transcriptionBaseURL := strings.TrimSpace(first(raw, "transcription-base-url", env("ACP_WEBUI_TRANSCRIPTION_BASE_URL")))
	transcriptionAPIKey := first(raw, "transcription-api-key", env("ACP_WEBUI_TRANSCRIPTION_API_KEY"))
	transcriptionModel := defaulted(first(raw, "transcription-model", env("ACP_WEBUI_TRANSCRIPTION_MODEL")), defaultTranscriptionModel)
	transcriptionLanguage := strings.TrimSpace(first(raw, "transcription-language", env("ACP_WEBUI_TRANSCRIPTION_LANGUAGE")))
	if transcriptionProvider != "" && transcriptionProvider != "openai-compatible" {
		return Config{}, fmt.Errorf("--transcription-provider must be openai-compatible")
	}
	if transcriptionProvider != "" && transcriptionBaseURL == "" {
		return Config{}, fmt.Errorf("--transcription-base-url is required when transcription is enabled")
	}
	if transcriptionProvider == "" && (transcriptionBaseURL != "" || transcriptionAPIKey != "" || transcriptionLanguage != "" || hasKey(raw, "transcription-model")) {
		return Config{}, fmt.Errorf("--transcription-provider is required when transcription options are configured")
	}

	claudeArgs := append([]string{}, raw["claude-acp-arg"]...)
	if len(claudeArgs) == 0 {
		claudeArgs = []string{"--yes", "@agentclientprotocol/claude-agent-acp"}
	}
	opencodeArgs := append([]string{}, raw["opencode-acp-arg"]...)
	if len(opencodeArgs) == 0 {
		opencodeArgs = []string{"acp"}
	}

	return Config{
		BindHost:                   defaulted(first(raw, "bind-host", env("ACP_WEBUI_BIND_HOST")), "127.0.0.1"),
		BindPort:                   bindPort,
		WorkDir:                    workDir,
		DatabaseURL:                databaseURL,
		CodexACPCommand:            defaulted(first(raw, "codex-acp-command", env("ACP_WEBUI_CODEX_ACP_COMMAND")), "codex-acp"),
		CodexACPArgs:               append([]string{}, raw["codex-acp-arg"]...),
		ClaudeACPEnabled:           boolValue(first(raw, "claude-acp-enabled", env("ACP_WEBUI_CLAUDE_ACP_ENABLED")), true),
		ClaudeACPCommand:           defaulted(first(raw, "claude-acp-command", env("ACP_WEBUI_CLAUDE_ACP_COMMAND")), "npx"),
		ClaudeACPArgs:              claudeArgs,
		OpenCodeACPEnabled:         boolValue(first(raw, "opencode-acp-enabled", env("ACP_WEBUI_OPENCODE_ACP_ENABLED")), false),
		OpenCodeACPCommand:         defaulted(first(raw, "opencode-acp-command", env("ACP_WEBUI_OPENCODE_ACP_COMMAND")), "opencode"),
		OpenCodeACPArgs:            opencodeArgs,
		FrontendDist:               defaulted(first(raw, "frontend-dist", env("ACP_WEBUI_FRONTEND_DIST")), defaultFrontendDist),
		DisableAuth:                boolValue(first(raw, "disable-auth", env("ACP_WEBUI_DISABLE_AUTH")), false),
		TranscriptionProvider:      transcriptionProvider,
		TranscriptionBaseURL:       transcriptionBaseURL,
		TranscriptionAPIKey:        transcriptionAPIKey,
		TranscriptionModel:         transcriptionModel,
		TranscriptionLanguage:      transcriptionLanguage,
		TranscriptionTimeout:       time.Duration(transcriptionTimeoutSeconds) * time.Second,
		TranscriptionMaxAudioBytes: int64(transcriptionMaxAudioMB) * 1024 * 1024,
	}, nil
}

func takesValue(name string) bool {
	switch name {
	case "disable-auth", "claude-acp-enabled", "opencode-acp-enabled":
		return false
	default:
		return true
	}
}

func hasKey(raw map[string][]string, key string) bool {
	_, ok := raw[key]
	return ok
}

func (c Config) TranscriptionAvailable() bool {
	return c.TranscriptionProvider == "openai-compatible" && strings.TrimSpace(c.TranscriptionBaseURL) != ""
}

func first(raw map[string][]string, key string, fallback string) string {
	if values := raw[key]; len(values) > 0 {
		return values[len(values)-1]
	}
	return fallback
}

func env(name string) string {
	return os.Getenv(name)
}

func defaulted(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func boolValue(value string, fallback bool) bool {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func (c Config) bindAddr() string {
	return net.JoinHostPort(c.BindHost, strconv.Itoa(c.BindPort))
}

func (c Config) ensureWorkDir() error {
	if err := os.MkdirAll(c.WorkDir, 0o755); err != nil {
		return fmt.Errorf("failed to create application work directory %s: %w", c.WorkDir, err)
	}
	probe := filepath.Join(c.WorkDir, fmt.Sprintf(".write-test-%d-%d", os.Getpid(), timeNowUnixNano()))
	if err := os.WriteFile(probe, []byte("ok"), 0o644); err != nil {
		return fmt.Errorf("failed to write to application work directory %s: %w", c.WorkDir, err)
	}
	if err := os.Remove(probe); err != nil {
		return fmt.Errorf("failed to remove write test file from application work directory %s: %w", c.WorkDir, err)
	}
	return nil
}

func (c Config) agentConfigs() []AgentConfig {
	return []AgentConfig{
		codexAgentConfig(c.CodexACPCommand, c.CodexACPArgs, true),
		claudeAgentConfig(c.ClaudeACPCommand, c.ClaudeACPArgs, c.ClaudeACPEnabled),
		genericAgentConfig(opencodeAgentID, "opencode", "OpenCode", c.OpenCodeACPCommand, c.OpenCodeACPArgs, c.OpenCodeACPEnabled),
	}
}

func codexAgentConfig(command string, baseArgs []string, enabled bool) AgentConfig {
	controls := codexLaunchControls()
	return AgentConfig{
		ID:              codexAgentID,
		ProviderID:      "codex",
		Title:           "Codex",
		Command:         command,
		Args:            append([]string{}, baseArgs...),
		Enabled:         enabled,
		PermissionModes: codexPermissionModes(),
		LaunchControls:  controls,
		LaunchProfiles:  codexLaunchProfiles(baseArgs),
	}
}

func genericAgentConfig(id, providerID, title, command string, baseArgs []string, enabled bool) AgentConfig {
	modes := []AgentPermissionMode{manualPermissionMode()}
	controls := []AgentControl{permissionLaunchControl(modes)}
	values := map[string]string{"permission": permissionManual}
	return AgentConfig{
		ID:              id,
		ProviderID:      providerID,
		Title:           title,
		Command:         command,
		Args:            append([]string{}, baseArgs...),
		Enabled:         enabled,
		PermissionModes: modes,
		LaunchControls:  controls,
		LaunchProfiles: []AgentLaunchProfile{{
			ID:             permissionManual,
			Key:            launchProfileKey(values),
			PermissionMode: permissionManual,
			Args:           append([]string{}, baseArgs...),
			Summary:        controlSummary(controls, values),
		}},
	}
}

func claudeAgentConfig(command string, baseArgs []string, enabled bool) AgentConfig {
	modes := claudePermissionModes()
	controls := []AgentControl{permissionLaunchControl(modes)}
	return AgentConfig{
		ID:              claudeAgentID,
		ProviderID:      "claude",
		Title:           "Claude",
		Command:         command,
		Args:            append([]string{}, baseArgs...),
		Enabled:         enabled,
		PermissionModes: modes,
		LaunchControls:  controls,
		LaunchProfiles:  claudeLaunchProfiles(baseArgs, controls),
	}
}

func claudePermissionModes() []AgentPermissionMode {
	return []AgentPermissionMode{
		manualPermissionMode(),
		{ID: permissionYolo, Label: "YOLO", Description: "No approvals / no sandbox", RiskLevel: "high"},
	}
}

func claudeLaunchProfiles(baseArgs []string, controls []AgentControl) []AgentLaunchProfile {
	var profiles []AgentLaunchProfile
	for _, permission := range []string{permissionManual, permissionYolo} {
		values := map[string]string{"permission": permission}
		profiles = append(profiles, AgentLaunchProfile{
			ID:             permission,
			Key:            launchProfileKey(values),
			PermissionMode: permission,
			Args:           append([]string{}, baseArgs...),
			Summary:        controlSummary(controls, values),
		})
	}
	return profiles
}

func claudeACPModeForPermissionMode(permissionMode string) (string, error) {
	switch strings.TrimSpace(permissionMode) {
	case "", permissionManual:
		return claudeACPModeDefault, nil
	case permissionYolo:
		return claudeACPModeBypassPermissions, nil
	case permissionFullAuto:
		return "", fmt.Errorf("Claude does not support permission mode %q", permissionFullAuto)
	default:
		return "", fmt.Errorf("unknown permission mode %q", permissionMode)
	}
}

func claudeACPModeOption(configOptions []SessionConfigOption) (*SessionConfigOption, bool) {
	for i := range configOptions {
		if configOptions[i].ID == claudeACPModeConfigID && configOptions[i].Type == "select" {
			return &configOptions[i], true
		}
	}
	return nil, false
}

func sessionConfigOptionValueExists(values []SessionConfigOptionValue, value string) bool {
	for _, item := range values {
		if item.Value == value {
			return true
		}
		if sessionConfigOptionValueExists(item.Options, value) {
			return true
		}
	}
	return false
}

func (a AgentConfig) supportsPermissionMode(mode string) bool {
	for _, item := range a.PermissionModes {
		if item.ID == mode {
			return true
		}
	}
	return false
}

func (a AgentConfig) defaultLaunchProfileKeyForPermissionMode(mode string) (string, bool) {
	profile, err := a.resolveLaunchProfile(mode, nil)
	if err != nil {
		return "", false
	}
	return profile.Key, true
}

func (a AgentConfig) resolveLaunchProfile(requestedPermissionMode string, values map[string]string) (ResolvedAgentLaunchProfile, error) {
	if values == nil {
		values = map[string]string{}
	}
	permission := strings.TrimSpace(values["permission"])
	if permission == "" {
		permission = strings.TrimSpace(requestedPermissionMode)
	}
	if permission == "" {
		permission = permissionManual
	}
	if !knownPermissionMode(permission) {
		return ResolvedAgentLaunchProfile{}, fmt.Errorf("unknown permission mode %q", permission)
	}
	if !a.supportsPermissionMode(permission) {
		return ResolvedAgentLaunchProfile{}, fmt.Errorf("%s does not support permission mode %q", a.Title, permission)
	}

	selected := map[string]string{"permission": permission}
	for _, control := range a.LaunchControls {
		if control.ID == "permission" {
			continue
		}
		value := values[control.ID]
		if strings.TrimSpace(value) == "" {
			value = control.DefaultValue
		}
		if !controlValueExists(control, value) {
			return ResolvedAgentLaunchProfile{}, fmt.Errorf("%s launch control %q does not support value %q", a.Title, control.ID, value)
		}
		selected[control.ID] = value
	}

	key := launchProfileKey(selected)
	for _, profile := range a.LaunchProfiles {
		if profile.Key == key {
			return ResolvedAgentLaunchProfile{
				ID:             profile.ID,
				Key:            profile.Key,
				PermissionMode: profile.PermissionMode,
				Summary:        profile.Summary,
			}, nil
		}
	}
	return ResolvedAgentLaunchProfile{}, fmt.Errorf("%s launch profile %q is not available", a.Title, key)
}

func controlValueExists(control AgentControl, value string) bool {
	for _, option := range control.Options {
		if option.Value == value {
			return true
		}
	}
	return false
}

func codexACPArgsForPermissionMode(baseArgs []string, mode string) ([]string, error) {
	args := append([]string{}, baseArgs...)
	switch mode {
	case permissionManual:
	case permissionFullAuto:
		args = append(args, "-c", "approval_policy=\"on-request\"", "-c", "sandbox_mode=\"workspace-write\"")
	case permissionYolo:
		args = append(args, "-c", "approval_policy=\"never\"", "-c", "sandbox_mode=\"danger-full-access\"")
	default:
		return nil, fmt.Errorf("unknown Codex permission mode %q", mode)
	}
	return args, nil
}

func codexACPArgsForLaunchProfile(baseArgs []string, values map[string]string) ([]string, error) {
	permission := values["permission"]
	if permission == "" {
		permission = permissionManual
	}
	args, err := codexACPArgsForPermissionMode(baseArgs, permission)
	if err != nil {
		return nil, err
	}
	reasoning := values["reasoning_effort"]
	if reasoning == "minimal" {
		reasoning = "low"
	}
	if values["response_mode"] == "fast" && reasoning != "low" {
		reasoning = "low"
	}
	if reasoning != "" && reasoning != "default" {
		args = append(args, "-c", fmt.Sprintf("model_reasoning_effort=\"%s\"", reasoning))
	}
	return args, nil
}

func codexLaunchControls() []AgentControl {
	return []AgentControl{
		permissionLaunchControl(codexPermissionModes()),
		{
			ID:           "reasoning_effort",
			Label:        "Reasoning",
			Description:  stringPtr("Controls model reasoning effort when the provider supports it"),
			Category:     "model",
			Scope:        "launch",
			Type:         "select",
			DefaultValue: "default",
			Options: []AgentControlValue{
				controlValue("default", "Provider default", "", ""),
				controlValue("low", "Low", "", ""),
				controlValue("medium", "Medium", "", ""),
				controlValue("high", "High", "", ""),
			},
		},
		{
			ID:           "response_mode",
			Label:        "Response mode",
			Description:  stringPtr("Prefers lower-latency behavior for new sessions"),
			Category:     "performance",
			Scope:        "launch",
			Type:         "select",
			DefaultValue: "standard",
			Options: []AgentControlValue{
				controlValue("standard", "Standard", "", ""),
				controlValue("fast", "Fast", "Uses low reasoning for lower latency", ""),
			},
		},
	}
}

func codexLaunchProfiles(baseArgs []string) []AgentLaunchProfile {
	controls := codexLaunchControls()
	var profiles []AgentLaunchProfile
	for _, permission := range []string{permissionManual, permissionFullAuto, permissionYolo} {
		for _, reasoning := range []string{"default", "minimal", "low", "medium", "high"} {
			for _, responseMode := range []string{"standard", "fast"} {
				values := map[string]string{
					"permission":       permission,
					"reasoning_effort": reasoning,
					"response_mode":    responseMode,
				}
				key := launchProfileKey(values)
				args, _ := codexACPArgsForLaunchProfile(baseArgs, values)
				profiles = append(profiles, AgentLaunchProfile{
					ID:             key,
					Key:            key,
					PermissionMode: permission,
					Args:           args,
					Summary:        controlSummary(controls, values),
				})
			}
		}
	}
	return profiles
}

func permissionLaunchControl(modes []AgentPermissionMode) AgentControl {
	var values []AgentControlValue
	for _, mode := range modes {
		values = append(values, AgentControlValue{
			Value:       mode.ID,
			Label:       mode.Label,
			Description: stringPtr(mode.Description),
			RiskLevel:   stringPtr(mode.RiskLevel),
		})
	}
	return AgentControl{
		ID:           "permission",
		Label:        "Permission",
		Description:  stringPtr("Controls approval and sandbox posture for the launched runtime"),
		Category:     "permission",
		Scope:        "launch",
		Type:         "select",
		DefaultValue: permissionManual,
		Options:      values,
	}
}

func controlValue(value, label, description, riskLevel string) AgentControlValue {
	var desc *string
	var risk *string
	if description != "" {
		desc = stringPtr(description)
	}
	if riskLevel != "" {
		risk = stringPtr(riskLevel)
	}
	return AgentControlValue{Value: value, Label: label, Description: desc, RiskLevel: risk}
}

func launchProfileKey(values map[string]string) string {
	keys := make([]string, 0, len(values))
	for key, value := range values {
		if strings.TrimSpace(value) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+values[key])
	}
	return strings.Join(parts, ";")
}

func controlSummary(controls []AgentControl, values map[string]string) []AgentControlSelection {
	var summary []AgentControlSelection
	for _, control := range controls {
		value, ok := values[control.ID]
		if !ok {
			continue
		}
		for _, option := range control.Options {
			if option.Value == value {
				summary = append(summary, AgentControlSelection{
					ID:         control.ID,
					Label:      control.Label,
					Value:      value,
					ValueLabel: option.Label,
					Category:   control.Category,
					Scope:      control.Scope,
					RiskLevel:  option.RiskLevel,
				})
				break
			}
		}
	}
	return summary
}

func manualPermissionMode() AgentPermissionMode {
	return AgentPermissionMode{ID: permissionManual, Label: "Manual", Description: "Ask before approval-managed actions", RiskLevel: "low"}
}

func codexPermissionModes() []AgentPermissionMode {
	return []AgentPermissionMode{
		manualPermissionMode(),
		{ID: permissionFullAuto, Label: "Full auto", Description: "Sandboxed automatic execution", RiskLevel: "medium"},
		{ID: permissionYolo, Label: "YOLO", Description: "No approvals / no sandbox", RiskLevel: "high"},
	}
}

func knownPermissionMode(value string) bool {
	return value == permissionManual || value == permissionFullAuto || value == permissionYolo
}

func userHomeDir() (string, error) {
	if home := os.Getenv("USERPROFILE"); home != "" {
		return home, nil
	}
	if drive, path := os.Getenv("HOMEDRIVE"), os.Getenv("HOMEPATH"); drive != "" && path != "" {
		return drive + path, nil
	}
	if home := os.Getenv("HOME"); home != "" {
		return home, nil
	}
	return "", errors.New("failed to resolve user home directory; pass --work-dir or set ACP_WEBUI_WORK_DIR")
}
