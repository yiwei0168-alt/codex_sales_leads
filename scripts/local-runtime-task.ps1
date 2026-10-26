param([ValidateSet('Install','Uninstall','Run','Status')][string]$Action='Status')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$configPath=Join-Path $root '.local-runtime\config.json'
$config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([IO.Path]::GetFullPath($config.workspace) -ne $root) {throw 'Wrong workspace configuration'}
$hash=[Security.Cryptography.SHA256]::Create()
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
try {$suffix=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()+'|'+$sid)))).Replace('-','').Substring(0,12)} finally {$hash.Dispose()}
$taskName='CodexSalesLeads-LocalAcceptance-'+$suffix
$wrapper=Join-Path $PSScriptRoot 'run-local-runtime-task.ps1'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$wrapper+'"'
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$powershellPath=Join-Path $PSHOME 'powershell.exe'
if ($existing) {
    $owner=$existing.Principal.UserId
    if (-not $owner.StartsWith('S-1-')) {$owner=(New-Object Security.Principal.NTAccount($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
    if ($owner -ne $sid -or $existing.Actions.Count -ne 1 -or $existing.Actions[0].Arguments -ne $arguments -or $existing.Actions[0].Execute -ne $powershellPath) {throw 'Task name belongs to another user/action; refusing to replace it'}
}
if ($Action -eq 'Install') {
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User $sid
    $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
    $taskAction=New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $root
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'Start the verified localhost sales assistant after this user logs in; adopt healthy processes, keep secrets in local environment files.' -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
} elseif ($Action -eq 'Uninstall') {
    if ($existing) {Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
} elseif ($Action -eq 'Run') {
    if (-not $existing) {throw 'Startup task is not installed'}
    Start-ScheduledTask -TaskName $taskName
}
$current=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($current) {$info=Get-ScheduledTaskInfo -TaskName $taskName;@{taskName=$taskName;installed=$true;state=[string]$current.State;lastResult=$info.LastTaskResult;currentUserOnly=$true;runLevel=[string]$current.Principal.RunLevel} | ConvertTo-Json -Compress}
else {@{taskName=$taskName;installed=$false} | ConvertTo-Json -Compress}
