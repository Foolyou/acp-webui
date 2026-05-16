<#
.SYNOPSIS
Starts a detached ACP Web UI release restart.

.DESCRIPTION
Use this wrapper when the browser or agent session may be served by the release
process being restarted. The wrapper starts scripts/build-run-release.ps1 in a
separate PowerShell process and returns immediately, so the restart can continue
after the current Web UI connection drops.

All unrecognized arguments are forwarded to build-run-release.ps1.

.EXAMPLE
.\scripts\restart-release-detached.ps1

.EXAMPLE
.\scripts\restart-release-detached.ps1 -PairingToken <pairing-token> -CodexAcpCommand codex-acp
#>
[CmdletBinding()]
param(
    [string]$LogDir,
    [switch]$NoRun,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BuildRunArgs = @()
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BuildRunScript = Join-Path $PSScriptRoot "build-run-release.ps1"
if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $RepoRoot ".data\release-restart"
}

function Resolve-PowerShellExecutable {
    foreach ($Name in @("pwsh", "powershell")) {
        $Command = Get-Command $Name -ErrorAction SilentlyContinue
        if ($null -ne $Command -and -not [string]::IsNullOrWhiteSpace($Command.Source)) {
            return $Command.Source
        }
    }

    throw "PowerShell executable not found."
}

function Format-ArgumentForDisplay {
    param(
        [string]$Value
    )

    if ([string]::IsNullOrEmpty($Value)) {
        return '""'
    }

    if ($Value -match '[\s"`$&|;<>(){}\[\]]') {
        return '"' + ($Value -replace '"', '\"') + '"'
    }

    return $Value
}

function Format-CommandForDisplay {
    param(
        [string]$Executable,
        [string[]]$Arguments
    )

    return ((@($Executable) + $Arguments) | ForEach-Object { Format-ArgumentForDisplay $_ }) -join " "
}

if (-not (Test-Path -LiteralPath $BuildRunScript -PathType Leaf)) {
    throw "Release runner not found: $BuildRunScript"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$PowerShell = Resolve-PowerShellExecutable
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$WorkerOut = Join-Path $LogDir "restart-$Timestamp.out.log"
$WorkerErr = Join-Path $LogDir "restart-$Timestamp.err.log"
$WorkerArgs = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $BuildRunScript
) + $BuildRunArgs

Write-Host "Detached restart command:"
Write-Host ("  " + (Format-CommandForDisplay $PowerShell $WorkerArgs))
Write-Host "Logs:"
Write-Host "  stdout: $WorkerOut"
Write-Host "  stderr: $WorkerErr"

if ($NoRun) {
    Write-Host "NoRun set; detached restart was not started."
    return
}

$Process = Start-Process `
    -FilePath $PowerShell `
    -ArgumentList $WorkerArgs `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $WorkerOut `
    -RedirectStandardError $WorkerErr `
    -WindowStyle Hidden `
    -PassThru

Write-Host "Detached restart PID: $($Process.Id)"
