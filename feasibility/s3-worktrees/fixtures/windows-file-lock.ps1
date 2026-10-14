param([string]$FilePath,[string]$ReadyPath,[string]$ReleasePath,[string]$Nonce)
$ErrorActionPreference = 'Stop'
$heldFile = $null
try {
  $heldFile = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
  [System.IO.File]::WriteAllText($ReadyPath, $Nonce)
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ([System.IO.File]::Exists($ReleasePath)) {
      if ([System.IO.File]::ReadAllText($ReleasePath) -ne $Nonce) { throw 'Unowned release marker' }
      exit 0
    }
    Start-Sleep -Milliseconds 25
  }
  throw 'Owned lock fixture deadline'
} catch {
  [Console]::Error.WriteLine('Owned Windows file lock fixture failed')
  exit 2
} finally {
  if ($null -ne $heldFile) { $heldFile.Dispose() }
}
