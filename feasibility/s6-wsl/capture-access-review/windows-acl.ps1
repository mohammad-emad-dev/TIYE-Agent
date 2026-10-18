$ErrorActionPreference = 'Stop'
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1"
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Get-PrincipalRole($sid) {
    if ($sid -eq $currentSid) { return 'current-user' }
    switch ($sid) {
        'S-1-5-18' { return 'system' }
        'S-1-5-32-544' { return 'administrators' }
        'S-1-1-0' { return 'everyone' }
        'S-1-5-11' { return 'authenticated-users' }
        'S-1-5-32-545' { return 'users' }
        default { return 'unclassified-principal' }
    }
}
$observations = foreach ($target in $request.targets) {
    $acl = Get-Acl -LiteralPath $target.path
    $descriptor = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
    $daclState = 'absent'
    if (($descriptor.ControlFlags -band [System.Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -ne 0) {
        $daclState = if ($null -eq $descriptor.DiscretionaryAcl) { 'null' } else { 'present' }
    }
    $aces = foreach ($ace in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
        [ordered]@{
            principalRole = Get-PrincipalRole $ace.IdentityReference.Value
            rights = ([long]$ace.FileSystemRights -band 4294967295)
            accessType = $ace.AccessControlType.ToString()
            inherited = $ace.IsInherited
            inheritanceFlags = [int]$ace.InheritanceFlags
            propagationFlags = [int]$ace.PropagationFlags
        }
    }
    [ordered]@{
        target = $target.label
        ownerRole = Get-PrincipalRole ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value)
        daclState = $daclState
        daclProtected = $acl.AreAccessRulesProtected
        daclCanonical = $acl.AreAccessRulesCanonical
        aces = @($aces)
    }
}
ConvertTo-Json -InputObject @($observations) -Depth 8 -Compress
