<#
.SYNOPSIS
Starts or restarts ACP Web UI dev services on the local Tailscale IPv4.

.DESCRIPTION
This script detects the local Tailscale IPv4 address, stops existing listeners
on the configured frontend and backend dev ports, then starts:

- backend dev server:  http://<tailscale-ip>:7635
- frontend Vite dev:  http://<tailscale-ip>:5777

The frontend dev server proxies /api and /api/ws to the backend through
ACP_WEBUI_BACKEND_URL so browser access through Tailscale keeps Vite hot reload.
#>
[CmdletBinding()]
param(
    [string]$TailscaleIp,
    [int]$FrontendPort = 5777,
    [int]$BackendPort = 7635,
    [int]$ReleaseTimeoutSeconds = 20,
    [int]$StartupTimeoutSeconds = 180,
    [switch]$InstallFrontendDeps,
    [switch]$NoRun,
    [string]$WorkDir,
    [string]$PairingToken,
    [string]$CodexAcpCommand = "codex-acp",
    [string[]]$CodexAcpArgs = @(),
    [string]$ClaudeAcpCommand = "npx",
    [string[]]$ClaudeAcpArgs = @(),
    [string[]]$TrustedClients = @()
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$LogDir = Join-Path $RepoRoot ".data\dev-tailscale"
$BackendOut = Join-Path $LogDir "backend.out.log"
$BackendErr = Join-Path $LogDir "backend.err.log"
$FrontendOut = Join-Path $LogDir "frontend.out.log"
$FrontendErr = Join-Path $LogDir "frontend.err.log"

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

function Stop-PortListeners {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [string]$BindHost
    )

    $Connections = @(Get-PortListenConnections -Port $Port -BindHost $BindHost)
    $ProcessIds = @($Connections | ForEach-Object { $_.OwningProcess } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)

    foreach ($ProcessId in $ProcessIds) {
        Stop-ProcessTreeById $ProcessId
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
    throw "Port $BindHost`:$Port is still listening after $TimeoutSeconds seconds ($Summary)."
}

function Wait-ForHttpOk {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $Response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
            if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) {
                return
            }
        } catch {
            Write-Verbose "Waiting for ${Url}: $($_.Exception.Message)"
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $Deadline)

    throw "Timed out waiting for $Url."
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

function Resolve-StartProcessCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $Command = Get-Command $Name -ErrorAction Stop
    $Source = $Command.Source
    if ([string]::IsNullOrWhiteSpace($Source)) {
        return $Name
    }

    if ([System.IO.Path]::GetExtension($Source) -eq ".ps1") {
        $CmdShim = Join-Path (Split-Path -Parent $Source) "$Name.cmd"
        if (Test-Path $CmdShim) {
            return $CmdShim
        }
    }

    return $Source
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$BindHost = Get-TailscaleIPv4 $TailscaleIp
$BackendUrl = "http://$BindHost`:$BackendPort"
$FrontendUrl = "http://$BindHost`:$FrontendPort"
$CargoCommand = Resolve-StartProcessCommand "cargo"
$NpmCommand = Resolve-StartProcessCommand "npm"

Write-Host "Tailscale bind address: $BindHost"
Write-Host "Restarting dev services..."

Stop-PortListeners -Port $FrontendPort -BindHost $BindHost
Stop-PortListeners -Port $BackendPort -BindHost $BindHost
Wait-ForPortRelease -Port $FrontendPort -BindHost $BindHost -TimeoutSeconds $ReleaseTimeoutSeconds
Wait-ForPortRelease -Port $BackendPort -BindHost $BindHost -TimeoutSeconds $ReleaseTimeoutSeconds

if ($NoRun) {
    Write-Host "NoRun set; ports are free."
    return
}

if ($InstallFrontendDeps -or -not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    Push-Location $FrontendDir
    try {
        npm install
    } finally {
        Pop-Location
    }
}

$BackendArgs = @(
    "run", "--",
    "--bind-host", $BindHost,
    "--bind-port", "$BackendPort",
    "--codex-acp-command", $CodexAcpCommand
)

if (-not [string]::IsNullOrWhiteSpace($WorkDir)) {
    $BackendArgs += @("--work-dir", $WorkDir)
}

foreach ($Arg in $CodexAcpArgs) {
    $BackendArgs += @("--codex-acp-arg", $Arg)
}

$BackendArgs += @("--claude-acp-command", $ClaudeAcpCommand)
foreach ($Arg in $ClaudeAcpArgs) {
    $BackendArgs += @("--claude-acp-arg", $Arg)
}

if (-not [string]::IsNullOrWhiteSpace($PairingToken)) {
    $BackendArgs += @("--pairing-token", $PairingToken)
}

foreach ($Client in $TrustedClients) {
    $BackendArgs += @("--trusted-client", $Client)
}

$FrontendArgs = @("run", "dev", "--", "--host", $BindHost, "--port", "$FrontendPort", "--strictPort")

Write-Host "Backend command:"
Write-Host ("  " + (Format-CommandForDisplay $CargoCommand $BackendArgs))
Write-Host "Frontend command:"
Write-Host ("  ACP_WEBUI_BACKEND_URL=$BackendUrl " + (Format-CommandForDisplay $NpmCommand $FrontendArgs))

$BackendProcess = Start-Process `
    -FilePath $CargoCommand `
    -ArgumentList $BackendArgs `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $BackendOut `
    -RedirectStandardError $BackendErr `
    -WindowStyle Hidden `
    -PassThru

$PreviousBackendUrl = $env:ACP_WEBUI_BACKEND_URL
$env:ACP_WEBUI_BACKEND_URL = $BackendUrl
try {
    $FrontendProcess = Start-Process `
        -FilePath $NpmCommand `
        -ArgumentList $FrontendArgs `
        -WorkingDirectory $FrontendDir `
        -RedirectStandardOutput $FrontendOut `
        -RedirectStandardError $FrontendErr `
        -WindowStyle Hidden `
        -PassThru
} finally {
    $env:ACP_WEBUI_BACKEND_URL = $PreviousBackendUrl
}

Wait-ForHttpOk -Url "$BackendUrl/api/auth/status" -TimeoutSeconds $StartupTimeoutSeconds
Wait-ForHttpOk -Url $FrontendUrl -TimeoutSeconds $StartupTimeoutSeconds

Write-Host "Backend dev server:  $BackendUrl"
Write-Host "Frontend dev server: $FrontendUrl"
Write-Host "Backend PID:  $($BackendProcess.Id)"
Write-Host "Frontend PID: $($FrontendProcess.Id)"
Write-Host "Logs:"
Write-Host "  Backend stdout:  $BackendOut"
Write-Host "  Backend stderr:  $BackendErr"
Write-Host "  Frontend stdout: $FrontendOut"
Write-Host "  Frontend stderr: $FrontendErr"
