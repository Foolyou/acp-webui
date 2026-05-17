package main

import (
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func clearTranscriptionEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"ACP_WEBUI_TRANSCRIPTION_PROVIDER",
		"ACP_WEBUI_TRANSCRIPTION_BASE_URL",
		"ACP_WEBUI_TRANSCRIPTION_API_KEY",
		"ACP_WEBUI_TRANSCRIPTION_MODEL",
		"ACP_WEBUI_TRANSCRIPTION_LANGUAGE",
		"ACP_WEBUI_TRANSCRIPTION_TIMEOUT_SECONDS",
		"ACP_WEBUI_TRANSCRIPTION_MAX_AUDIO_MB",
	} {
		t.Setenv(key, "")
	}
}

func TestConfigWorkDirOverrideChangesDefaultDatabase(t *testing.T) {
	config, err := parseConfig([]string{"--work-dir", "custom-state"})
	if err != nil {
		t.Fatal(err)
	}
	want := "sqlite://" + filepath.Join("custom-state", defaultDatabaseFile)
	if config.WorkDir != "custom-state" {
		t.Fatalf("WorkDir = %q, want custom-state", config.WorkDir)
	}
	if config.DatabaseURL != want {
		t.Fatalf("DatabaseURL = %q, want %q", config.DatabaseURL, want)
	}
}

func TestTranscriptionConfigDefaultsToDisabled(t *testing.T) {
	clearTranscriptionEnv(t)
	config, err := parseConfig(nil)
	if err != nil {
		t.Fatal(err)
	}
	if config.TranscriptionProvider != "" {
		t.Fatalf("TranscriptionProvider = %q, want disabled", config.TranscriptionProvider)
	}
	if config.TranscriptionAvailable() {
		t.Fatal("transcription should be unavailable without provider configuration")
	}
	if config.TranscriptionMaxAudioBytes != 25*1024*1024 {
		t.Fatalf("TranscriptionMaxAudioBytes = %d, want 25 MiB", config.TranscriptionMaxAudioBytes)
	}
	if config.TranscriptionTimeout != 60*time.Second {
		t.Fatalf("TranscriptionTimeout = %s, want 60s", config.TranscriptionTimeout)
	}
}

func TestTranscriptionConfigDefaultsToMultilingualModelWhenEnabled(t *testing.T) {
	clearTranscriptionEnv(t)
	config, err := parseConfig([]string{
		"--transcription-provider", "openai-compatible",
		"--transcription-base-url", "http://127.0.0.1:7322/v1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if config.TranscriptionModel != "Systran/faster-whisper-large-v3" {
		t.Fatalf("TranscriptionModel = %q, want multilingual large-v3", config.TranscriptionModel)
	}
}

func TestTranscriptionConfigParsesOpenAICompatibleProvider(t *testing.T) {
	clearTranscriptionEnv(t)
	config, err := parseConfig([]string{
		"--transcription-provider", "openai-compatible",
		"--transcription-base-url", "http://127.0.0.1:7322/v1",
		"--transcription-api-key", "secret",
		"--transcription-model", "Systran/faster-distil-whisper-large-v3",
		"--transcription-language", "zh",
		"--transcription-timeout-seconds", "12",
		"--transcription-max-audio-mb", "7",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !config.TranscriptionAvailable() {
		t.Fatal("transcription should be available when provider and base URL are configured")
	}
	if config.TranscriptionProvider != "openai-compatible" || config.TranscriptionBaseURL != "http://127.0.0.1:7322/v1" {
		t.Fatalf("transcription provider config = %#v", config)
	}
	if config.TranscriptionAPIKey != "secret" {
		t.Fatalf("TranscriptionAPIKey = %q", config.TranscriptionAPIKey)
	}
	if config.TranscriptionModel != "Systran/faster-distil-whisper-large-v3" || config.TranscriptionLanguage != "zh" {
		t.Fatalf("transcription model/language = %q/%q", config.TranscriptionModel, config.TranscriptionLanguage)
	}
	if config.TranscriptionTimeout != 12*time.Second {
		t.Fatalf("TranscriptionTimeout = %s, want 12s", config.TranscriptionTimeout)
	}
	if config.TranscriptionMaxAudioBytes != 7*1024*1024 {
		t.Fatalf("TranscriptionMaxAudioBytes = %d, want 7 MiB", config.TranscriptionMaxAudioBytes)
	}
}

func TestTranscriptionConfigRejectsInvalidValues(t *testing.T) {
	clearTranscriptionEnv(t)
	cases := [][]string{
		{"--transcription-provider", "openai-compatible"},
		{"--transcription-provider", "unknown", "--transcription-base-url", "http://127.0.0.1:7322/v1"},
		{"--transcription-provider", "openai-compatible", "--transcription-base-url", "http://127.0.0.1:7322/v1", "--transcription-timeout-seconds", "0"},
		{"--transcription-provider", "openai-compatible", "--transcription-base-url", "http://127.0.0.1:7322/v1", "--transcription-max-audio-mb", "0"},
	}
	for _, args := range cases {
		if _, err := parseConfig(args); err == nil {
			t.Fatalf("parseConfig(%v) succeeded, want error", args)
		}
	}
}

func TestCodexACPArgsForPermissionModes(t *testing.T) {
	fullAuto, err := codexACPArgsForPermissionMode([]string{"base"}, permissionFullAuto)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(fullAuto, []string{"base", "-c", "approval_policy=\"on-request\"", "-c", "sandbox_mode=\"workspace-write\""}) {
		t.Fatalf("full auto args = %#v", fullAuto)
	}
	yolo, err := codexACPArgsForPermissionMode(nil, permissionYolo)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(yolo, []string{"-c", "approval_policy=\"never\"", "-c", "sandbox_mode=\"danger-full-access\""}) {
		t.Fatalf("yolo args = %#v", yolo)
	}
}

func TestCodexACPArgsForLaunchProfileUsesLowReasoningForFastMode(t *testing.T) {
	args, err := codexACPArgsForLaunchProfile([]string{"base"}, map[string]string{
		"response_mode": "fast",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"base", "-c", "model_reasoning_effort=\"low\""}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("fast mode args = %#v, want %#v", args, want)
	}
}

func TestCodexACPArgsForLaunchProfileMapsLegacyMinimalReasoningToLow(t *testing.T) {
	args, err := codexACPArgsForLaunchProfile(nil, map[string]string{
		"reasoning_effort": "minimal",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"-c", "model_reasoning_effort=\"low\""}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("legacy minimal args = %#v, want %#v", args, want)
	}
}

func TestCodexLaunchControlsHideMinimalReasoning(t *testing.T) {
	for _, control := range codexLaunchControls() {
		if control.ID != "reasoning_effort" {
			continue
		}
		if controlValueExists(control, "minimal") {
			t.Fatal("minimal reasoning should not be exposed as a launch control")
		}
		return
	}
	t.Fatal("reasoning_effort launch control not found")
}

func TestResolveLaunchProfileValidatesControls(t *testing.T) {
	agent := codexAgentConfig("codex-acp", nil, true)
	profile, err := agent.resolveLaunchProfile(permissionYolo, map[string]string{
		"reasoning_effort": "low",
		"response_mode":    "fast",
	})
	if err != nil {
		t.Fatal(err)
	}
	if profile.PermissionMode != permissionYolo {
		t.Fatalf("PermissionMode = %q", profile.PermissionMode)
	}
	if _, err := agent.resolveLaunchProfile(permissionManual, map[string]string{"reasoning_effort": "invalid"}); err == nil {
		t.Fatal("expected invalid launch control value to fail")
	}
}

func TestClaudeAgentConfigAdvertisesVerifiedPermissionModes(t *testing.T) {
	agent := claudeAgentConfig("claude-acp", []string{"--stdio"}, true)
	var modeIDs []string
	for _, mode := range agent.PermissionModes {
		modeIDs = append(modeIDs, mode.ID)
	}
	if !reflect.DeepEqual(modeIDs, []string{permissionManual, permissionYolo}) {
		t.Fatalf("Claude permission modes = %#v, want manual and yolo only", modeIDs)
	}
	if agent.supportsPermissionMode(permissionFullAuto) {
		t.Fatal("Claude should not advertise full_auto")
	}

	manual, err := agent.resolveLaunchProfile(permissionManual, nil)
	if err != nil {
		t.Fatal(err)
	}
	if manual.PermissionMode != permissionManual || manual.Key != "permission=manual" {
		t.Fatalf("manual profile = %#v", manual)
	}
	yolo, err := agent.resolveLaunchProfile(permissionYolo, nil)
	if err != nil {
		t.Fatal(err)
	}
	if yolo.PermissionMode != permissionYolo || yolo.Key != "permission=yolo" {
		t.Fatalf("yolo profile = %#v", yolo)
	}
	if _, err := agent.resolveLaunchProfile(permissionFullAuto, nil); err == nil {
		t.Fatal("expected full_auto profile resolution to fail")
	}
}

func TestClaudeACPModeForPermissionMode(t *testing.T) {
	cases := map[string]string{
		permissionManual: "default",
		permissionYolo:   "bypassPermissions",
	}
	for permissionMode, want := range cases {
		got, err := claudeACPModeForPermissionMode(permissionMode)
		if err != nil {
			t.Fatalf("claudeACPModeForPermissionMode(%q): %v", permissionMode, err)
		}
		if got != want {
			t.Fatalf("claudeACPModeForPermissionMode(%q) = %q, want %q", permissionMode, got, want)
		}
	}
	if _, err := claudeACPModeForPermissionMode(permissionFullAuto); err == nil {
		t.Fatal("expected full_auto mapping to fail")
	}
}
