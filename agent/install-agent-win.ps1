param(
  [string]$Server = 'http://127.0.0.1:3888',
  [string]$NodeName = $env:COMPUTERNAME,
  [int]$Interval = 15,
  [string]$TaskName = 'OC-Monitor-Agent'
)

$ErrorActionPreference = 'Stop'
$Base = Join-Path $env:USERPROFILE '.oc-monitor-agent'
New-Item -ItemType Directory -Force -Path $Base | Out-Null

$ScriptSrc = Join-Path $PSScriptRoot 'win-agent.ps1'
$ScriptDst = Join-Path $Base 'win-agent.ps1'
Copy-Item -Force $ScriptSrc $ScriptDst

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptDst`" -Server `"$Server`" -NodeName `"$NodeName`" -Interval $Interval"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "OK task=$TaskName server=$Server node=$NodeName interval=${Interval}s"
Write-Output "State file: $Base\\state.json"
