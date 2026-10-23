param([Parameter(Mandatory=$true)][string]$Root,[ValidateSet('Create','Verify')][string]$Mode='Verify')
$ErrorActionPreference='Stop'
$resolvedRoot=[IO.Path]::GetFullPath($Root)
$temporaryParent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
if ([IO.Path]::GetDirectoryName($resolvedRoot) -ne $temporaryParent -or [IO.Path]::GetFileName($resolvedRoot) -notmatch '^tiye-core-[0-9a-f-]{36}$') { throw 'Unowned fixture root' }
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if ($Mode -eq 'Create') {
  if (Test-Path -LiteralPath $resolvedRoot) { throw 'Fixture already exists' }
  [IO.Directory]::CreateDirectory($resolvedRoot) | Out-Null
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetOwner($identity.User)
  $acl.SetAccessRuleProtection($true,$false)
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity.User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
  [IO.Directory]::SetAccessControl($resolvedRoot,$acl)
}
$cursor=$resolvedRoot
while ($cursor) {
  $entry=Get-Item -LiteralPath $cursor -Force
  if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point refused' }
  $parent=[IO.Path]::GetDirectoryName($cursor)
  if ($parent -eq $cursor) { break }
  $cursor=$parent
}
$verified=[IO.Directory]::GetAccessControl($resolvedRoot)
if ($verified.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.User.Value -or -not $verified.AreAccessRulesProtected) { throw 'Root owner or DACL mismatch' }
$rules=$verified.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
if ($rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $identity.User.Value -or $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') { throw 'Unexpected root access rule' }
Write-Output 'PRIVATE_ROOT_VERIFIED'
