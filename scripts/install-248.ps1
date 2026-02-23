$ErrorActionPreference = 'Stop'

$Root = 'D:\oc-monitor-v21'
$ServerDir = Join-Path $Root 'server'
$Runtime = 'D:\oc-monitor-v21\runtime'
$LogDir = Join-Path $Runtime 'logs'
$PidFile = Join-Path $Runtime 'server.pid'
$TokenFile = Join-Path $Runtime 'dashboard.token'
$AdminPassFile = Join-Path $Runtime 'admin.pass'
$SessionSecretFile = Join-Path $Runtime 'session.secret'
$DbPath = Join-Path $Runtime 'monitor.db'
$NodeDir = 'D:\tools\node-v22.14.0-win-x64'
$NodeExe = Join-Path $NodeDir 'node.exe'
$NpmCmd = Join-Path $NodeDir 'npm.cmd'

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (!(Test-Path $NodeExe)) {
  throw "Node runtime not found at $NodeExe"
}

if (!(Test-Path $TokenFile)) {
  $bytes = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  ($bytes | ForEach-Object { $_.ToString('x2') }) -join '' | Set-Content -NoNewline -Path $TokenFile
}
if (!(Test-Path $AdminPassFile)) {
  $bytes = New-Object byte[] 8
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  ($bytes | ForEach-Object { $_.ToString('x2') }) -join '' | Set-Content -NoNewline -Path $AdminPassFile
}
if (!(Test-Path $SessionSecretFile)) {
  $bytes = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  ($bytes | ForEach-Object { $_.ToString('x2') }) -join '' | Set-Content -NoNewline -Path $SessionSecretFile
}
$DashToken = (Get-Content -Raw $TokenFile).Trim()
$AdminPass = (Get-Content -Raw $AdminPassFile).Trim()
$SessionSecret = (Get-Content -Raw $SessionSecretFile).Trim()

Push-Location $ServerDir
& $NpmCmd install --silent
Pop-Location

$StartCmd = @"
@echo off
set PORT=3888
set DB_PATH=$DbPath
set DASHBOARD_TOKEN=$DashToken
set ADMIN_USER=admin
set ADMIN_PASS=$AdminPass
set SESSION_SECRET=$SessionSecret
set SESSION_TTL_SEC=86400
set PROVIDER_TARGETS=lmstudio7b=http://192.168.10.248:8085/v1/models;lmstudio3b=http://192.168.10.248:8088/v1/models;ollama=http://192.168.10.248:11438/v1/models
set ALERT_NOTIFY_ENABLED=0
set ALERT_NOTIFY_MIN_INTERVAL_SEC=300
set TELEGRAM_BOT_TOKEN=
set TELEGRAM_CHAT_ID=
cd /d $ServerDir
""$NodeExe"" index.js >> "$LogDir\server.out" 2>&1
"@
$StartPath = Join-Path $Runtime 'start-3888.cmd'
$StartCmd | Set-Content -Encoding ASCII -Path $StartPath

if (Test-Path $PidFile) {
  try {
    $oldPid = Get-Content -Raw $PidFile
    if ($oldPid) { Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
  Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
}

$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $StartPath -WindowStyle Hidden -PassThru
$p.Id | Set-Content -NoNewline -Path $PidFile

Start-Sleep -Seconds 2

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:3888/healthz' -TimeoutSec 5
$maskedToken = if ($DashToken.Length -gt 8) { ('***' + $DashToken.Substring($DashToken.Length-8)) } else { '***' }
Write-Output "OK port=3888 pid=$($p.Id) token=$maskedToken admin=admin admin_pass=*** health_ok=$($health.ok)"
