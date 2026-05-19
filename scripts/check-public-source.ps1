param()

$ErrorActionPreference = "Stop"

$tracked = @(git ls-files)
if ($LASTEXITCODE -ne 0) {
    throw "git ls-files failed."
}

$blockedPathPattern = '(^|/)(\.data|\.tmp|frontend/\.data|target|frontend/dist|frontend/node_modules|frontend/test-results)(/|$)'
$blockedFilePattern = '(^|/)(\.env(\..*)?|.*\.(db|sqlite|sqlite3|pem|p12|pfx|key|log)|.*(cookie|session|secret).*\.(json|txt|log))$'

$blockedFiles = @(
    $tracked |
        Where-Object {
            $normalized = $_ -replace '\\', '/'
            $normalized -match $blockedPathPattern -or $normalized -match $blockedFilePattern
        }
)

if ($blockedFiles.Count -gt 0) {
    Write-Error ("Tracked sensitive or generated files are not allowed in the public source tree:`n" + ($blockedFiles -join "`n"))
}

$secretPattern = 'sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |OPENSSH |EC |PRIVATE )?PRIVATE KEY-----|acp_webui_device=[^f][^;\s]{8,}|token=[0-9a-fA-F]{32}|C:\\Users\\[^\\]+\\|/Users/[^/\s]+/'
$secretFindings = @()
foreach ($file in $tracked) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        continue
    }
    $normalized = $file -replace '\\', '/'
    if ($normalized -match '^frontend/package-lock\.json$' -or $normalized -match '^go\.sum$' -or $normalized -match '^scripts/check-public-source\.ps1$') {
        continue
    }
    try {
        $fileMatches = Select-String -LiteralPath $file -Pattern $secretPattern -AllMatches
        if ($fileMatches) {
            $secretFindings += $fileMatches | ForEach-Object { "${file}:$($_.LineNumber)" }
        }
    } catch {
        continue
    }
}

if ($secretFindings.Count -gt 0) {
    Write-Error ("Potential secret or machine-specific value found in tracked source:`n" + (($secretFindings | Select-Object -Unique) -join "`n"))
}

Write-Host "Public source guard passed."
