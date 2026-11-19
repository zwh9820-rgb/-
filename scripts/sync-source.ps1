# Sync local source files to GitHub repo via REST API (bypasses git push proxy issues).
# Usage: powershell -ExecutionPolicy Bypass -NoProfile -File scripts\sync-source.ps1
$ErrorActionPreference = "Stop"
$OWNER = "zwh9820-rgb"
$REPO  = "-"
$BRANCH = "master"

# Files that changed since the initial commit
$FILES = @(
    "electron/main.cjs",
    "electron/updater.cjs",
    "electron/preload.cjs",
    "lib/store.tsx",
    "components/GlobeView.tsx",
    "components/AppShell.tsx",
    "components/views/ReportsView.tsx",
    "app/layout.tsx",
    "package.json",
    "lib/import-mapper.ts",
    "scripts/verify-status-import.mjs",
    "scripts/verify-sku-import.mjs",
    "scripts/inspect-template.mjs",
    "scripts/inspect-sku-template.mjs",
    "scripts/debug-sku-map.mjs",
    "scripts/debug-sku-mismatch.mjs",
    "scripts/verify-auto-update.mjs",
    "scripts/verify-dirty-data.mjs",
    "scripts/verify-electron-dirty.mjs",
    "scripts/verify-rebrand.mjs",
    "scripts/verify-data-persist.mjs",
    "scripts/verify-electron-e2e.mjs",
    "scripts/diagnose-clean.mjs",
    "scripts/diagnose-crash.mjs",
    "scripts/dump-userdata.mjs",
    "scripts/dump-userdata2.mjs",
    "scripts/debug-rebrand.mjs",
    "scripts/upload-release.ps1",
    "scripts/prepare-github-release.mjs",
    "scripts/sync-source.ps1",
    "README.md",
    ".gitignore"
)

$TOKEN = $env:GITHUB_TOKEN
if (-not $TOKEN) {
    try {
        $out = ("protocol=https`nhost=github.com`n`n") | git credential fill 2>$null
        foreach ($line in $out) { if ($line -like "password=*") { $TOKEN = $line.Substring(9) } }
    } catch { }
}
if (-not $TOKEN) {
    Write-Host "Paste GitHub PAT (public_repo scope):" -ForegroundColor Yellow
    $sec = Read-Host -AsSecureString
    $TOKEN = [System.Net.NetworkCredential]::new("", $sec).Password
}
if (-not $TOKEN) { Write-Error "No token"; exit 1 }

$HDR = @{ Authorization="Bearer $TOKEN"; "User-Agent"="cbh-sync" }
$API = "https://api.github.com/repos/$OWNER/$REPO"

foreach ($rel in $FILES) {
    $local = Join-Path (Get-Location) $rel
    if (-not (Test-Path $local)) { Write-Warning "Skip missing: $rel"; continue }
    $content = [System.IO.File]::ReadAllBytes($local)
    $b64 = [Convert]::ToBase64String($content)
    $url = "$API/contents/$rel"
    # Try to get existing sha
    $sha = $null
    try {
        $existing = Invoke-RestMethod -Method Get -Uri "$url`?ref=$BRANCH" -Headers $HDR -TimeoutSec 60
        $sha = $existing.sha
    } catch { }
    $body = @{ message="Update $rel"; content=$b64; branch=$BRANCH }
    if ($sha) { $body.sha = $sha }
    $json = $body | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod -Method Put -Uri $url -Headers $HDR -Body $json -ContentType "application/json" -TimeoutSec 120 | Out-Null
        Write-Host "Synced: $rel" -ForegroundColor Green
    } catch {
        Write-Host "FAILED: $rel — $($_.Exception.Message)" -ForegroundColor Red
    }
}
Write-Host "Done." -ForegroundColor Cyan
