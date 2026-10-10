# Standalone Windows Job Object feasibility controller (isolated, no Electron/PTY).
# No new npm dependencies: built-in Windows PowerShell + C# P/Invoke only.
#
# Contract (set by the task):
#   - Open the supplied test-child PID.
#   - Verify its creation identity using the SAME opened process handle
#     (GetProcessTimes vs caller-provided ISO time).
#   - Create an UNNAMED Job Object.
#   - Set JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
#   - Assign the verified child via AssignProcessToJobObject.
#   - Confirm IsProcessInJob.
#   - Print structured READY and hold the job handle until this process exits.
#   - Close the job handle on normal exit; abnormal termination closes it via
#     the OS (which is what triggers KILL_ON_JOB_CLOSE).
#
# Exit codes: setup failure exits non-zero quickly with a FAIL line (runner
# treats this as inconclusive, never a pass). Success never exits on its own:
# it holds until killed; the runner kills ONLY its runner-owned controller
# ChildProcess handle.
#
# Never taskkill / Stop-Process / PID-only kill here: this controller only
# ever opens the caller-supplied child PID for verification + assignment.

param(
  [Parameter(Mandatory = $true)][int]$ChildPid,
  [Parameter(Mandatory = $true)][string]$ChildCreationTime,
  [switch]$HoldUntilStdinClose
)

$ErrorActionPreference = 'Stop'

function Fail([string]$msg, [int]$win32 = 0) {
  if ($win32 -ne 0) {
    Write-Output "[job-controller] FAIL: $msg (Win32=$win32)"
  } else {
    Write-Output "[job-controller] FAIL: $msg"
  }
  exit 2
}

Write-Output "[job-controller] start childPid=$ChildPid expectedCreation=$ChildCreationTime controllerPid=$PID"

if ($ChildPid -le 0) { Fail "invalid child PID $ChildPid" }

try {
  $expectedUtc = ([DateTime]::Parse($ChildCreationTime)).ToUniversalTime()
} catch {
  Fail "caller-provided creation time is not parseable: '$ChildCreationTime' ($($_.Exception.Message))"
}

$csharp = @'
using System;
using System.Runtime.InteropServices;

public static class JobApi {
  [StructLayout(LayoutKind.Sequential)]
  public struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }

  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public Int64 PerProcessUserTimeLimit;
    public Int64 PerJobUserTimeLimit;
    public UInt32 LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public UInt32 ActiveProcessCount;
    public UIntPtr Affinity;
    public UInt32 PriorityClass;
    public UInt32 SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct IO_COUNTERS {
    public UInt64 ReadOperationCount;
    public UInt64 WriteOperationCount;
    public UInt64 OtherOperationCount;
    public UInt64 ReadTransferCount;
    public UInt64 WriteTransferCount;
    public UInt64 OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetProcessTimes(IntPtr hProcess, out FILETIME lpCreationTime, out FILETIME lpExitTime, out FILETIME lpKernelTime, out FILETIME lpUserTime);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInformationClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION lpJobObjectInformation, uint cbJobObjectInformationLength);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool QueryInformationJobObject(IntPtr hJob, int JobObjectInformationClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION lpJobObjectInformation, uint cbJobObjectInformationLength, out uint lpReturnLength);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool IsProcessInJob(IntPtr ProcessHandle, IntPtr JobHandle, out bool Result);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);
}
'@

try {
  Add-Type -TypeDefinition $csharp -Language CSharp -ErrorAction Stop
} catch {
  Fail "Add-Type failed: $($_.Exception.Message)"
}

# PROCESS_TERMINATE (0x0001) + PROCESS_SET_QUOTA (0x0100) are required by
# AssignProcessToJobObject; PROCESS_QUERY_INFORMATION (0x0400) is needed for
# GetProcessTimes / IsProcessInJob on the same handle.
$desiredAccess = 0x0001 -bor 0x0100 -bor 0x0400

$hProcess = [JobApi]::OpenProcess($desiredAccess, $false, [uint32]$ChildPid)
if ($hProcess -eq [IntPtr]::Zero) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Fail "OpenProcess(pid=$ChildPid, access=0x$($desiredAccess.ToString('X'))) failed" $err
}
Write-Output "[job-controller] opened child handle=0x$($hProcess.ToString('X')) (same handle used for identity check + assignment)"

# Verify creation identity using THE SAME opened handle.
$ftCreate = New-Object JobApi+FILETIME
$ftExit = New-Object JobApi+FILETIME
$ftKernel = New-Object JobApi+FILETIME
$ftUser = New-Object JobApi+FILETIME
if (-not [JobApi]::GetProcessTimes($hProcess, [ref]$ftCreate, [ref]$ftExit, [ref]$ftKernel, [ref]$ftUser)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [void][JobApi]::CloseHandle($hProcess)
  Fail "GetProcessTimes on the opened handle failed" $err
}
$createTicks = ([uint64]$ftCreate.dwHighDateTime -shl 32) -bor [uint64]$ftCreate.dwLowDateTime
try {
  $actualUtc = [DateTime]::FromFileTimeUtc([int64]$createTicks)
} catch {
  [void][JobApi]::CloseHandle($hProcess)
  Fail "FromFileTimeUtc failed for ticks=$createTicks ($($_.Exception.Message))"
}
$skewMs = [Math]::Abs(($actualUtc - $expectedUtc).TotalMilliseconds)
Write-Output "[job-controller] identity check: expected=$($expectedUtc.ToString('o')) actual=$($actualUtc.ToString('o')) skewMs=$([int]$skewMs)"
# CIM's exposed CreationDate can differ from GetProcessTimes by a few
# 100ns ticks (observed 5 ticks on this host). Bound that conversion skew
# to one microsecond; this remains a PID + creation-time check on the SAME
# opened process handle, rather than trusting the PID alone.
$skewTicks = [Math]::Abs($actualUtc.Ticks - $expectedUtc.Ticks)
if ($skewTicks -gt 10) {
  [void][JobApi]::CloseHandle($hProcess)
  Fail "creation-identity mismatch for pid=$ChildPid (skewTicks=$skewTicks > 10; refusing to assign)"
}

# Unnamed job: both attributes and name are null.
$hJob = [JobApi]::CreateJobObject([IntPtr]::Zero, $null)
if ($hJob -eq [IntPtr]::Zero) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [void][JobApi]::CloseHandle($hProcess)
  Fail "CreateJobObject(unnamed) failed" $err
}
Write-Output "[job-controller] created unnamed job handle=0x$($hJob.ToString('X'))"

$JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
$JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000

$info = New-Object JobApi+JOBOBJECT_EXTENDED_LIMIT_INFORMATION
# PowerShell returns a copy of a nested value-type property. Assign the
# modified struct back or the flag remains zero despite a successful API call.
$basic = $info.BasicLimitInformation
$basic.LimitFlags = [uint32]$JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
$info.BasicLimitInformation = $basic
$infoSize = [uint32][Runtime.InteropServices.Marshal]::SizeOf($info)
if (-not [JobApi]::SetInformationJobObject($hJob, $JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, [ref]$info, $infoSize)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [void][JobApi]::CloseHandle($hJob)
  [void][JobApi]::CloseHandle($hProcess)
  Fail "SetInformationJobObject(KILL_ON_JOB_CLOSE) failed" $err
}
$actualInfo = New-Object JobApi+JOBOBJECT_EXTENDED_LIMIT_INFORMATION
$returnedSize = [uint32]0
if (-not [JobApi]::QueryInformationJobObject($hJob, $JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, [ref]$actualInfo, $infoSize, [ref]$returnedSize)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [void][JobApi]::CloseHandle($hJob)
  [void][JobApi]::CloseHandle($hProcess)
  Fail "QueryInformationJobObject after limit setup failed" $err
}
$actualFlags = $actualInfo.BasicLimitInformation.LimitFlags
if (($actualFlags -band $JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) -eq 0) {
  [void][JobApi]::CloseHandle($hJob)
  [void][JobApi]::CloseHandle($hProcess)
  Fail "job limit read-back lacks KILL_ON_JOB_CLOSE (flags=0x$($actualFlags.ToString('X')))"
}
Write-Output "[job-controller] confirmed JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE read-back flags=0x$($actualFlags.ToString('X'))"

if (-not [JobApi]::AssignProcessToJobObject($hJob, $hProcess)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [void][JobApi]::CloseHandle($hJob)
  [void][JobApi]::CloseHandle($hProcess)
  Fail "AssignProcessToJobObject(pid=$ChildPid) failed" $err
}
Write-Output "[job-controller] assigned child pid=$ChildPid to job"

$result = $false
if (-not [JobApi]::IsProcessInJob($hProcess, $hJob, [ref]$result)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [void][JobApi]::CloseHandle($hJob)
  [void][JobApi]::CloseHandle($hProcess)
  Fail "IsProcessInJob(pid=$ChildPid) failed" $err
}
if (-not $result) {
  [void][JobApi]::CloseHandle($hJob)
  [void][JobApi]::CloseHandle($hProcess)
  Fail "IsProcessInJob(pid=$ChildPid) returned false after assignment"
}
Write-Output "[job-controller] confirmed IsProcessInJob(pid=$ChildPid)=true"
if ($HoldUntilStdinClose) {
  Write-Output "[job-controller] READY childPid=$ChildPid childCreation=$ChildCreationTime killOnJobClose=1 holdMode=stdin"
} else {
  Write-Output "[job-controller] READY childPid=$ChildPid childCreation=$ChildCreationTime killOnJobClose=1"
}

# Hold mode selection (opt-in only for the Electron crash-job experiment):
# - Absent (standalone smoke:job-probe): infinite sleep hold; the runner kills
#   only its runner-owned controller ChildProcess handle; behavior unchanged.
# - Present (-HoldUntilStdinClose, piped stdin from Electron main): read stdin
#   lines until EOF; EOF means Electron main died (its pipe closed), so exit
#   and let the OS close the last job handle (KILL_ON_JOB_CLOSE fires).
#   Narrow VERIFY command: "VERIFY <pid> <creationTimeISO>" opens that PID,
#   checks creation identity on the same handle (<=10 ticks skew), runs
#   IsProcessInJob against the held job, replies VERIFIED/VERIFY-FAIL, and
#   closes only the verify handle. Unknown lines reply UNKNOWN (never fail).
if ($HoldUntilStdinClose) {
  try {
    while ($true) {
      $line = $null
      try {
        $line = [Console]::In.ReadLine()
      } catch {
        Write-Output "[job-controller] FAIL: stdin read failed ($($_.Exception.Message))"
        exit 2
      }
      if ($null -eq $line) {
        Write-Output "[job-controller] stdin-closed closing job handle (main pipe EOF)"
        break
      }
      $trim = $line.Trim()
      if ($trim -eq '') { continue }
      if ($trim -eq 'EXIT') {
        Write-Output "[job-controller] EXIT requested, closing job handle"
        break
      }
      if ($trim.StartsWith('VERIFY ')) {
        $parts = $trim.Split(' ', 3, [System.StringSplitOptions]::RemoveEmptyEntries)
        if ($parts.Count -ne 3) {
          Write-Output "[job-controller] VERIFY-FAIL malformed (want 'VERIFY <pid> <creationTimeISO>')"
          continue
        }
        $vPid = 0
        if (-not [int]::TryParse($parts[1], [ref]$vPid) -or $vPid -le 0) {
          Write-Output "[job-controller] VERIFY-FAIL pid=$($parts[1]) malformed pid"
          continue
        }
        $vCreationRaw = $parts[2]
        try {
          $vExpectedUtc = ([DateTime]::Parse($vCreationRaw)).ToUniversalTime()
        } catch {
          Write-Output "[job-controller] VERIFY-FAIL pid=$vPid unparseable creation time '$vCreationRaw'"
          continue
        }
        $hVerify = [JobApi]::OpenProcess($desiredAccess, $false, [uint32]$vPid)
        if ($hVerify -eq [IntPtr]::Zero) {
          $werr = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
          Write-Output "[job-controller] VERIFY-FAIL pid=$vPid OpenProcess failed (Win32=$werr)"
          continue
        }
        try {
          $vCreate = New-Object JobApi+FILETIME
          $vExit = New-Object JobApi+FILETIME
          $vKernel = New-Object JobApi+FILETIME
          $vUser = New-Object JobApi+FILETIME
          if (-not [JobApi]::GetProcessTimes($hVerify, [ref]$vCreate, [ref]$vExit, [ref]$vKernel, [ref]$vUser)) {
            $werr = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            Write-Output "[job-controller] VERIFY-FAIL pid=$vPid GetProcessTimes failed (Win32=$werr)"
            continue
          }
          $vTicks = ([uint64]$vCreate.dwHighDateTime -shl 32) -bor [uint64]$vCreate.dwLowDateTime
          try {
            $vActualUtc = [DateTime]::FromFileTimeUtc([int64]$vTicks)
          } catch {
            Write-Output "[job-controller] VERIFY-FAIL pid=$vPid FromFileTimeUtc failed"
            continue
          }
          $vSkewTicks = [Math]::Abs($vActualUtc.Ticks - $vExpectedUtc.Ticks)
          if ($vSkewTicks -gt 10) {
            Write-Output "[job-controller] VERIFY-FAIL pid=$vPid creation-identity mismatch (skewTicks=$vSkewTicks > 10)"
            continue
          }
          $vInJob = $false
          if (-not [JobApi]::IsProcessInJob($hVerify, $hJob, [ref]$vInJob)) {
            $werr = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            Write-Output "[job-controller] VERIFY-FAIL pid=$vPid IsProcessInJob failed (Win32=$werr)"
            continue
          }
          Write-Output "[job-controller] VERIFIED pid=$vPid inJob=$vInJob skewTicks=$vSkewTicks"
        } finally {
          try { [void][JobApi]::CloseHandle($hVerify) } catch {}
        }
        continue
      }
      Write-Output "[job-controller] UNKNOWN command: $trim"
    }
  } finally {
    try { [void][JobApi]::CloseHandle($hJob) } catch {}
    try { [void][JobApi]::CloseHandle($hProcess) } catch {}
    Write-Output "[job-controller] closing job handle (stdin-hold exit path)"
  }
  exit 0
}

# Standalone hold (smoke:job-probe unchanged): hold until killed.
# Hold the job handle until this process exits. Normal exit closes it in
# finally; abnormal termination (runner kills this controller process via
# its handle) closes it via the OS -- either way KILL_ON_JOB_CLOSE fires.
try {
  while ($true) { Start-Sleep -Seconds 1 }
} finally {
  try { [void][JobApi]::CloseHandle($hJob) } catch {}
  try { [void][JobApi]::CloseHandle($hProcess) } catch {}
  Write-Output "[job-controller] closing job handle (normal exit path)"
}
