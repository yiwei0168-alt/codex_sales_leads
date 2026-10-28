param([ValidateSet('Start','Install','Status','Uninstall')][string]$Action='Status')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$config=Get-Content -LiteralPath (Join-Path $root '.local-runtime\lan-gateway.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$runtime=Get-Content -LiteralPath (Join-Path $root '.local-runtime\config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$entry=Join-Path $PSScriptRoot 'lan-test-gateway.mjs'
$taskName='CodexSalesLeads-LanTestGateway'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$PSCommandPath+'" -Action Start'
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing){
 $owner=$existing.Principal.UserId
 if(-not $owner.StartsWith('S-1-')){$owner=(New-Object Security.Principal.NTAccount($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($owner -ne $sid -or $existing.Actions.Count -ne 1 -or $existing.Actions[0].Arguments -ne $arguments){throw 'Existing gateway task has another owner/action'}
}
if($Action -eq 'Install'){
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User $sid
 $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
 $actionEntry=New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments -WorkingDirectory $root
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Principal $principal -Action $actionEntry -Settings $settings -Description 'Current-user company LAN HTTPS test gateway; product backend stays on loopback.' -Force | Out-Null
 Start-ScheduledTask -TaskName $taskName
}elseif($Action -eq 'Uninstall'){
 if($existing){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
}elseif($Action -eq 'Start'){
 $lock=New-Object Threading.Mutex($false,'Local\CodexSalesLeadsLanGateway')
 $held=$false
 try{
  try{$held=$lock.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
  if(-not $held){exit 0}
  $listeners=@(Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue)
  if($listeners.Count){
   foreach($listener in $listeners){
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
    if($listener.LocalAddress -ne $config.address -or -not $process.CommandLine.Contains('"'+$entry+'"')){throw 'Gateway port has an unrecognized listener'}
   }
  }else{
   $child=Start-Process -FilePath $runtime.nodeExecutable -ArgumentList ('"'+$entry+'"') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.local-runtime\logs\lan-gateway.stdout.log') -RedirectStandardError (Join-Path $root '.local-runtime\logs\lan-gateway.stderr.log') -PassThru
   $ready=$false
   for($attempt=0;$attempt -lt 20;$attempt++){
    Start-Sleep -Milliseconds 500
    if($child.HasExited){throw 'Gateway exited during startup; inspect private logs'}
    $bound=@(Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalAddress -eq $config.address -and $_.OwningProcess -eq $child.Id})
    if($bound.Count){$ready=$true;break}
   }
   if(-not $ready){throw 'Gateway did not bind before startup deadline'}
  }
 }finally{if($held){$lock.ReleaseMutex()};$lock.Dispose()}
}
@{taskName=$taskName;url=('https://'+$config.address+':'+$config.port);listeners=@(Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,OwningProcess)} | ConvertTo-Json -Depth 3 -Compress
