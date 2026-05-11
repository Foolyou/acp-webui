param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("acp-webui-smoke-" + [System.Guid]::NewGuid().ToString("N"))
$WorkDir = Join-Path $TempRoot "state"
$Stdout = Join-Path $TempRoot "stdout.log"
$Stderr = Join-Path $TempRoot "stderr.log"
$Process = $null

function Get-FreePort {
    $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
    $Listener.Start()
    try {
        return $Listener.LocalEndpoint.Port
    } finally {
        $Listener.Stop()
    }
}

try {
    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null

    if (-not $SkipBuild) {
        Push-Location (Join-Path $RepoRoot "frontend")
        try {
            npm run build
        } finally {
            Pop-Location
        }

        Push-Location $RepoRoot
        try {
            go build -tags embedded_frontend -o (Join-Path $RepoRoot "target\release\acp-webui.exe") .
        } finally {
            Pop-Location
        }
    }

    $Binary = Join-Path $RepoRoot "target\release\acp-webui.exe"
    if (-not (Test-Path $Binary)) {
        throw "Release binary not found at $Binary"
    }

    $Port = Get-FreePort
    $Process = Start-Process `
        -FilePath $Binary `
        -ArgumentList @(
            "--bind-host", "127.0.0.1",
            "--bind-port", "$Port",
            "--work-dir", $WorkDir,
            "--codex-acp-command", "__acp_webui_smoke_missing_acp__"
        ) `
        -WorkingDirectory $TempRoot `
        -RedirectStandardOutput $Stdout `
        -RedirectStandardError $Stderr `
        -WindowStyle Hidden `
        -PassThru

    $BaseUrl = "http://127.0.0.1:$Port"
    $Index = $null
    for ($Attempt = 0; $Attempt -lt 50; $Attempt++) {
        if ($Process.HasExited) {
            throw "acp-webui exited before serving HTTP"
        }

        try {
            $Index = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing
            break
        } catch {
            Start-Sleep -Milliseconds 200
        }
    }

    if ($null -eq $Index) {
        throw "Timed out waiting for acp-webui at $BaseUrl"
    }

    if ($Index.Content -notmatch '<div id="app"></div>') {
        throw "Embedded frontend index did not contain the React app root"
    }

    $AssetMatch = [regex]::Match($Index.Content, '(?:src|href)="([^"]+\.(?:js|css))"')
    if (-not $AssetMatch.Success) {
        throw "Embedded frontend index did not reference a JavaScript or CSS asset"
    }

    $AssetPath = $AssetMatch.Groups[1].Value
    $Asset = Invoke-WebRequest -Uri "$BaseUrl$AssetPath" -UseBasicParsing
    if ($Asset.StatusCode -ne 200) {
        throw "Embedded frontend asset $AssetPath returned $($Asset.StatusCode)"
    }

    $Spa = Invoke-WebRequest -Uri "$BaseUrl/sessions/example" -UseBasicParsing
    if ($Spa.Content -notmatch '<div id="app"></div>') {
        throw "SPA fallback did not return the embedded frontend index"
    }

    Write-Host "Embedded frontend smoke test passed at $BaseUrl"
} finally {
    if ($null -ne $Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force
        $Process.WaitForExit()
    }
}
