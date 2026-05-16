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
		"-PairingToken",
		"test-token",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("detached restart dry run failed: %v\n%s", err, output)
	}
	text := string(output)
	if !strings.Contains(text, filepath.Join("scripts", "build-run-release.ps1")) {
		t.Fatalf("dry-run output did not delegate to build-run-release.ps1:\n%s", text)
	}
	if !strings.Contains(text, "-BindPort 7635") || !strings.Contains(text, "-PairingToken test-token") {
		t.Fatalf("dry-run output did not preserve delegated args:\n%s", text)
	}
}

func TestBuildRunReleaseRetriesConfiguredPortRelease(t *testing.T) {
	data, err := os.ReadFile(`scripts\build-run-release.ps1`)
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
