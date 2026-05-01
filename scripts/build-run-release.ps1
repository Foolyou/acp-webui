<#
.SYNOPSIS
Builds and runs the local single-binary release.

.DESCRIPTION
This script stops current ACP Web UI services started from this project, builds
the frontend and embedded release binary, then starts the release binary in the
background on the local machine.

By default it binds to 127.0.0.1. Pass -BindTailscale to resolve the local
Tailscale IPv4 address and bind only to that address, or pass -TailscaleIp with
an explicit 100.64.0.0/10 address.

The script always clears the configured backend release port and frontend dev
port before building so running dev services do not survive the release launch.
#>
[CmdletBinding()]
param(
    [string]$BindHost = "127.0.0.1",
    [Alias("Tailscale")]
    [switch]$BindTailscale,
    [string]$TailscaleIp,
    [int]$BindPort = 7635,
    [int]$FrontendPort = 5777,
    [int]$ReleaseTimeoutSeconds = 30,
    [int]$StartupTimeoutSeconds = 180,
    [switch]$SkipBuild,
    [switch]$InstallFrontendDeps,
    [switch]$NoRun,
    [switch]$NoStopExisting,
    [switch]$Foreground,
    [string]$WorkDir,
    [string]$PairingToken,
    [switch]$DisableAuth,
    [string]$CodexAcpCommand = "codex-acp",
    [string[]]$CodexAcpArgs = @(),
    [string]$ClaudeAcpCommand = "npx",
    [string[]]$ClaudeAcpArgs = @(),
    [string[]]$TrustedClients = @(),
    [string[]]$ExtraArgs = @()
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$LogDir = Join-Path $RepoRoot ".data\release"
$ReleaseOut = Join-Path $LogDir "acp-webui.out.log"
$ReleaseErr = Join-Path $LogDir "acp-webui.err.log"
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

function Test-LoopbackBindHost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Address
    )

    $Parsed = [System.Net.IPAddress]::None
    return [System.Net.IPAddress]::TryParse($Address, [ref]$Parsed) -and [System.Net.IPAddress]::IsLoopback($Parsed)
}

function Test-WildcardBindHost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Address
    )

    return $Address -eq "0.0.0.0" -or $Address -eq "::" -or $Address -eq "[::]" -or $Address -eq "*"
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
    if (Test-Path -LiteralPath $WindowsBinary -PathType Leaf) {
        return $WindowsBinary
    }

    if (Test-Path -LiteralPath $UnixBinary -PathType Leaf) {
        return $UnixBinary
    }

    throw "Release binary not found. Run without -SkipBuild first."
}

function Get-PortListenConnections {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [string]$BindHost,
        [switch]$AllAddresses
    )

    try {
        $Connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    } catch {
        Write-Verbose "Get-NetTCPConnection failed: $($_.Exception.Message)"
        return @()
    }

    if ($AllAddresses -or (Test-WildcardBindHost $BindHost)) {
        return $Connections
    }

    return @($Connections | Where-Object {
        $_.LocalAddress -eq $BindHost -or
            $_.LocalAddress -eq "0.0.0.0" -or
            $_.LocalAddress -eq "::"
    })
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

    if ($ProcessId -le 0 -or $ProcessId -eq $PID) {
        return
    }

    $DescendantIds = @(Get-DescendantProcessIds $ProcessId)
    $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -ne $Process) {
        Write-Host "Stopping process $ProcessId ($($Process.ProcessName))..."
    } else {
        Write-Warning "Listener reports PID $ProcessId, but the process is not visible; attempting taskkill fallback..."
    }

    $Targets = @()
    $Targets += $DescendantIds
    $Targets += $ProcessId
    $Targets = @($Targets | Where-Object { $_ -gt 0 -and $_ -ne $PID } | Select-Object -Unique)

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
        [int]$TimeoutSeconds,
        [switch]$AllAddresses
    )

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $Connections = @(Get-PortListenConnections -Port $Port -BindHost $BindHost -AllAddresses:$AllAddresses)
        if ($Connections.Count -eq 0) {
            return
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $Deadline)

    $Connections = @(Get-PortListenConnections -Port $Port -BindHost $BindHost -AllAddresses:$AllAddresses)
    $Summary = Format-PortListenConnections $Connections
    throw "Port $Port is still listening after $TimeoutSeconds seconds ($Summary). Close the remaining listener or retry after Windows releases the socket."
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

function Test-ProcessPathUnder {
    param(
        [string]$ProcessPath,
        [Parameter(Mandatory = $true)]
        [string]$RootPath
    )

    if ([string]::IsNullOrWhiteSpace($ProcessPath)) {
        return $false
    }

    try {
        $FullProcessPath = [System.IO.Path]::GetFullPath($ProcessPath)
        $FullRootPath = [System.IO.Path]::GetFullPath($RootPath).TrimEnd([char[]]@('\', '/'))
        return $FullProcessPath.StartsWith($FullRootPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    } catch {
        return $false
    }
}

function Get-RunningProjectBinaryProcesses {
    $TargetRoot = Join-Path $RepoRoot "target"
    return @(Get-Process -Name "acp-webui" -ErrorAction SilentlyContinue | Where-Object {
        Test-ProcessPathUnder -ProcessPath $_.Path -RootPath $TargetRoot
    })
}

function Test-CommandLineReferencesPath {
    param(
        [string]$CommandLine,
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $false
    }

    $NormalizedCommand = $CommandLine.ToLowerInvariant() -replace '/', '\'
    $NormalizedPath = ([System.IO.Path]::GetFullPath($Path).ToLowerInvariant() -replace '/', '\').TrimEnd('\')
    return $NormalizedCommand.Contains($NormalizedPath)
}

function Get-ProjectDevProcessIds {
    try {
        $Processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    } catch {
        Write-Verbose "Failed to enumerate project dev processes: $($_.Exception.Message)"
        return @()
    }

    $Ids = New-Object System.Collections.Generic.List[int]
    foreach ($Process in $Processes) {
        $ProcessId = [int]$Process.ProcessId
        if ($ProcessId -le 0 -or $ProcessId -eq $PID) {
            continue
        }

        $Name = "$($Process.Name)".ToLowerInvariant()
        $CommandLine = "$($Process.CommandLine)"
        $ReferencesRepo = Test-CommandLineReferencesPath -CommandLine $CommandLine -Path $RepoRoot
        $ReferencesFrontend = Test-CommandLineReferencesPath -CommandLine $CommandLine -Path $FrontendDir
        if (-not ($ReferencesRepo -or $ReferencesFrontend)) {
            continue
        }

        $LowerCommandLine = $CommandLine.ToLowerInvariant()
        $IsCargoRun = ($Name -eq "cargo.exe" -or $Name -eq "cargo") -and $LowerCommandLine -match '(^|\s)run(\s|$)'
        $IsViteNode = ($Name -eq "node.exe" -or $Name -eq "node") -and $LowerCommandLine.Contains("vite")
        $IsNpmDev = ($Name -eq "npm.cmd" -or $Name -eq "npm" -or $Name -eq "cmd.exe") -and
            $LowerCommandLine.Contains("npm") -and
            $LowerCommandLine.Contains("run") -and
            $LowerCommandLine.Contains("dev")

        if ($IsCargoRun -or $IsViteNode -or $IsNpmDev) {
            $Ids.Add($ProcessId)
        }
    }

    return @($Ids | Select-Object -Unique)
}

function Stop-ProjectServices {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedBindHost
    )

    Write-Host "Stopping current project services..."

    $ProcessIds = @()
    $ProcessIds += @(Get-PortListenConnections -Port $BindPort -BindHost $ResolvedBindHost -AllAddresses |
        ForEach-Object { $_.OwningProcess })
    $ProcessIds += @(Get-PortListenConnections -Port $FrontendPort -BindHost $ResolvedBindHost -AllAddresses |
        ForEach-Object { $_.OwningProcess })
    $ProcessIds += @(Get-RunningProjectBinaryProcesses | ForEach-Object { $_.Id })
    $ProcessIds += Get-ProjectDevProcessIds
    $ProcessIds = @($ProcessIds | Where-Object { $_ -gt 0 -and $_ -ne $PID } | Sort-Object -Unique)

    if ($ProcessIds.Count -eq 0) {
        Write-Host "No current project services found."
    }

    foreach ($ProcessId in $ProcessIds) {
        Stop-ProcessTreeById $ProcessId
    }

    Wait-ForPortRelease -Port $BindPort -BindHost $ResolvedBindHost -TimeoutSeconds $ReleaseTimeoutSeconds -AllAddresses
    Wait-ForPortRelease -Port $FrontendPort -BindHost $ResolvedBindHost -TimeoutSeconds $ReleaseTimeoutSeconds -AllAddresses
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

$UseTailscaleBind = $BindTailscale -or -not [string]::IsNullOrWhiteSpace($TailscaleIp)
if ($UseTailscaleBind -and $PSBoundParameters.ContainsKey("BindHost")) {
    throw "Use -BindTailscale or -TailscaleIp without -BindHost; the script resolves the local Tailscale bind address."
}

$ResolvedBindHost = if ($UseTailscaleBind) {
    Get-TailscaleIPv4 $TailscaleIp
} else {
    $BindHost
}

if ($DisableAuth -and -not (Test-LoopbackBindHost $ResolvedBindHost)) {
    throw "-DisableAuth is only allowed when binding to a loopback address."
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not $NoStopExisting) {
    Stop-ProjectServices -ResolvedBindHost $ResolvedBindHost
} else {
    $PortListeners = @(Get-PortListenConnections -Port $BindPort -BindHost $ResolvedBindHost)
    if ($PortListeners.Count -gt 0) {
        $Summary = Format-PortListenConnections $PortListeners
        throw "Port $ResolvedBindHost`:$BindPort is already in use ($Summary). Remove -NoStopExisting to stop it first."
    }
}

if (-not $SkipBuild) {
    if ($InstallFrontendDeps -or -not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
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
    "--bind-host", $ResolvedBindHost,
    "--bind-port", "$BindPort",
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

if ($DisableAuth) {
    $RunArgs += "--disable-auth"
}

foreach ($Client in $TrustedClients) {
    $RunArgs += @("--trusted-client", $Client)
}

foreach ($Arg in $ExtraArgs) {
    $RunArgs += $Arg
}

$Url = "http://$ResolvedBindHost`:$BindPort"
if ($UseTailscaleBind) {
    Write-Host "Tailscale bind address: $ResolvedBindHost"
} else {
    Write-Host "Bind address: $ResolvedBindHost"
}
Write-Host "Serving URL: $Url"
Write-Host "Command:"
Write-Host ("  " + (Format-CommandForDisplay $Binary $RunArgs))

if ($NoRun) {
    Write-Host "NoRun set; build and command preparation complete."
    return
}

if ($Foreground) {
    Write-Host "Starting acp-webui release in the foreground. Press Ctrl+C to stop."
    & $Binary @RunArgs
    return
}

Write-Host "Starting acp-webui release in the background..."
$ReleaseProcess = Start-Process `
    -FilePath $Binary `
    -ArgumentList $RunArgs `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $ReleaseOut `
    -RedirectStandardError $ReleaseErr `
    -WindowStyle Hidden `
    -PassThru

Wait-ForHttpOk -Url "$Url/api/auth/status" -TimeoutSeconds $StartupTimeoutSeconds
Write-Host "Release server: $Url"
Write-Host "Release PID: $($ReleaseProcess.Id)"
Write-Host "Logs:"
Write-Host "  stdout: $ReleaseOut"
Write-Host "  stderr: $ReleaseErr"
