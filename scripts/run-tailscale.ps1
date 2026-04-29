<#
.SYNOPSIS
Builds acp-webui and runs the embedded release binary bound to Tailscale IPv4.

.DESCRIPTION
This script detects the local Tailscale IPv4 address, builds the frontend and
release binary with embedded frontend assets, then starts acp-webui in the
foreground with --bind-host set to that Tailscale address.

It refuses non-Tailscale IPv4 addresses so the server does not accidentally
listen on a LAN interface or 0.0.0.0.
#>
[CmdletBinding()]
param(
    [string]$TailscaleIp,
    [int]$Port = 7635,
    [switch]$SkipBuild,
    [switch]$InstallFrontendDeps,
    [switch]$StopExisting,
    [switch]$NoRun,
    [string]$WorkDir,
    [string]$PairingToken,
    [string]$CodexAcpCommand = "codex-acp",
    [string[]]$CodexAcpArgs = @(),
    # Kept for compatibility with older usage; Claude is available by default and starts lazily.
    [switch]$EnableClaude,
    [string]$ClaudeAcpCommand = "npx",
    [string[]]$ClaudeAcpArgs = @(),
    [string[]]$TrustedClients = @()
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$WindowsBinary = Join-Path $RepoRoot "target\release\acp-webui.exe"
$UnixBinary = Join-Path $RepoRoot "target\release\acp-webui"

function Test-TailscaleIPv4 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Address
    )

    $Parsed = [System.Net.IPAddress]::None
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$Parsed)) {
        return $false
    }

    $Bytes = $Parsed.GetAddressBytes()
    return $Bytes.Length -eq 4 -and $Bytes[0] -eq 100 -and $Bytes[1] -ge 64 -and $Bytes[1] -le 127
}

function Get-TailscaleIPv4 {
    param(
        [string]$RequestedIp
    )

    if (-not [string]::IsNullOrWhiteSpace($RequestedIp)) {
        $Candidate = $RequestedIp.Trim()
        if (-not (Test-TailscaleIPv4 $Candidate)) {
            throw "$Candidate is not in the Tailscale IPv4 range 100.64.0.0/10; refusing to bind."
        }
        return $Candidate
    }

    $TailscaleCommand = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($null -ne $TailscaleCommand) {
        try {
            $CommandIps = & $TailscaleCommand.Source ip -4 2>$null
            foreach ($Ip in $CommandIps) {
                $Candidate = "$Ip".Trim()
                if (Test-TailscaleIPv4 $Candidate) {
                    return $Candidate
                }
            }
        } catch {
            Write-Verbose "tailscale ip -4 failed: $($_.Exception.Message)"
        }
    }

    try {
        $AdapterIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.InterfaceAlias -match "Tailscale" -and (Test-TailscaleIPv4 $_.IPAddress) } |
            Select-Object -ExpandProperty IPAddress

        foreach ($Ip in $AdapterIps) {
            $Candidate = "$Ip".Trim()
            if (Test-TailscaleIPv4 $Candidate) {
                return $Candidate
            }
        }
    } catch {
        Write-Verbose "Get-NetIPAddress fallback failed: $($_.Exception.Message)"
    }

    throw "Could not find a local Tailscale IPv4 address. Start Tailscale or pass -TailscaleIp 100.x.y.z."
}

function Get-ReleaseBinary {
    if (Test-Path $WindowsBinary) {
        return $WindowsBinary
    }

    if (Test-Path $UnixBinary) {
        return $UnixBinary
    }

    throw "Release binary not found. Run without -SkipBuild first."
}

function Get-RunningBinaryProcesses {
    param(
        [string]$BinaryPath
    )

    if (-not (Test-Path $BinaryPath)) {
        return @()
    }

    $ExpectedPath = [System.IO.Path]::GetFullPath($BinaryPath)
    return @(Get-Process -Name "acp-webui" -ErrorAction SilentlyContinue | Where-Object {
        try {
            $ProcessPath = $_.Path
            -not [string]::IsNullOrWhiteSpace($ProcessPath) -and
                [System.IO.Path]::GetFullPath($ProcessPath) -eq $ExpectedPath
        } catch {
            $false
        }
    })
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

$BindHost = Get-TailscaleIPv4 $TailscaleIp

if (Test-Path $WindowsBinary) {
    $Running = Get-RunningBinaryProcesses $WindowsBinary
    if ($Running.Count -gt 0) {
        if ($StopExisting) {
            foreach ($Process in $Running) {
                Write-Host "Stopping existing acp-webui release process $($Process.Id)..."
                Stop-Process -Id $Process.Id -Force
                $Process.WaitForExit()
            }
        } elseif (-not $SkipBuild) {
            $Ids = ($Running | ForEach-Object { $_.Id }) -join ", "
            throw "acp-webui release binary is already running (PID: $Ids) and may lock the rebuild. Stop it, pass -StopExisting, or use -SkipBuild."
        } else {
            $Ids = ($Running | ForEach-Object { $_.Id }) -join ", "
            Write-Warning "Existing acp-webui release process is running (PID: $Ids). The selected port may already be in use."
        }
    }
}

if (-not $SkipBuild) {
    if ($InstallFrontendDeps -or -not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        Write-Host "Installing frontend dependencies..."
        Push-Location $FrontendDir
        try {
            npm install
        } finally {
            Pop-Location
        }
    }

    Write-Host "Building frontend..."
    Push-Location $FrontendDir
    try {
        npm run build
    } finally {
        Pop-Location
    }

    Write-Host "Building embedded release binary..."
    Push-Location $RepoRoot
    try {
        cargo build --release --features embedded-frontend
    } finally {
        Pop-Location
    }
}

$Binary = Get-ReleaseBinary
$RunArgs = @(
    "--bind-host", $BindHost,
    "--bind-port", "$Port",
    "--codex-acp-command", $CodexAcpCommand
)

if (-not [string]::IsNullOrWhiteSpace($WorkDir)) {
    $RunArgs += @("--work-dir", $WorkDir)
}

foreach ($Arg in $CodexAcpArgs) {
    $RunArgs += @("--codex-acp-arg", $Arg)
}

$RunArgs += @("--claude-acp-command", $ClaudeAcpCommand)

foreach ($Arg in $ClaudeAcpArgs) {
    $RunArgs += @("--claude-acp-arg", $Arg)
}

if (-not [string]::IsNullOrWhiteSpace($PairingToken)) {
    $RunArgs += @("--pairing-token", $PairingToken)
}

foreach ($Client in $TrustedClients) {
    $RunArgs += @("--trusted-client", $Client)
}

$Url = "http://$BindHost`:$Port"
Write-Host "Tailscale bind address: $BindHost"
Write-Host "Serving URL: $Url"
Write-Host "Pairing-token auth remains enabled unless clients match explicit -TrustedClients."
Write-Host "Command:"
Write-Host ("  " + (Format-CommandForDisplay $Binary $RunArgs))

if ($NoRun) {
    Write-Host "NoRun set; build and command preparation complete."
    return
}

Write-Host "Starting acp-webui in the foreground. Press Ctrl+C to stop."
& $Binary @RunArgs
