package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRestartReleaseDetachedNoRunDelegatesToBuildRunRelease(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("PowerShell restart wrapper is Windows-specific")
	}
	powerShell := findPowerShell(t)
	scriptPath := filepath.Join("scripts", "restart-release-detached.ps1")
	cmd := exec.Command(powerShell,
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		scriptPath,
		"-NoRun",
		"-BindPort",
		"7635",
		"-CodexAcpCommand",
		"test-codex-acp",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("detached restart dry run failed: %v\n%s", err, output)
	}
	text := string(output)
	if !strings.Contains(text, filepath.Join("scripts", "build-run-release.ps1")) {
		t.Fatalf("dry-run output did not delegate to build-run-release.ps1:\n%s", text)
	}
	if !strings.Contains(text, "-BindPort 7635") || !strings.Contains(text, "-CodexAcpCommand test-codex-acp") {
		t.Fatalf("dry-run output did not preserve delegated args:\n%s", text)
	}
}

func TestRestartReleaseDetachedShellNoRunDelegatesToBuildRunRelease(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell restart wrapper is Unix-specific")
	}
	scriptPath := filepath.Join("scripts", "restart-release-detached.sh")
	cmd := exec.Command("bash",
		scriptPath,
		"--no-run",
		"--bind-port",
		"7635",
		"--codex-acp-command",
		"test-codex-acp",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("detached restart dry run failed: %v\n%s", err, output)
	}
	text := string(output)
	if !strings.Contains(text, filepath.Join("scripts", "build-run-release.sh")) {
		t.Fatalf("dry-run output did not delegate to build-run-release.sh:\n%s", text)
	}
	if !strings.Contains(text, "--bind-port 7635") || !strings.Contains(text, "--codex-acp-command test-codex-acp") {
		t.Fatalf("dry-run output did not preserve delegated args:\n%s", text)
	}
}

func TestBuildRunReleaseRetriesConfiguredPortRelease(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("scripts", "build-run-release.ps1"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.Contains(text, `[int]$PortReleaseRetries = 3`) {
		t.Fatalf("build-run-release.ps1 must default to 3 port release retries")
	}
	if !strings.Contains(text, "for ($Attempt = 1; $Attempt -le $PortReleaseRetries; $Attempt++)") {
		t.Fatalf("build-run-release.ps1 must retry port release on the same port")
	}
}

func TestBuildRunReleaseShellRetriesConfiguredPortRelease(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("scripts", "build-run-release.sh"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.Contains(text, `port_release_retries=3`) {
		t.Fatalf("build-run-release.sh must default to 3 port release retries")
	}
	if !strings.Contains(text, "for ((attempt = 1; attempt <= retries; attempt++))") {
		t.Fatalf("build-run-release.sh must retry port release on the same ports")
	}
}

func findPowerShell(t *testing.T) string {
	t.Helper()
	for _, name := range []string{"pwsh", "powershell"} {
		path, err := exec.LookPath(name)
		if err == nil {
			return path
		}
	}
	t.Skip("PowerShell is not available")
	return ""
}
