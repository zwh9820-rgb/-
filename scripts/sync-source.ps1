# Sync local source files to GitHub repo via REST API (bypasses git push proxy issues).
# Usage: powershell -ExecutionPolicy Bypass -NoProfile -File scripts\sync-source.ps1
$ErrorActionPreference = "Stop"
$OWNER = "zwh9820-rgb"
$REPO  = "-"
$BRANCH = "master"

# Source files to sync (core app + official verification suites only)
$FILES = @(
    "electron/main.cjs",
    "electron/updater.cjs",
    "electron/preload.cjs",
    "electron/file-center.cjs",
    "changelog.json",
    "lib/changelog.ts",
    "lib/data-doctor.ts",
    "lib/sample-data.ts",
    "lib/store.tsx",
    "lib/import-mapper.ts",
    "components/AppShell.tsx",
    "components/views/DataCenterView.tsx",
    "components/views/FileCenterView.tsx",
    "components/views/SettingsView.tsx",
    "components/views/ReportsView.tsx",
    "components/GlobeView.tsx",
    "components/MapWorkbench.tsx",
    "app/layout.tsx",
    "package.json",
    "package-lock.json",
    "next.config.mjs",
    "在线更新使用说明.md",
    "README.md",
    ".gitignore",
    "scripts/verify-sample-data.mjs",
    "scripts/verify-file-center.mjs",
    "scripts/verify-pdf-preview.mjs",
    "scripts/verify-changelog.mjs",
    "scripts/verify-data-doctor.mjs",
    "scripts/verify-single-instance.mjs",
    "scripts/verify-status-import.mjs",
    "scripts/verify-sku-import.mjs",
    "scripts/verify-auto-update.mjs",
    "scripts/verify-dirty-data.mjs",
    "scripts/verify-electron-dirty.mjs",
    "scripts/verify-rebrand.mjs",
    "scripts/verify-data-persist.mjs",
    "scripts/verify-electron-e2e.mjs",
    "scripts/verify-center-and-globe.mjs",
    "scripts/verify-linkage.mjs",
    "scripts/verify-xlsx-import.mjs",
    "scripts/upload-release.ps1",
    "scripts/update-release-notes.ps1",
    "scripts/prepare-github-release.mjs",
    "scripts/sync-source.ps1"
)

# One-off debug/repro scripts left over from earlier versions — remove from the remote repo.
# These were previously synced by mistake; they are throwaway diagnostics, not part of the app.
$REMOVE = @(
    "scripts/diagnose-tab-switch.mjs",
    "scripts/diagnose-lag.mjs",
    "scripts/diagnose-clean.mjs",
    "scripts/diagnose-crash.mjs",
    "scripts/repro-import-switch.mjs",
    "scripts/repro-bigdata-switch.mjs",
    "scripts/repro-electron-switch.mjs",
    "scripts/inspect-template.mjs",
    "scripts/inspect-sku-template.mjs",
    "scripts/debug-sku-map.mjs",
    "scripts/debug-sku-mismatch.mjs",
    "scripts/debug-rebrand.mjs",
    "scripts/dump-userdata.mjs",
    "scripts/dump-userdata2.mjs"
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
# Remove stale one-off scripts from remote
foreach ($rel in $REMOVE) {
    $url = "$API/contents/$rel"
    try {
        $existing = Invoke-RestMethod -Method Get -Uri "$url`?ref=$BRANCH" -Headers $HDR -TimeoutSec 60
        $delBody = @{ message="Remove leftover debug script: $rel"; sha=$existing.sha; branch=$BRANCH } | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Delete -Uri $url -Headers $HDR -Body $delBody -ContentType "application/json" -TimeoutSec 120 | Out-Null
        Write-Host "Removed remote: $rel" -ForegroundColor Yellow
    } catch {
        # 404 = already absent, treat as OK
    }
}
Write-Host "Done." -ForegroundColor Cyan
