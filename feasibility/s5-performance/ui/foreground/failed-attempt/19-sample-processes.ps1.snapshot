$ErrorActionPreference = 'Stop'
$sampleRequest = [Console]::In.ReadToEnd() | ConvertFrom-Json
if (@($sampleRequest).Count -lt 1 -or @($sampleRequest).Count -gt 32) { throw 'invalid-process-count' }
$sampleRows = foreach ($requestedPid in $sampleRequest) {
    if ($requestedPid -isnot [int] -or $requestedPid -le 0) { throw 'invalid-process-id' }
    $sampleProcess = $null
    try {
        $sampleProcess = [Diagnostics.Process]::GetProcessById($requestedPid)
        $sampleProcess.Refresh()
        [ordered]@{
            pid = $requestedPid
            status = 'present'
            identity = $sampleProcess.StartTime.ToUniversalTime().Ticks.ToString()
            sampledAtMs = [Diagnostics.Stopwatch]::GetTimestamp() * 1000.0 / [Diagnostics.Stopwatch]::Frequency
            cpuMs = $sampleProcess.TotalProcessorTime.TotalMilliseconds
            workingSetBytes = $sampleProcess.WorkingSet64
            privateBytes = $sampleProcess.PrivateMemorySize64
        }
    } catch [ArgumentException] {
        [ordered]@{ pid = $requestedPid; status = 'exited' }
    } catch [InvalidOperationException] {
        [ordered]@{ pid = $requestedPid; status = 'exited' }
    } catch [ComponentModel.Win32Exception] {
        [ordered]@{ pid = $requestedPid; status = 'unavailable' }
    } finally {
        if ($null -ne $sampleProcess) { $sampleProcess.Dispose() }
    }
}
ConvertTo-Json -InputObject @($sampleRows) -Depth 4 -Compress
