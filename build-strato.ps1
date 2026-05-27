# ============================================================
#  MEINS! - Strato-Upload-Paket bauen
#  Doppelklick (oder: .\build-strato.ps1) baut:
#   - strato-upload\   (Ordner mit allen Dateien)
#   - meinsgame-strato.zip
# ============================================================

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

Write-Host "==> Baue Strato-Upload-Paket..." -ForegroundColor Cyan

# Alte Version weg
if (Test-Path "$root\strato-upload") {
  Remove-Item -Recurse -Force "$root\strato-upload"
}
if (Test-Path "$root\meinsgame-strato.zip") {
  Remove-Item -Force "$root\meinsgame-strato.zip"
}

# Neuen Ordner anlegen
New-Item -ItemType Directory "$root\strato-upload" | Out-Null

# Root-Dateien kopieren
$rootFiles = @('index.html','styles.css','manifest.webmanifest','service-worker.js','.htaccess')
foreach ($f in $rootFiles) {
  if (Test-Path "$root\$f") {
    Copy-Item "$root\$f" "$root\strato-upload\"
    Write-Host "    + $f" -ForegroundColor Gray
  } else {
    Write-Warning "    Fehlt: $f"
  }
}

# Ordner kopieren
foreach ($dir in @('src','assets')) {
  if (Test-Path "$root\$dir") {
    Copy-Item -Recurse "$root\$dir" "$root\strato-upload\$dir"
    Write-Host "    + $dir\" -ForegroundColor Gray
  }
}

# ZIP packen
Write-Host "==> Erstelle meinsgame-strato.zip..." -ForegroundColor Cyan
Compress-Archive -Path "$root\strato-upload\*" -DestinationPath "$root\meinsgame-strato.zip" -Force

# Service-Worker-Version anzeigen
$swContent = Get-Content "$root\service-worker.js" -Raw
if ($swContent -match "meins-v4-[\d-]+\w?") {
  Write-Host "==> Cache-Version: $($Matches[0])" -ForegroundColor Yellow
}

# Zusammenfassung
$zip = Get-Item "$root\meinsgame-strato.zip"
$fileCount = (Get-ChildItem -Recurse "$root\strato-upload" -File).Count
Write-Host ""
Write-Host "FERTIG!" -ForegroundColor Green
Write-Host "  Ordner: strato-upload\  ($fileCount Dateien)" -ForegroundColor White
Write-Host "  ZIP:    meinsgame-strato.zip  ($([math]::Round($zip.Length/1KB,1)) KB)" -ForegroundColor White
Write-Host ""
Write-Host "Naechster Schritt: STRATO-UPLOAD-ANLEITUNG.txt lesen." -ForegroundColor Cyan
Write-Host ""

if ($Host.Name -eq 'ConsoleHost') {
  Write-Host "Druecke eine Taste zum Schliessen..." -ForegroundColor DarkGray
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
