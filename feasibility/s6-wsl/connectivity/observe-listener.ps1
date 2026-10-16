param([Parameter(Mandatory=$true)][int]$Port)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535 -or $Port -eq 40900) { throw 'Invalid fixture port' }
$listeners = @([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $Port })
[pscustomobject]@{ port=$Port; tcpListenersAtPort=$listeners.Count; scope='Windows TCP listener-table observation only' } | ConvertTo-Json -Compress
