package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

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
