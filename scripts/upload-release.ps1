# One-click: create GitHub Release and upload installer + latest.yml
# Reads the GitHub token from Windows Credential Manager (never printed or stored to disk).
# Usage (in PowerShell, from project root):
#   powershell -ExecutionPolicy Bypass -File scripts\upload-release.ps1
# If no token is found, you will be asked to paste a Personal Access Token (public_repo scope).

$ErrorActionPreference = "Stop"
$OWNER = "zwh9820-rgb"
$REPO  = "-"

# Read version from package.json so the script never goes stale
$pkgPath = Join-Path (Get-Location) "package.json"
$VERSION = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version
$TAG   = "v$VERSION"
$TITLE = "LinkVue $VERSION"

# Release notes are generated from changelog.json (same source as the in-app view).
$changelogPath = Join-Path (Get-Location) "changelog.json"
$entry = $null
if (Test-Path $changelogPath) {
    $changelog = [System.IO.File]::ReadAllText($changelogPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $entry = $changelog.versions | Where-Object { $_.version -eq $VERSION } | Select-Object -First 1
}
if ($entry) {
    $lines = @("LinkVue $VERSION ($($entry.date))", "", "## $($entry.title)", "", "### Issues found", "")
    foreach ($s in $entry.issues) { $lines += "- $s" }
    $lines += @("", "### Problems solved", "")
    foreach ($s in $entry.fixes) { $lines += "- $s" }
    $lines += @("", "---", "", "Installer: cross-border-data-hub-setup-$VERSION.exe", "Update manifest: latest.yml (do not remove - in-app updates depend on it)", "", "The full history of issues and fixes is also available in-app: Settings > Online Update > Version history.")
    $NOTES = $lines -join "`n"
    Write-Host "Release notes loaded from changelog.json" -ForegroundColor Cyan
} else {
    Write-Warning "No changelog entry for $VERSION; using generic notes. Add it to changelog.json before publishing."
    $NOTES = "LinkVue $VERSION - Installer: cross-border-data-hub-setup-$VERSION.exe. Keep latest.yml as the update manifest."
}

$RELEASE_DIR = Join-Path (Get-Location) "dist\github-release"
$SETUP = Join-Path $RELEASE_DIR "cross-border-data-hub-setup-$VERSION.exe"
$YML   = Join-Path $RELEASE_DIR "latest.yml"

foreach ($f in @($SETUP, $YML)) {
    if (-not (Test-Path $f)) { Write-Error "Missing file: $f  (run: node scripts/prepare-github-release.mjs first)"; exit 1 }
}

# ---- Get token: env var -> git credential helper -> interactive ----
$TOKEN = $env:GITHUB_TOKEN
if (-not $TOKEN) {
    try {
        $out = ("protocol=https`nhost=github.com`n`n") | git credential fill 2>$null
        foreach ($line in $out) {
            if ($line -like "password=*") { $TOKEN = $line.Substring(9) }
        }
    } catch { }
}
if (-not $TOKEN) {
    Write-Host "No saved token found. Paste a GitHub Personal Access Token (public_repo scope):" -ForegroundColor Yellow
    $sec = Read-Host -AsSecureString
    $TOKEN = [System.Net.NetworkCredential]::new("", $sec).Password
}
if (-not $TOKEN) { Write-Error "No token; aborting"; exit 1 }

$HDR = @{ Authorization = "Bearer $TOKEN"; "User-Agent" = "cbh-release-uploader" }
$API = "https://api.github.com/repos/$OWNER/$REPO"

function Invoke-API($method, $url, $body) {
    $params = @{ Method=$method; Uri=$url; Headers=$HDR; ContentType="application/json; charset=utf-8" }
    if ($body) {
        $json = $body | ConvertTo-Json -Compress -Depth 10
        # Send UTF-8 bytes explicitly so Chinese release notes are not mangled by PowerShell 5.1
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    return Invoke-RestMethod @params
}

# ---- 1. Create Release ----
Write-Host "Creating Release $TAG ..." -ForegroundColor Cyan
try {
    $rel = Invoke-API "POST" "$API/releases" @{
        tag_name=$TAG; name=$TITLE; body=$NOTES; draft=$false; prerelease=$false
    }
    Write-Host "Release created: $($rel.html_url)" -ForegroundColor Green
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 422) {
        Write-Host "Release exists; reusing..." -ForegroundColor Yellow
        $rel = Invoke-API "GET" "$API/releases/tags/$TAG" $null
    } else { throw }
}

# ---- 2. Upload assets (delete same-named assets first so re-runs refresh them) ----
$uploadUrl = "https://uploads.github.com/repos/$OWNER/$REPO/releases/$($rel.id)/assets"
$existing = Invoke-API "GET" "$API/releases/$($rel.id)/assets" $null
foreach ($f in @($SETUP, $YML)) {
    $name = Split-Path $f -Leaf
    foreach ($a in $existing) {
        if ($a.name -eq $name) {
            Write-Host "Deleting old asset $name ..." -ForegroundColor Yellow
            Invoke-API "DELETE" "$API/releases/assets/$($a.id)" $null | Out-Null
        }
    }
    Write-Host "Uploading $name ..." -ForegroundColor Cyan
    $bytes = [System.IO.File]::ReadAllBytes($f)
    $upHdr = @{ Authorization="Bearer $TOKEN"; "User-Agent"="cbh-release-uploader"; "Content-Type"="application/octet-stream" }
    $resp = Invoke-RestMethod -Method Post -Uri "$uploadUrl`?name=$name" -Headers $upHdr -Body $bytes -TimeoutSec 600
    Write-Host "  Uploaded: $($resp.browser_download_url)" -ForegroundColor Green
}

Write-Host "`nDone. In-app update source: owner=$OWNER repo=$REPO" -ForegroundColor Green
Write-Host "Release page: $($rel.html_url)" -ForegroundColor Green
