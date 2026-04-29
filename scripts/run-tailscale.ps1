<#
.SYNOPSIS
Builds acp-webui and runs the embedded release binary bound to Tailscale IPv4.

.DESCRIPTION
This script detects the local Tailscale IPv4 address, builds the frontend and
release binary with embedded frontend assets, then starts acp-webui in the
foreground with --bind-host set to that Tailscale address.

It refuses non-Tailscale IPv4 addresses so the server does not accidentally
listen on a LAN interface or 0.0.0.0. It always binds port 7635.
#>
[CmdletBinding()]
param(
    [string]$TailscaleIp,
    [int]$ReleaseTimeoutSeconds = 30,
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
$Port = 7635

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

function Get-PortListenConnections {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [string]$BindHost
    )

    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Where-Object {
            $_.LocalAddress -eq $BindHost -or
                $_.LocalAddress -eq "0.0.0.0" -or
                $_.LocalAddress -eq "::"
        })
    } catch {
        Write-Verbose "Get-NetTCPConnection failed: $($_.Exception.Message)"
        return @()
    }
}

function Format-PortListenConnections {
    param(
        [object[]]$Connections
    )

    if ($Connections.Count -eq 0) {
        return "none"
    }

    return ($Connections | ForEach-Object {
        "$($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)"
    } | Sort-Object -Unique) -join ", "
}

function Get-DescendantProcessIds {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ProcessId
    )

    try {
        $Processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    } catch {
        Write-Verbose "Failed to enumerate processes: $($_.Exception.Message)"
        return @()
    }

    $ChildrenByParent = @{}
    foreach ($Process in $Processes) {
        $ParentId = [int]$Process.ParentProcessId
        if (-not $ChildrenByParent.ContainsKey($ParentId)) {
            $ChildrenByParent[$ParentId] = @()
        }
        $ChildrenByParent[$ParentId] += [int]$Process.ProcessId
    }

    $Descendants = New-Object System.Collections.Generic.List[int]
    $Stack = New-Object System.Collections.Generic.Stack[int]
    $Stack.Push($ProcessId)

    while ($Stack.Count -gt 0) {
        $Current = $Stack.Pop()
        if (-not $ChildrenByParent.ContainsKey($Current)) {
            continue
        }

        foreach ($ChildId in $ChildrenByParent[$Current]) {
            if ($Descendants.Contains($ChildId)) {
                continue
            }

            $Descendants.Add($ChildId)
            $Stack.Push($ChildId)
        }
    }

    return @($Descendants)
}

function Stop-ProcessTreeById {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ProcessId
    )

    if ($ProcessId -le 0) {
        return
    }

    $DescendantIds = @(Get-DescendantProcessIds $ProcessId)
    $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -ne $Process) {
        Write-Host "Stopping process $ProcessId ($($Process.ProcessName))..."
    } else {
        Write-Warning "Port listener reports PID $ProcessId, but the process is not visible; attempting taskkill fallback..."
    }

    $Targets = @()
    $Targets += $DescendantIds
    $Targets += $ProcessId
    $Targets = @($Targets | Where-Object { $_ -gt 0 } | Select-Object -Unique)

    $Taskkill = Get-Command taskkill.exe -ErrorAction SilentlyContinue
    foreach ($TargetId in $Targets) {
        $Target = Get-Process -Id $TargetId -ErrorAction SilentlyContinue
        if ($null -ne $Target -and $TargetId -ne $ProcessId) {
            Write-Host "Stopping child process $TargetId ($($Target.ProcessName))..."
        }

        if ($null -ne $Taskkill) {
            $PreviousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            try {
                $Output = & $Taskkill.Source /PID $TargetId /F /T 2>&1
                $TaskkillExitCode = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $PreviousErrorActionPreference
            }

            foreach ($Line in $Output) {
                Write-Verbose $Line
            }

            if ($TaskkillExitCode -eq 0) {
                continue
            }
        }

        if ($null -ne $Target) {
            Stop-Process -Id $TargetId -Force -ErrorAction SilentlyContinue
            try {
                $Target.WaitForExit(10000) | Out-Null
            } catch {
                Write-Verbose "WaitForExit failed for PID ${TargetId}: $($_.Exception.Message)"
            }
        }
    }
}

function Wait-ForPortRelease {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [string]$BindHost,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $Connections = @(Get-PortListenConnections -Port $Port -BindHost $BindHost)
        if ($Connections.Count -eq 0) {
            return
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $Deadline)

    $Connections = @(Get-PortListenConnections -Port $Port -BindHost $BindHost)
    $Summary = Format-PortListenConnections $Connections
    throw "Port $BindHost`:$Port is still listening after $TimeoutSeconds seconds ($Summary). Close the remaining listener or retry after Windows releases the socket."
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

$Running = @()
if (Test-Path $WindowsBinary) {
    $Running = @(Get-RunningBinaryProcesses $WindowsBinary)
}

$PortListeners = @(Get-PortListenConnections -Port $Port -BindHost $BindHost)

if ($StopExisting) {
    $ProcessIds = @()
    $ProcessIds += $PortListeners | ForEach-Object { $_.OwningProcess }
    $ProcessIds += $Running | ForEach-Object { $_.Id }
    $ProcessIds = @($ProcessIds | Where-Object { $_ -gt 0 } | Sort-Object -Unique)

    foreach ($ProcessId in $ProcessIds) {
        Stop-ProcessTreeById $ProcessId
    }

    Wait-ForPortRelease -Port $Port -BindHost $BindHost -TimeoutSeconds $ReleaseTimeoutSeconds
} else {
    if ($PortListeners.Count -gt 0) {
        $Summary = Format-PortListenConnections $PortListeners
        throw "Port $BindHost`:$Port is already in use ($Summary). Stop it or pass -StopExisting."
    }

    if ($Running.Count -gt 0) {
        if (-not $SkipBuild) {
            $Ids = ($Running | ForEach-Object { $_.Id }) -join ", "
            throw "acp-webui release binary is already running (PID: $Ids) and may lock the rebuild. Stop it, pass -StopExisting, or use -SkipBuild."
        }

        $Ids = ($Running | ForEach-Object { $_.Id }) -join ", "
        Write-Warning "Existing acp-webui release process is running (PID: $Ids)."
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
