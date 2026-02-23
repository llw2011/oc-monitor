$ErrorActionPreference = 'SilentlyContinue'

$Server = 'http://127.0.0.1:3888'
$StateFile = 'D:\oc-monitor-v21\runtime\win-agent-state.json'
$NodeName = 'Wolf-Server'

function Get-IPv4 {
  try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1'} | Select-Object -First 1 -ExpandProperty IPAddress)
    if ($ip) { return $ip }
  } catch {}
  return '127.0.0.1'
}

function Load-State {
  if (Test-Path $StateFile) {
    try { return (Get-Content -Raw $StateFile | ConvertFrom-Json) } catch {}
  }
  return @{}
}

function Save-State($obj) {
  $obj | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
}

function Register-Agent {
  $body = @{
    name = $NodeName
    hostname = $env:COMPUTERNAME
    ip = (Get-IPv4)
    os = 'Windows'
  } | ConvertTo-Json

  return Invoke-RestMethod -Method Post -Uri "$Server/api/agent/register" -ContentType 'application/json' -Body $body -TimeoutSec 8
}

function Get-Metrics {
  $cpu = 0
  $memUsed = 0
  $memTotal = 0
  $diskUsed = 0
  $diskTotal = 0
  try {
    $cpu = [math]::Round((Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples[0].CookedValue, 2)
  } catch {}
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $memTotal = [int64]$os.TotalVisibleMemorySize * 1024
    $memFree = [int64]$os.FreePhysicalMemory * 1024
    $memUsed = $memTotal - $memFree
  } catch {}
  try {
    $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    if ($d) {
      $diskTotal = [int64]$d.Size
      $diskUsed = [int64]$d.Size - [int64]$d.FreeSpace
    }
  } catch {}

  return @{
    cpu_percent = $cpu
    mem_used_bytes = $memUsed
    mem_total_bytes = $memTotal
    disk_used_bytes = $diskUsed
    disk_total_bytes = $diskTotal
    swap_used_bytes = 0
    swap_total_bytes = 0
    uptime_sec = 0
    load_1m = 0
  }
}

$state = Load-State
if (-not $state.token) {
  $reg = Register-Agent
  $state = @{ token = $reg.token; agent_id = $reg.agent_id }
  Save-State $state
}

while ($true) {
  try {
    $metrics = Get-Metrics | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$Server/api/agent/heartbeat" -Headers @{ Authorization = "Bearer $($state.token)" } -ContentType 'application/json' -Body $metrics -TimeoutSec 8 | Out-Null
  } catch {
    try {
      $reg = Register-Agent
      $state = @{ token = $reg.token; agent_id = $reg.agent_id }
      Save-State $state
    } catch {}
  }
  Start-Sleep -Seconds 15
}
