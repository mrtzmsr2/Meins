# Strato FTP-Upload-Skript fuer MEINS!
# Laedt den Inhalt von dist\ rekursiv auf den Strato-Webspace hoch.
# Verwendet WinSCP .NET-Assembly. Falls WinSCP nicht installiert ist,
# wird automatisch eine portable Version nach .\tools\winscp heruntergeladen.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$distPath = Join-Path $scriptDir 'dist'
if (-not (Test-Path $distPath)) {
    Write-Error "Ordner 'dist' nicht gefunden unter $distPath"
}

# ---- WinSCP-Assembly sicherstellen ----
$winscpDll = $null
$candidates = @(
    "C:\Program Files (x86)\WinSCP\WinSCPnet.dll",
    "C:\Program Files\WinSCP\WinSCPnet.dll",
    (Join-Path $scriptDir 'tools\winscp\WinSCPnet.dll')
)
foreach ($c in $candidates) {
    if (Test-Path $c) { $winscpDll = $c; break }
}

if (-not $winscpDll) {
    Write-Host "WinSCP wird heruntergeladen (portable)..." -ForegroundColor Cyan
    $toolsDir = Join-Path $scriptDir 'tools\winscp'
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    $zipUrl = 'https://winscp.net/download/WinSCP-6.3.5-Automation.zip'
    $zipPath = Join-Path $toolsDir 'winscp-automation.zip'
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
        Remove-Item $zipPath -Force
    } catch {
        Write-Error "Download von WinSCP fehlgeschlagen: $($_.Exception.Message)`nBitte WinSCP manuell installieren: https://winscp.net/eng/download.php"
    }
    $winscpDll = Join-Path $toolsDir 'WinSCPnet.dll'
    if (-not (Test-Path $winscpDll)) {
        Write-Error "WinSCPnet.dll nicht gefunden nach Download."
    }
}

Write-Host "Verwende WinSCP-Assembly: $winscpDll" -ForegroundColor DarkGray
Add-Type -Path $winscpDll

# ---- Eingaben ----
Write-Host ""
Write-Host "=== Strato FTP-Upload ===" -ForegroundColor Yellow
Write-Host "Daten findest du im Strato-Kundenbereich unter 'Paket-Verwaltung' -> 'FTP'."
Write-Host ""

$ftpHost = Read-Host "FTP-Server (z.B. ftp.strato.de)"
if ([string]::IsNullOrWhiteSpace($ftpHost)) { $ftpHost = 'ftp.strato.de' }
$ftpUser = Read-Host "FTP-Benutzername"
$ftpPassSecure = Read-Host "FTP-Passwort" -AsSecureString
$ftpPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ftpPassSecure))

$protoChoice = Read-Host "Protokoll: [1] FTP (Standard)  [2] FTPS (verschluesselt)  [Enter=1]"
$useFtps = ($protoChoice -eq '2')

$remoteRoot = Read-Host "Zielordner auf dem Server (Enter = '/')"
if ([string]::IsNullOrWhiteSpace($remoteRoot)) { $remoteRoot = '/' }
if (-not $remoteRoot.StartsWith('/')) { $remoteRoot = '/' + $remoteRoot }
if (-not $remoteRoot.EndsWith('/')) { $remoteRoot = $remoteRoot + '/' }

# ---- Session-Optionen ----
$sessionOptions = New-Object WinSCP.SessionOptions
$sessionOptions.Protocol = [WinSCP.Protocol]::Ftp
if ($useFtps) {
    $sessionOptions.FtpSecure = [WinSCP.FtpSecure]::Explicit
}
$sessionOptions.HostName = $ftpHost
$sessionOptions.UserName = $ftpUser
$sessionOptions.Password = $ftpPass

$session = New-Object WinSCP.Session
try {
    Write-Host ""
    Write-Host "Verbinde zu $ftpHost ..." -ForegroundColor Cyan
    $session.Open($sessionOptions)
    Write-Host "Verbunden." -ForegroundColor Green

    $transferOptions = New-Object WinSCP.TransferOptions
    $transferOptions.TransferMode = [WinSCP.TransferMode]::Binary
    $transferOptions.OverwriteMode = [WinSCP.OverwriteMode]::Overwrite

    $sourcePath = (Resolve-Path $distPath).Path
    # Trailing \* sorgt dafuer, dass der INHALT von dist\ hochgeladen wird
    $source = Join-Path $sourcePath '*'

    Write-Host ""
    Write-Host "Lade Inhalt von $sourcePath nach $remoteRoot hoch..." -ForegroundColor Cyan
    $result = $session.PutFiles($source, $remoteRoot, $false, $transferOptions)
    $result.Check()

    Write-Host ""
    Write-Host "Hochgeladene Dateien:" -ForegroundColor Green
    foreach ($t in $result.Transfers) {
        Write-Host ("  OK  {0}" -f $t.FileName)
    }
    Write-Host ""
    Write-Host "Fertig! Pruefe https://www.meinsgame.de" -ForegroundColor Yellow
} finally {
    $session.Dispose()
}
