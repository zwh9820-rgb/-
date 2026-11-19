param([string]$Version = "")
# Update an existing GitHub Release body from changelog.json (same source as the in-app view).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\update-release-notes.ps1 0.1.2
$ErrorActionPreference = "Stop"
$OWNER = "zwh9820-rgb"
$REPO  = "-"

if (-not $Version) {
    $Version = (Get-Content (Join-Path (Get-Location) "package.json") -Raw | ConvertFrom-Json).version
}

$changelogPath = Join-Path (Get-Location) "changelog.json"
$changelog = [System.IO.File]::ReadAllText($changelogPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$entry = $changelog.versions | Where-Object { $_.version -eq $Version } | Select-Object -First 1
if (-not $entry) { Write-Error "No changelog entry for version $Version"; exit 1 }

$lines = @("LinkVue $Version ($($entry.date))", "", "## $($entry.title)", "", "### Issues found", "")
foreach ($s in $entry.issues) { $lines += "- $s" }
$lines += @("", "### Problems solved", "")
foreach ($s in $entry.fixes) { $lines += "- $s" }
$lines += @("", "---", "", "Installer: cross-border-data-hub-setup-$Version.exe", "Update manifest: latest.yml (do not remove - in-app updates depend on it)", "", "Full history of issues and fixes is also available in-app: Settings > Online Update > Version history.")
$NOTES = $lines -join "`n"

$TOKEN = $env:GITHUB_TOKEN
if (-not $TOKEN) {
    try {
        $out = ("protocol=https`nhost=github.com`n`n") | git credential fill 2>$null
        foreach ($line in $out) { if ($line -like "password=*") { $TOKEN = $line.Substring(9) } }
    } catch { }
}
if (-not $TOKEN) { Write-Error "No GitHub token found"; exit 1 }

$HDR = @{ Authorization = "Bearer $TOKEN"; "User-Agent" = "cbh-release-notes" }
$body = @{ body = $NOTES } | ConvertTo-Json -Compress -Depth 10
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$api = "https://api.github.com/repos/$OWNER/$REPO"
$existing = Invoke-RestMethod -Method Get -Uri "$api/releases/tags/v$Version" -Headers $HDR -TimeoutSec 60
$uri = "$api/releases/$($existing.id)"
$rel = Invoke-RestMethod -Method Patch -Uri $uri -Headers $HDR -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 120
Write-Host "Release notes updated for v$Version : $($rel.html_url)" -ForegroundColor Green
Write-Host "--- preview ---" -ForegroundColor Cyan
Write-Host $NOTES
