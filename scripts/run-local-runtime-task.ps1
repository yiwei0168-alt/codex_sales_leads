$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$config=Get-Content -LiteralPath (Join-Path $root '.local-runtime\config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ([IO.Path]::GetFullPath($config.workspace) -ne $root) {throw 'Wrong workspace configuration'}
$entry=Join-Path $PSScriptRoot 'start-local-runtime.mjs'
$stdout=Join-Path $root '.local-runtime\task.stdout.log'
$stderr=Join-Path $root '.local-runtime\task.stderr.log'
$child=Start-Process -FilePath $config.nodeExecutable -ArgumentList @(('"'+$entry+'"'),'start') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Wait -PassThru
exit $child.ExitCode
