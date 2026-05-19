<#
.SYNOPSIS
Builds, copies, and deploys the Windows single-binary release to a remote host.

.DESCRIPTION
The script builds the embedded release binary unless -SkipBuild is passed, copies
acp-webui.exe to a Windows machine through PowerShell remoting, stops the
previous deployment or listener on the selected port when needed, and starts the
binary through a scheduled task so it survives after the remoting session exits.
Pass -BindTailscale to resolve the remote host's Tailscale IPv4 address and bind
only to that address; in that mode the script treats any same-port listener on
any other remote address as an exposure to stop or reject.

The remote machine must allow PowerShell remoting, and the deployed runtime still
needs ACP adapter commands such as codex-acp or npx on the remote PATH.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ComputerName,

    [string]$RemoteDir,
    [string]$RemoteBinaryName = "acp-webui.exe",
    [string]$TaskName = "ACP Web UI",
    [string]$BindHost = "127.0.0.1",
    [switch]$BindTailscale,
    [string]$TailscaleIp,
    [int]$BindPort = 7635,
    [int]$ReleaseTimeoutSeconds = 30,
    [int]$StartupTimeoutSeconds = 90,
    [string]$LocalBinary,
    [switch]$SkipBuild,
    [switch]$InstallFrontendDeps,
    [switch]$NoRun,
    [switch]$NoStopExisting,
    [switch]$SkipHealthCheck,
    [string]$RemoteWorkDir,
    [string]$CodexAcpCommand = "codex-acp",
    [string[]]$CodexAcpArgs = @(),
    [string]$ClaudeAcpCommand = "npx",
    [string[]]$ClaudeAcpArgs = @(),
    [switch]$DisableAuth,
    [string[]]$ExtraArgs = @(),
    [pscredential]$Credential,
    [switch]$UseSSL,
    [int]$PSSessionPort,
    [switch]$UseSsh,
    [string]$SshTarget,
    [string]$SshCommand = "ssh",
    [string]$ScpCommand = "scp"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$DefaultLocalBinary = Join-Path $RepoRoot "target\release\acp-webui.exe"

function ConvertTo-PowerShellSingleQuotedLiteral {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return "'" + ($Value -replace "'", "''") + "'"
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

function Test-WildcardBindHost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Address
    )

    return $Address -eq "0.0.0.0" -or $Address -eq "::" -or $Address -eq "[::]" -or $Address -eq "*"
}

function Test-LoopbackBindHost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Address
    )

    $Parsed = [System.Net.IPAddress]::None
    return [System.Net.IPAddress]::TryParse($Address, [ref]$Parsed) -and [System.Net.IPAddress]::IsLoopback($Parsed)
}

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

function New-RemoteSession {
    $SessionParams = @{
        ComputerName = $ComputerName
    }

    if ($null -ne $Credential) {
        $SessionParams.Credential = $Credential
    }

    if ($UseSSL) {
        $SessionParams.UseSSL = $true
    }

    if ($PSSessionPort -gt 0) {
        $SessionParams.Port = $PSSessionPort
    }

    New-PSSession @SessionParams
}

function Resolve-TransportCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName
    )

    $Command = Get-Command $CommandName -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($Command.Source)) {
        return $CommandName
    }

    return $Command.Source
}

function ConvertTo-RemoteSshPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    return $Path -replace "\\", "/"
}

function Invoke-SshPowerShell {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Target,
        [Parameter(Mandatory = $true)]
        [scriptblock]$ScriptBlock,
        [Parameter(Mandatory = $true)]
        [hashtable]$Config,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedSshCommand
    )

    $ConfigJson = ConvertTo-Json -InputObject $Config -Compress -Depth 20
    $ConfigBase64 = [System.Convert]::ToBase64String(
        [System.Text.Encoding]::UTF8.GetBytes($ConfigJson)
    )
    $ScriptText = $ScriptBlock.ToString()
    $RemoteScript = @"
`$ErrorActionPreference = "Stop"
`$ProgressPreference = "SilentlyContinue"
`$InformationPreference = "SilentlyContinue"
`$ConfigJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('$ConfigBase64'))
`$Config = `$ConfigJson | ConvertFrom-Json
`$RemoteBlock = [scriptblock]::Create(@'
$ScriptText
'@)
`$Result = & `$RemoteBlock `$Config
if (`$null -ne `$Result) {
    `$Result | ConvertTo-Json -Compress -Depth 20
}
"@
    $Encoded = [System.Convert]::ToBase64String(
        [System.Text.Encoding]::Unicode.GetBytes($RemoteScript)
    )
    $Output = & $ResolvedSshCommand $Target "powershell -NoProfile -NonInteractive -EncodedCommand $Encoded" 2>&1
    $ExitCode = $LASTEXITCODE
    if ($ExitCode -ne 0) {
        throw "SSH remote PowerShell command failed with exit code $ExitCode. Output: $($Output -join "`n")"
    }

    $JsonLine = @($Output | ForEach-Object { "$_".Trim() } | Where-Object {
        $_.StartsWith("{") -or $_.StartsWith("[")
    } | Select-Object -Last 1)
    if ($JsonLine.Count -eq 0) {
        return $null
    }

    return $JsonLine[-1] | ConvertFrom-Json
}

function Copy-FileOverSsh {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$Target,
        [Parameter(Mandatory = $true)]
        [string]$RemotePath,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedScpCommand
    )

    $RemoteScpPath = ConvertTo-RemoteSshPath $RemotePath
    & $ResolvedScpCommand $Source "${Target}:$RemoteScpPath"
    $ExitCode = $LASTEXITCODE
    if ($ExitCode -ne 0) {
        throw "scp failed with exit code $ExitCode while copying to ${Target}:$RemoteScpPath"
    }
}

function New-LauncherContent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Binary,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    $BinaryLiteral = ConvertTo-PowerShellSingleQuotedLiteral $Binary
    $LogPathLiteral = ConvertTo-PowerShellSingleQuotedLiteral $LogPath
    $ArgumentsLiteral = ($Arguments | ForEach-Object {
        ConvertTo-PowerShellSingleQuotedLiteral $_
    }) -join ", "

    return @"
`$ErrorActionPreference = "Stop"
`$Binary = $BinaryLiteral
`$LogPath = $LogPathLiteral
`$RunArgs = @($ArgumentsLiteral)

New-Item -ItemType Directory -Force -Path (Split-Path -Parent `$LogPath) | Out-Null
"[`$(Get-Date -Format o)] Starting `$Binary" | Out-File -LiteralPath `$LogPath -Append -Encoding utf8
try {
    & `$Binary @RunArgs *>> `$LogPath
    `$ExitCode = `$LASTEXITCODE
    if (`$null -eq `$ExitCode) {
        `$ExitCode = 0
    }

    "[`$(Get-Date -Format o)] Exited with code `$ExitCode" | Out-File -LiteralPath `$LogPath -Append -Encoding utf8
    exit `$ExitCode
} catch {
    "[`$(Get-Date -Format o)] Failed: `$(`$_.Exception.Message)" | Out-File -LiteralPath `$LogPath -Append -Encoding utf8
    throw
}
"@
}

function New-RunArguments {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EffectiveBindHost,
        [Parameter(Mandatory = $true)]
        [string]$EffectiveRemoteWorkDir
    )

    $Arguments = @(
        "--bind-host", $EffectiveBindHost,
        "--bind-port", "$BindPort",
        "--work-dir", $EffectiveRemoteWorkDir,
        "--codex-acp-command", $CodexAcpCommand
    )

    foreach ($Arg in $CodexAcpArgs) {
        $Arguments += @("--codex-acp-arg", $Arg)
    }

    $Arguments += @("--claude-acp-command", $ClaudeAcpCommand)

    foreach ($Arg in $ClaudeAcpArgs) {
        $Arguments += @("--claude-acp-arg", $Arg)
    }

    if ($DisableAuth) {
        $Arguments += "--disable-auth"
    }

    foreach ($Arg in $ExtraArgs) {
        $Arguments += $Arg
    }

    return $Arguments
}

$UseTailscaleBind = $BindTailscale -or -not [string]::IsNullOrWhiteSpace($TailscaleIp)
if ($UseTailscaleBind -and $PSBoundParameters.ContainsKey("BindHost")) {
    throw "Use -BindTailscale or -TailscaleIp without -BindHost; the script resolves the remote Tailscale bind address."
}

if (-not $UseTailscaleBind) {
    if (Test-WildcardBindHost $BindHost) {
        throw "Refusing to bind to all interfaces ($BindHost). Use 127.0.0.1, -BindTailscale, or -TailscaleIp."
    }
    if (-not (Test-LoopbackBindHost $BindHost) -and -not (Test-TailscaleIPv4 $BindHost)) {
        throw "Refusing to bind to $BindHost. Project services may bind only to 127.0.0.1 or an explicit Tailscale IPv4 address."
    }
}

if ($UseTailscaleBind -and $DisableAuth) {
    throw "-DisableAuth cannot be used with Tailscale binding because acp-webui only permits disabled auth on loopback binds."
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
        go build -tags embedded_frontend -o $DefaultLocalBinary .
    } finally {
        Pop-Location
    }
}

$BinaryToCopy = if ([string]::IsNullOrWhiteSpace($LocalBinary)) {
    $DefaultLocalBinary
} else {
    $LocalBinary
}

if (-not (Test-Path -LiteralPath $BinaryToCopy -PathType Leaf)) {
    throw "Local binary not found at $BinaryToCopy. Run without -SkipBuild first or pass -LocalBinary."
}

$PrepareRemoteScript = {
    param(
        [object]$Config
    )

    $ErrorActionPreference = "Stop"

    function Test-WildcardBindHost {
        param(
            [Parameter(Mandatory = $true)]
            [string]$Address
        )

        return $Address -eq "0.0.0.0" -or $Address -eq "::" -or $Address -eq "[::]" -or $Address -eq "*"
    }

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

    function Get-TailscaleIPv4 {
        param(
            [string]$RequestedIp
        )

        if (-not [string]::IsNullOrWhiteSpace($RequestedIp)) {
            $Candidate = $RequestedIp.Trim()
            if (-not (Test-TailscaleIPv4 $Candidate)) {
                throw "$Candidate is not in the Tailscale IPv4 range 100.64.0.0/10."
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

        throw "Could not find a remote Tailscale IPv4 address. Start Tailscale on the remote host or pass -TailscaleIp 100.x.y.z."
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

    function Get-RunningBinaryProcesses {
        param(
            [Parameter(Mandatory = $true)]
            [string]$BinaryPath
        )

        if (-not (Test-Path -LiteralPath $BinaryPath -PathType Leaf)) {
            return @()
        }

        $ExpectedPath = [System.IO.Path]::GetFullPath($BinaryPath)
        $ProcessName = [System.IO.Path]::GetFileNameWithoutExtension($BinaryPath)
        return @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Where-Object {
            try {
                -not [string]::IsNullOrWhiteSpace($_.Path) -and
                    [System.IO.Path]::GetFullPath($_.Path) -eq $ExpectedPath
            } catch {
                $false
            }
        })
    }

    function Stop-ProcessTreeById {
        param(
            [Parameter(Mandatory = $true)]
            [int]$ProcessId
        )

        if ($ProcessId -le 0) {
            return
        }

        $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($null -ne $Process) {
            Write-Host "Stopping remote process $ProcessId ($($Process.ProcessName))..."
        } else {
            Write-Warning "Remote listener reports PID $ProcessId, but the process is not visible."
        }

        $Taskkill = Get-Command taskkill.exe -ErrorAction SilentlyContinue
        if ($null -ne $Taskkill) {
            $PreviousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            try {
                $Output = & $Taskkill.Source /PID $ProcessId /F /T 2>&1
                $TaskkillExitCode = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $PreviousErrorActionPreference
            }

            foreach ($Line in $Output) {
                Write-Verbose $Line
            }

            if ($TaskkillExitCode -eq 0) {
                return
            }
        }

        if ($null -ne $Process) {
            Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
            try {
                $Process.WaitForExit(10000) | Out-Null
            } catch {
                Write-Verbose "WaitForExit failed for PID ${ProcessId}: $($_.Exception.Message)"
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
        throw "Port $BindHost`:$Port is still listening after $TimeoutSeconds seconds ($Summary)."
    }

    $ResolvedBindHost = if ($Config.BindTailscale) {
        Get-TailscaleIPv4 -RequestedIp $Config.TailscaleIp
    } else {
        $Config.BindHost
    }
    if (Test-WildcardBindHost $ResolvedBindHost) {
        throw "Refusing to bind to all interfaces ($ResolvedBindHost). Use 127.0.0.1, -BindTailscale, or -TailscaleIp."
    }
    if (-not (Test-LoopbackBindHost $ResolvedBindHost) -and -not (Test-TailscaleIPv4 $ResolvedBindHost)) {
        throw "Refusing to bind to $ResolvedBindHost. Project services may bind only to 127.0.0.1 or an explicit Tailscale IPv4 address."
    }
    $CheckAllPortAddresses = [bool]$Config.BindTailscale

    $ResolvedRemoteDir = $Config.RemoteDir
    if ([string]::IsNullOrWhiteSpace($ResolvedRemoteDir)) {
        if ([string]::IsNullOrWhiteSpace($env:ProgramData)) {
            throw "RemoteDir was not supplied and the remote ProgramData environment variable is not set."
        }

        $ResolvedRemoteDir = Join-Path $env:ProgramData "acp-webui"
    }

    New-Item -ItemType Directory -Force -Path $ResolvedRemoteDir | Out-Null
    $RemoteBinary = Join-Path $ResolvedRemoteDir $Config.RemoteBinaryName
    $LogDir = Join-Path $ResolvedRemoteDir "logs"
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $LauncherPath = Join-Path $ResolvedRemoteDir "run-acp-webui.ps1"
    $LogPath = Join-Path $LogDir "acp-webui.log"

    $Running = @(Get-RunningBinaryProcesses -BinaryPath $RemoteBinary)
    $PortListeners = @(Get-PortListenConnections -Port $Config.BindPort -BindHost $ResolvedBindHost -AllAddresses:$CheckAllPortAddresses)

    if ($Config.StopExisting) {
        try {
            $Task = Get-ScheduledTask -TaskName $Config.TaskName -ErrorAction SilentlyContinue
            if ($null -ne $Task -and $Task.State -eq "Running") {
                Write-Host "Stopping scheduled task $($Config.TaskName)..."
                Stop-ScheduledTask -TaskName $Config.TaskName -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Verbose "Scheduled task stop failed: $($_.Exception.Message)"
        }

        $ProcessIds = @()
        $ProcessIds += $PortListeners | ForEach-Object { $_.OwningProcess }
        $ProcessIds += $Running | ForEach-Object { $_.Id }
        $ProcessIds = @($ProcessIds | Where-Object { $_ -gt 0 } | Sort-Object -Unique)

        foreach ($ProcessId in $ProcessIds) {
            Stop-ProcessTreeById $ProcessId
        }

        Wait-ForPortRelease -Port $Config.BindPort -BindHost $ResolvedBindHost -TimeoutSeconds $Config.ReleaseTimeoutSeconds -AllAddresses:$CheckAllPortAddresses
    } else {
        if ($Running.Count -gt 0) {
            $Ids = ($Running | ForEach-Object { $_.Id }) -join ", "
            throw "Remote binary is already running (PID: $Ids). Re-run without -NoStopExisting to restart it."
        }

        if ($PortListeners.Count -gt 0) {
            $Summary = Format-PortListenConnections $PortListeners
            throw "Remote port $($ResolvedBindHost):$($Config.BindPort) is already in use ($Summary). Re-run without -NoStopExisting to stop it."
        }
    }

    [pscustomobject]@{
        RemoteDir = $ResolvedRemoteDir
        BindHost = $ResolvedBindHost
        Binary = $RemoteBinary
        Launcher = $LauncherPath
        Log = $LogPath
    }
}

$ConfigureRemoteScript = {
    param(
        [object]$Config
    )

    $ErrorActionPreference = "Stop"

    Set-Content -LiteralPath $Config.LauncherPath -Value $Config.LauncherContent -Encoding UTF8

    if ($Config.NoRun) {
        return [pscustomobject]@{
            Started = $false
            TaskName = $Config.TaskName
            Log = $Config.LogPath
        }
    }

    $Action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$($Config.LauncherPath)`"" `
        -WorkingDirectory $Config.RemoteDir
    $Settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $Config.TaskName `
        -Action $Action `
        -Settings $Settings `
        -Force | Out-Null

    Start-ScheduledTask -TaskName $Config.TaskName

    [pscustomobject]@{
        Started = $true
        TaskName = $Config.TaskName
        Log = $Config.LogPath
    }
}

$WaitRemoteScript = {
    param(
        [object]$Config
    )

    $ErrorActionPreference = "Stop"

    function Test-WildcardBindHost {
        param(
            [Parameter(Mandatory = $true)]
            [string]$Address
        )

        return $Address -eq "0.0.0.0" -or $Address -eq "::" -or $Address -eq "[::]" -or $Address -eq "*"
    }

    function Assert-TailscaleOnlyListener {
        param(
            [Parameter(Mandatory = $true)]
            [int]$Port,
            [Parameter(Mandatory = $true)]
            [string]$BindHost
        )

        $Listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        $Expected = $BindHost.Trim()
        $Unexpected = @($Listeners | Where-Object { $_.LocalAddress -ne $Expected })
        if ($Unexpected.Count -gt 0) {
            $Summary = ($Unexpected | ForEach-Object {
                "$($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)"
            } | Sort-Object -Unique) -join ", "
            throw "Tailscale-only verification failed: port $Port also listens on non-Tailscale address(es): $Summary"
        }

        $ExpectedListeners = @($Listeners | Where-Object { $_.LocalAddress -eq $Expected })
        if ($ExpectedListeners.Count -eq 0) {
            throw "Tailscale-only verification failed: port $Port is not listening on $Expected."
        }
    }

    if ($Config.NoRun -or $Config.SkipHealthCheck -or $Config.StartupTimeoutSeconds -le 0) {
        return [pscustomobject]@{
            Checked = $false
            Url = $null
        }
    }

    $ProbeHost = if (Test-WildcardBindHost $Config.BindHost) {
        "127.0.0.1"
    } else {
        $Config.BindHost
    }
    $Url = "http://$ProbeHost`:$($Config.BindPort)/api/auth/status"
    $Deadline = (Get-Date).AddSeconds($Config.StartupTimeoutSeconds)

    do {
        try {
            $Response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) {
                if ($Config.BindTailscale) {
                    Assert-TailscaleOnlyListener -Port $Config.BindPort -BindHost $Config.BindHost
                }

                return [pscustomobject]@{
                    Checked = $true
                    Url = $Url
                    StatusCode = $Response.StatusCode
                }
            }
        } catch {
            $StatusCode = $null
            if ($null -ne $_.Exception.Response) {
                try {
                    $StatusCode = [int]$_.Exception.Response.StatusCode
                } catch {
                    $StatusCode = $null
                }
            }

            if ($null -ne $StatusCode -and $StatusCode -ge 400 -and $StatusCode -lt 500) {
                if ($Config.BindTailscale) {
                    Assert-TailscaleOnlyListener -Port $Config.BindPort -BindHost $Config.BindHost
                }

                return [pscustomobject]@{
                    Checked = $true
                    Url = $Url
                    StatusCode = $StatusCode
                }
            }

            Write-Verbose "Waiting for ${Url}: $($_.Exception.Message)"
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $Deadline)

    $TaskInfo = $null
    try {
        $TaskInfo = Get-ScheduledTaskInfo -TaskName $Config.TaskName -ErrorAction SilentlyContinue
    } catch {
        Write-Verbose "Failed to inspect scheduled task: $($_.Exception.Message)"
    }

    $Tail = @()
    if (Test-Path -LiteralPath $Config.LogPath -PathType Leaf) {
        $Tail = @(Get-Content -LiteralPath $Config.LogPath -Tail 30 -ErrorAction SilentlyContinue)
    }

    $Details = if ($null -ne $TaskInfo) {
        " Last task result: $($TaskInfo.LastTaskResult)."
    } else {
        ""
    }
    if ($Tail.Count -gt 0) {
        $Details += " Recent log: " + ($Tail -join " | ")
    }

    throw "Timed out waiting for $Url after $($Config.StartupTimeoutSeconds) seconds.$Details"
}

$UseSshTransport = $UseSsh -or -not [string]::IsNullOrWhiteSpace($SshTarget) -or $ComputerName.Contains("@")
$RemoteTarget = if ([string]::IsNullOrWhiteSpace($SshTarget)) {
    $ComputerName
} else {
    $SshTarget
}
if ($UseSshTransport -and ($null -ne $Credential -or $UseSSL -or $PSSessionPort -gt 0)) {
    throw "-Credential, -UseSSL, and -PSSessionPort are only supported with PowerShell remoting, not SSH transport."
}

$Session = $null
$ResolvedSshCommand = $null
$ResolvedScpCommand = $null
try {
    if ($UseSshTransport) {
        $ResolvedSshCommand = Resolve-TransportCommand $SshCommand
        $ResolvedScpCommand = Resolve-TransportCommand $ScpCommand
        Write-Host "Connecting to $RemoteTarget over SSH..."
    } else {
        Write-Host "Connecting to $ComputerName through PowerShell remoting..."
        $Session = New-RemoteSession
    }

    $PrepareConfig = @{
        RemoteDir = $RemoteDir
        RemoteBinaryName = $RemoteBinaryName
        TaskName = $TaskName
        BindHost = $BindHost
        BindTailscale = [bool]$UseTailscaleBind
        TailscaleIp = $TailscaleIp
        BindPort = $BindPort
        StopExisting = -not $NoStopExisting
        ReleaseTimeoutSeconds = $ReleaseTimeoutSeconds
    }
    $RemotePaths = if ($UseSshTransport) {
        Invoke-SshPowerShell `
            -Target $RemoteTarget `
            -ScriptBlock $PrepareRemoteScript `
            -Config $PrepareConfig `
            -ResolvedSshCommand $ResolvedSshCommand
    } else {
        Invoke-Command -Session $Session -ScriptBlock $PrepareRemoteScript -ArgumentList $PrepareConfig
    }
    if ($UseTailscaleBind) {
        Write-Host "Remote Tailscale bind address: $($RemotePaths.BindHost)"
    }

    Write-Host "Copying $BinaryToCopy to $RemoteTarget`:$($RemotePaths.Binary)..."
    if ($UseSshTransport) {
        Copy-FileOverSsh `
            -Source $BinaryToCopy `
            -Target $RemoteTarget `
            -RemotePath $RemotePaths.Binary `
            -ResolvedScpCommand $ResolvedScpCommand
    } else {
        Copy-Item -LiteralPath $BinaryToCopy -Destination $RemotePaths.Binary -ToSession $Session -Force
    }

    $EffectiveRemoteWorkDir = if ([string]::IsNullOrWhiteSpace($RemoteWorkDir)) {
        Join-Path $RemotePaths.RemoteDir "state"
    } else {
        $RemoteWorkDir
    }
    $RunArgs = New-RunArguments -EffectiveBindHost $RemotePaths.BindHost -EffectiveRemoteWorkDir $EffectiveRemoteWorkDir

    $LauncherContent = New-LauncherContent -Binary $RemotePaths.Binary -Arguments $RunArgs -LogPath $RemotePaths.Log
    $ConfigureConfig = @{
        RemoteDir = $RemotePaths.RemoteDir
        LauncherPath = $RemotePaths.Launcher
        LauncherContent = $LauncherContent
        TaskName = $TaskName
        LogPath = $RemotePaths.Log
        NoRun = [bool]$NoRun
    }
    $StartResult = if ($UseSshTransport) {
        Invoke-SshPowerShell `
            -Target $RemoteTarget `
            -ScriptBlock $ConfigureRemoteScript `
            -Config $ConfigureConfig `
            -ResolvedSshCommand $ResolvedSshCommand
    } else {
        Invoke-Command -Session $Session -ScriptBlock $ConfigureRemoteScript -ArgumentList $ConfigureConfig
    }

    Write-Host "Remote command:"
    Write-Host ("  " + (Format-CommandForDisplay $RemotePaths.Binary $RunArgs))

    if ($NoRun) {
        Write-Host "NoRun set; copied binary and wrote launcher without starting the scheduled task."
        return
    }

    $WaitConfig = @{
        BindHost = $RemotePaths.BindHost
        BindTailscale = [bool]$UseTailscaleBind
        BindPort = $BindPort
        LogPath = $RemotePaths.Log
        TaskName = $TaskName
        StartupTimeoutSeconds = $StartupTimeoutSeconds
        NoRun = [bool]$NoRun
        SkipHealthCheck = [bool]$SkipHealthCheck
    }
    $Health = if ($UseSshTransport) {
        Invoke-SshPowerShell `
            -Target $RemoteTarget `
            -ScriptBlock $WaitRemoteScript `
            -Config $WaitConfig `
            -ResolvedSshCommand $ResolvedSshCommand
    } else {
        Invoke-Command -Session $Session -ScriptBlock $WaitRemoteScript -ArgumentList $WaitConfig
    }

    Write-Host "Started scheduled task: $($StartResult.TaskName)"
    if ($Health.Checked) {
        Write-Host "Remote health check: $($Health.Url) returned $($Health.StatusCode)"
    } else {
        Write-Host "Remote health check skipped."
    }
    if (-not $DisableAuth) {
        Write-Host "Device approval:"
        Write-Host "  On the remote host, list pending devices: acp-webui devices pending"
        Write-Host "  On the remote host, approve a device:     acp-webui approve <CODE>"
    }
    Write-Host "Remote log: $($RemotePaths.Log)"
} finally {
    if ($null -ne $Session) {
        Remove-PSSession $Session
    }
}
