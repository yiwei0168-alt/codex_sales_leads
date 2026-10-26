param([Parameter(Mandatory=$true)][string]$WorkspaceRoot)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$processes=@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($WorkspaceRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object {
    @{pid=[int]$_.ProcessId;name=$_.Name;commandLine=$_.CommandLine;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}
})
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3001,2024,8765) } | ForEach-Object { @{port=[int]$_.LocalPort;address=$_.LocalAddress;pid=[int]$_.OwningProcess} })
$docker=@(Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue).Count -gt 0
@{processes=$processes;listeners=$listeners;dockerDesktopRunning=$docker} | ConvertTo-Json -Depth 5 -Compress
