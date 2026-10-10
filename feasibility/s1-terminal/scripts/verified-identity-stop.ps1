# Verified-identity stop helper (isolated S1 9f safety primitive, no recovery).
# Standalone Windows PowerShell 5.1 + C# P/Invoke. No new npm dependencies.
#
# Contract:
#   powershell -File verified-identity-stop.ps1 -TargetPid <pid> -TargetCreationTime <iso>
#   - Opens ONLY the supplied PID with minimum rights
#     (PROCESS_TERMINATE 0x0001 + PROCESS_QUERY_LIMITED_INFORMATION 0x1000 + SYNCHRONIZE 0x00100000).
#   - Reads creation time via GetProcessTimes on THAT SAME opened handle.
#   - Compares against the caller ISO (parsed via [DateTime]::Parse, UTC).
#     Allows at most 10 x 100ns ticks of CIM/FileTime conversion skew.
#   - On mismatch: prints REFUSED, terminates NOTHING, closes the handle, exits 1.
#   - On match: calls TerminateProcess on the SAME handle, waits boundedly
#     (WaitForSingleObject, 5000ms) for exit on that handle, closes the handle
#     on all paths, prints STOPPED, exits 0.
#   - All other outcomes print FAIL and exit 2: absent PID, OpenProcess access
#     denial, GetProcessTimes/TerminateProcess/Wait failure, wait timeout,
#     unparseable time, malformed args (PID <= 0, missing params).
#
# Structured lines (stdout, prefix [verified-stop]):
#   start / opened / identity check / REFUSED / STOPPED / FAIL / closed
# Exit codes:
#   0 = STOPPED (identity matched on the same handle, process exited in bound)
#   1 = REFUSED (creation-identity mismatch; process NOT terminated)
#   2 = FAIL / non-pass (absent PID, access denied, API failure, timeout,
#       bad time, malformed args; process NOT proven stopped)
#
# Never taskkill / Stop-Process / PID-only kill / name matching. This script
# only ever acts through the single opened handle for the supplied PID.

param(
  [string]$TargetPid,
  [string]$TargetCreationTime
)

$ErrorActionPreference = 'Stop'

function Fail([string]$msg, [int]$win32 = 0) {
  if ($win32 -ne 0) {
    Write-Output "[verified-stop] FAIL: $msg (Win32=$win32)"
  } else {
    Write-Output "[verified-stop] FAIL: $msg"
  }
  exit 2
}

Write-Output "[verified-stop] start targetPid=$TargetPid expectedCreation=$TargetCreationTime helperPid=$PID"

$parsedPid = 0
if ([string]::IsNullOrWhiteSpace($TargetPid) -or -not [int]::TryParse($TargetPid, [ref]$parsedPid) -or $parsedPid -le 0) {
  Fail "invalid target PID '$TargetPid' (want positive integer)"
}
if ([string]::IsNullOrWhiteSpace($TargetCreationTime)) { Fail 'target creation time is required' }

try {
  $expectedUtc = ([DateTime]::Parse($TargetCreationTime)).ToUniversalTime()
} catch {
  Fail "caller-provided creation time is not parseable: '$TargetCreationTime' ($($_.Exception.Message))"
}

$csharp = @'
using System;
using System.Runtime.InteropServices;

public static class VerifiedStopApi {
  [StructLayout(LayoutKind.Sequential)]
  public struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetProcessTimes(IntPtr hProcess, out FILETIME lpCreationTime, out FILETIME lpExitTime, out FILETIME lpKernelTime, out FILETIME lpUserTime);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);
}
'@

try {
  Add-Type -TypeDefinition $csharp -Language CSharp -ErrorAction Stop
} catch {
  Fail "Add-Type failed: $($_.Exception.Message)"
}

# Minimum necessary rights: TERMINATE for TerminateProcess, QUERY_LIMITED_INFORMATION
# for GetProcessTimes on the same handle, SYNCHRONIZE for WaitForSingleObject.
$desiredAccess = 0x0001 -bor 0x1000 -bor 0x00100000

$hProcess = [VerifiedStopApi]::OpenProcess($desiredAccess, $false, [uint32]$TargetPid)
if ($hProcess -eq [IntPtr]::Zero) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Fail "OpenProcess(pid=$TargetPid, access=0x$($desiredAccess.ToString('X'))) failed" $err
}
Write-Output "[verified-stop] opened target handle=0x$($hProcess.ToString('X')) (same handle used for identity check + termination)"

$WAIT_MS = 5000
$WAIT_OBJECT_0 = 0
$WAIT_TIMEOUT = 0x102

try {
  $ftCreate = New-Object VerifiedStopApi+FILETIME
  $ftExit = New-Object VerifiedStopApi+FILETIME
  $ftKernel = New-Object VerifiedStopApi+FILETIME
  $ftUser = New-Object VerifiedStopApi+FILETIME
  if (-not [VerifiedStopApi]::GetProcessTimes($hProcess, [ref]$ftCreate, [ref]$ftExit, [ref]$ftKernel, [ref]$ftUser)) {
    $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [void][VerifiedStopApi]::CloseHandle($hProcess)
    $hProcess = [IntPtr]::Zero
    Fail "GetProcessTimes on the opened handle failed" $err
  }
  $createTicks = ([uint64]$ftCreate.dwHighDateTime -shl 32) -bor [uint64]$ftCreate.dwLowDateTime
  try {
    $actualUtc = [DateTime]::FromFileTimeUtc([int64]$createTicks)
  } catch {
    [void][VerifiedStopApi]::CloseHandle($hProcess)
    $hProcess = [IntPtr]::Zero
    Fail "FromFileTimeUtc failed for ticks=$createTicks ($($_.Exception.Message))"
  }
  $skewTicks = [Math]::Abs($actualUtc.Ticks - $expectedUtc.Ticks)
  Write-Output "[verified-stop] identity check: expected=$($expectedUtc.ToString('o')) actual=$($actualUtc.ToString('o')) skewTicks=$skewTicks (bound 10)"
  if ($skewTicks -gt 10) {
    Write-Output "[verified-stop] REFUSED pid=$TargetPid skewTicks=$skewTicks > 10 (no termination)"
    [void][VerifiedStopApi]::CloseHandle($hProcess)
    $hProcess = [IntPtr]::Zero
    Write-Output "[verified-stop] closed target handle (refused path)"
    exit 1
  }
  Write-Output "[verified-stop] identity matched pid=$TargetPid skewTicks=$skewTicks; terminating via SAME handle (TerminateProcess)"
  if (-not [VerifiedStopApi]::TerminateProcess($hProcess, 1)) {
    $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [void][VerifiedStopApi]::CloseHandle($hProcess)
    $hProcess = [IntPtr]::Zero
    Fail "TerminateProcess on the verified handle failed" $err
  }
  $wait = [VerifiedStopApi]::WaitForSingleObject($hProcess, [uint32]$WAIT_MS)
  if ($wait -eq $WAIT_OBJECT_0) {
    Write-Output "[verified-stop] STOPPED pid=$TargetPid (exited within ${WAIT_MS}ms)"
    [void][VerifiedStopApi]::CloseHandle($hProcess)
    $hProcess = [IntPtr]::Zero
    Write-Output "[verified-stop] closed target handle (stopped path)"
    exit 0
  } elseif ($wait -eq $WAIT_TIMEOUT) {
    [void][VerifiedStopApi]::CloseHandle($hProcess)
    $hProcess = [IntPtr]::Zero
    Fail "wait timed out after ${WAIT_MS}ms (process did not exit; no pass)"
  } else {
    $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [void][VerifiedStopApi]::CloseHandle($hProcess)
    $hProcess = [IntPtr]::Zero
    Fail "WaitForSingleObject on the verified handle failed (result=$wait)" $err
  }
} finally {
  try {
    if ($hProcess -ne [IntPtr]::Zero) {
      [void][VerifiedStopApi]::CloseHandle($hProcess)
      Write-Output "[verified-stop] closed target handle (all paths)"
    }
  } catch {}
}
