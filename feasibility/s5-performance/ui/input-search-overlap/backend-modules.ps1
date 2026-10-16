param([Parameter(Mandatory=$true)][int]$WorkerId)
$ErrorActionPreference = 'Stop'
$worker = Get-Process -Id $WorkerId -ErrorAction Stop
$modules = @($worker.Modules | Where-Object { $_.ModuleName -ieq 'conpty.dll' } | ForEach-Object {
    [pscustomobject]@{ name = $_.ModuleName; filename = $_.FileName }
})
ConvertTo-Json -InputObject $modules -Compress
