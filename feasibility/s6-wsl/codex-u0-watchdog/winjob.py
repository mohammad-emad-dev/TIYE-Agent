import ctypes
import math
import os
import subprocess
import time
from ctypes import wintypes

if os.name != 'nt':
    raise OSError('ChildJob is available only on Windows')

_CREATE_SUSPENDED = 0x00000004
_CREATE_NO_WINDOW = 0x08000000
_EXTENDED_STARTUPINFO_PRESENT = 0x00080000
_PROC_THREAD_ATTRIBUTE_JOB_LIST = 0x0002000D
_JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
_JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION = 1
_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
_WAIT_OBJECT_0 = 0
_WAIT_TIMEOUT = 258
_WAIT_FAILED = 0xFFFFFFFF
_MAX_WAIT_MS = 0xFFFFFFFE
_CLEANUP_WAIT_MS = 5000


class _STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD), ('lpReserved', wintypes.LPWSTR),
        ('lpDesktop', wintypes.LPWSTR), ('lpTitle', wintypes.LPWSTR),
        ('dwX', wintypes.DWORD), ('dwY', wintypes.DWORD),
        ('dwXSize', wintypes.DWORD), ('dwYSize', wintypes.DWORD),
        ('dwXCountChars', wintypes.DWORD), ('dwYCountChars', wintypes.DWORD),
        ('dwFillAttribute', wintypes.DWORD), ('dwFlags', wintypes.DWORD),
        ('wShowWindow', wintypes.WORD), ('cbReserved2', wintypes.WORD),
        ('lpReserved2', ctypes.c_void_p), ('hStdInput', wintypes.HANDLE),
        ('hStdOutput', wintypes.HANDLE), ('hStdError', wintypes.HANDLE),
    ]


class _PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('hProcess', wintypes.HANDLE), ('hThread', wintypes.HANDLE),
        ('dwProcessId', wintypes.DWORD), ('dwThreadId', wintypes.DWORD),
    ]


class _STARTUPINFOEXW(ctypes.Structure):
    _fields_ = [('StartupInfo', _STARTUPINFOW), ('lpAttributeList', ctypes.c_void_p)]


class _BASIC_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('PerProcessUserTimeLimit', ctypes.c_longlong),
        ('PerJobUserTimeLimit', ctypes.c_longlong),
        ('LimitFlags', wintypes.DWORD),
        ('MinimumWorkingSetSize', ctypes.c_size_t),
        ('MaximumWorkingSetSize', ctypes.c_size_t),
        ('ActiveProcessLimit', wintypes.DWORD),
        ('Affinity', ctypes.c_size_t),
        ('PriorityClass', wintypes.DWORD),
        ('SchedulingClass', wintypes.DWORD),
    ]


class _IO_COUNTERS(ctypes.Structure):
    _fields_ = [(name, ctypes.c_ulonglong) for name in (
        'ReadOperationCount', 'WriteOperationCount', 'OtherOperationCount',
        'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount')]


class _EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('BasicLimitInformation', _BASIC_LIMIT_INFORMATION),
        ('IoInfo', _IO_COUNTERS),
        ('ProcessMemoryLimit', ctypes.c_size_t),
        ('JobMemoryLimit', ctypes.c_size_t),
        ('PeakProcessMemoryUsed', ctypes.c_size_t),
        ('PeakJobMemoryUsed', ctypes.c_size_t),
    ]


class _BASIC_ACCOUNTING_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('TotalUserTime', ctypes.c_longlong),
        ('TotalKernelTime', ctypes.c_longlong),
        ('ThisPeriodTotalUserTime', ctypes.c_longlong),
        ('ThisPeriodTotalKernelTime', ctypes.c_longlong),
        ('TotalPageFaultCount', wintypes.DWORD),
        ('TotalProcesses', wintypes.DWORD),
        ('ActiveProcesses', wintypes.DWORD),
        ('TotalTerminatedProcesses', wintypes.DWORD),
    ]


_kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
_CreateProcessW = _kernel32.CreateProcessW
_CreateProcessW.restype = wintypes.BOOL
_CreateProcessW.argtypes = [
    wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p, ctypes.c_void_p,
    wintypes.BOOL, wintypes.DWORD, ctypes.c_void_p, wintypes.LPCWSTR,
    ctypes.POINTER(_STARTUPINFOW), ctypes.POINTER(_PROCESS_INFORMATION),
]
_CreateJobObjectW = _kernel32.CreateJobObjectW
_CreateJobObjectW.restype = wintypes.HANDLE
_CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
_SetInformationJobObject = _kernel32.SetInformationJobObject
_SetInformationJobObject.restype = wintypes.BOOL
_SetInformationJobObject.argtypes = [
    wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD,
]
_InitializeAttributes = _kernel32.InitializeProcThreadAttributeList
_InitializeAttributes.restype = wintypes.BOOL
_InitializeAttributes.argtypes = [ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(ctypes.c_size_t)]
_UpdateAttribute = _kernel32.UpdateProcThreadAttribute
_UpdateAttribute.restype = wintypes.BOOL
_UpdateAttribute.argtypes = [ctypes.c_void_p, wintypes.DWORD, ctypes.c_size_t,
                           ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_void_p]
_DeleteAttributes = _kernel32.DeleteProcThreadAttributeList
_DeleteAttributes.restype = None
_DeleteAttributes.argtypes = [ctypes.c_void_p]
_ResumeThread = _kernel32.ResumeThread
_ResumeThread.restype = wintypes.DWORD
_ResumeThread.argtypes = [wintypes.HANDLE]
_TerminateProcess = _kernel32.TerminateProcess
_TerminateProcess.restype = wintypes.BOOL
_TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
_TerminateJobObject = _kernel32.TerminateJobObject
_TerminateJobObject.restype = wintypes.BOOL
_TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
_WaitForSingleObject = _kernel32.WaitForSingleObject
_WaitForSingleObject.restype = wintypes.DWORD
_WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
_GetExitCodeProcess = _kernel32.GetExitCodeProcess
_GetExitCodeProcess.restype = wintypes.BOOL
_GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
_QueryInformationJobObject = _kernel32.QueryInformationJobObject
_QueryInformationJobObject.restype = wintypes.BOOL
_QueryInformationJobObject.argtypes = [
    wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD),
]
_CloseHandle = _kernel32.CloseHandle
_CloseHandle.restype = wintypes.BOOL
_CloseHandle.argtypes = [wintypes.HANDLE]


def _win_error(operation):
    code = ctypes.get_last_error()
    return OSError(f'{operation} failed: {ctypes.WinError(code)}')


def _format_win_error(operation, code):
    return f'{operation} failed: {ctypes.WinError(code)}'


class _JobAttributes:
    def __init__(self, handle):
        size = ctypes.c_size_t()
        if _InitializeAttributes(None, 1, 0, ctypes.byref(size)) or ctypes.get_last_error() != 122:
            raise OSError('Unexpected attribute-list sizing result')
        self.buffer = ctypes.create_string_buffer(size.value)
        self.handles = (wintypes.HANDLE * 1)(handle)
        if not _InitializeAttributes(self.buffer, 1, 0, ctypes.byref(size)):
            raise _win_error('InitializeProcThreadAttributeList')
        try:
            if not _UpdateAttribute(self.buffer, 0, _PROC_THREAD_ATTRIBUTE_JOB_LIST,
                                    self.handles, ctypes.sizeof(self.handles), None, None):
                raise _win_error('UpdateProcThreadAttribute job list')
        except BaseException:
            _DeleteAttributes(self.buffer)
            raise

    def close(self):
        _DeleteAttributes(self.buffer)


class ChildJob:
    def __init__(self, argv, cwd):
        if isinstance(argv, (str, bytes)):
            raise TypeError('argv must be a nonempty sequence of strings')
        args = tuple(argv)
        if not args:
            raise ValueError('argv must not be empty')
        if any(not isinstance(item, str) for item in args):
            raise TypeError('every argv item must be a string')
        if any(chr(0) in item for item in args):
            raise ValueError('argv items cannot contain NUL characters')
        if not os.path.isabs(args[0]) or not os.path.isfile(args[0]):
            raise ValueError('argv[0] must be an absolute path to an existing file')
        cwd = os.fsdecode(os.fspath(cwd))
        if chr(0) in cwd or not os.path.isdir(cwd):
            raise ValueError('cwd must be an existing directory')

        self.pid = None
        self.process_handle = None
        self._thread_handle = None
        self._job_handle = None
        self._resumed = False
        try:
            self._create(args, cwd)
        except BaseException as exc:
            cleanup_errors = self._abort_creation()
            if cleanup_errors:
                exc.cleanup_owner = self
                detail = 'Creation cleanup errors: ' + '; '.join(cleanup_errors)
                if hasattr(exc, 'add_note'):
                    exc.add_note(detail)
                else:
                    raise RuntimeError(f'{exc}; {detail}') from exc
            raise

    def _create(self, argv, cwd):
        self._job_handle = _CreateJobObjectW(None, None)
        if not self._job_handle:
            self._job_handle = None
            raise _win_error('CreateJobObjectW')
        limits = _EXTENDED_LIMIT_INFORMATION()
        limits.BasicLimitInformation.LimitFlags = _JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not _SetInformationJobObject(
            self._job_handle, _JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
            ctypes.cast(ctypes.byref(limits), ctypes.c_void_p), ctypes.sizeof(limits),
        ):
            raise _win_error('SetInformationJobObject')
        # Assign at creation: a supervisor crash cannot strand an unassigned child.
        attributes = _JobAttributes(self._job_handle)
        try:
            self._start_suspended(argv, cwd, attributes)
        finally:
            attributes.close()

    def resume(self):
        if self._resumed:
            raise RuntimeError('Child has already been resumed')
        self._require_open('_thread_handle')
        result = _ResumeThread(self._thread_handle)
        if result == _WAIT_FAILED:
            raise _win_error('ResumeThread')
        if result != 1:
            raise OSError('Unexpected initial thread suspend count')
        self._resumed = True

    def _start_suspended(self, argv, cwd, attributes):
        startup = _STARTUPINFOEXW()
        startup.StartupInfo.cb = ctypes.sizeof(startup)
        startup.lpAttributeList = ctypes.cast(attributes.buffer, ctypes.c_void_p)
        info = _PROCESS_INFORMATION()
        command_line = ctypes.create_unicode_buffer(subprocess.list2cmdline(argv))
        created = _CreateProcessW(argv[0], command_line, None, None, False,
            _CREATE_SUSPENDED | _CREATE_NO_WINDOW | _EXTENDED_STARTUPINFO_PRESENT,
            None, cwd, ctypes.cast(ctypes.byref(startup), ctypes.POINTER(_STARTUPINFOW)),
            ctypes.byref(info))
        self.process_handle = info.hProcess or None
        self._thread_handle = info.hThread or None
        if not created:
            raise _win_error('CreateProcessW')
        if self.process_handle is None or self._thread_handle is None:
            raise OSError('CreateProcessW did not return owned handles')
        self.pid = int(info.dwProcessId)

    def _close_one(self, attribute, errors):
        handle = getattr(self, attribute)
        if handle is None:
            return
        if _CloseHandle(handle):
            setattr(self, attribute, None)
        else:
            code = ctypes.get_last_error()
            errors.append(_format_win_error('CloseHandle', code))

    def _abort_creation(self):
        errors = []
        if self.process_handle is not None:
            if not _TerminateProcess(self.process_handle, 1):
                code = ctypes.get_last_error()
                errors.append(_format_win_error('TerminateProcess during cleanup', code))
        self._close_one('_job_handle', errors)
        if self.process_handle is not None:
            result = _WaitForSingleObject(self.process_handle, _CLEANUP_WAIT_MS)
            if result == _WAIT_TIMEOUT:
                errors.append('Owned process did not exit within the cleanup wait bound')
            elif result == _WAIT_FAILED:
                code = ctypes.get_last_error()
                errors.append(_format_win_error('WaitForSingleObject during cleanup', code))
            elif result != _WAIT_OBJECT_0:
                errors.append(f'Unexpected cleanup wait result: 0x{result:08X}')
            if result != _WAIT_OBJECT_0:
                # Exception retains this owner so a caller can recover via held handles.
                return errors
        self._close_one('process_handle', errors)
        self._close_one('_thread_handle', errors)
        return errors

    def _require_open(self, attribute):
        handle = getattr(self, attribute)
        if handle is None:
            raise RuntimeError('ChildJob is closed')
        return handle

    def wait(self, seconds):
        handle = self._require_open('process_handle')
        try:
            timeout = float(seconds)
        except (TypeError, ValueError, OverflowError):
            raise ValueError('seconds must be a finite nonnegative number') from None
        if not math.isfinite(timeout) or timeout < 0:
            raise ValueError('seconds must be a finite nonnegative number')
        milliseconds = (_MAX_WAIT_MS if timeout >= _MAX_WAIT_MS / 1000
                        else math.ceil(timeout * 1000))
        result = _WaitForSingleObject(handle, milliseconds)
        if result == _WAIT_OBJECT_0:
            return True
        if result == _WAIT_TIMEOUT:
            return False
        if result == _WAIT_FAILED:
            raise _win_error('WaitForSingleObject')
        raise OSError(f'Unexpected WaitForSingleObject result: 0x{result:08X}')

    def exit_code(self):
        handle = self._require_open('process_handle')
        result = _WaitForSingleObject(handle, 0)
        if result == _WAIT_TIMEOUT:
            return None
        if result == _WAIT_FAILED:
            raise _win_error('WaitForSingleObject')
        if result != _WAIT_OBJECT_0:
            raise OSError(f'Unexpected WaitForSingleObject result: 0x{result:08X}')
        code = wintypes.DWORD()
        if not _GetExitCodeProcess(handle, ctypes.byref(code)):
            raise _win_error('GetExitCodeProcess')
        return int(code.value)

    def active_count(self):
        job = self._require_open('_job_handle')
        info = _BASIC_ACCOUNTING_INFORMATION()
        if not _QueryInformationJobObject(
            job, _JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION,
            ctypes.cast(ctypes.byref(info), ctypes.c_void_p), ctypes.sizeof(info), None,
        ):
            raise _win_error('QueryInformationJobObject')
        return int(info.ActiveProcesses)

    def terminate(self, exit_code=124):
        job = self._require_open('_job_handle')
        if not isinstance(exit_code, int) or not 0 <= exit_code <= 0xFFFFFFFF:
            raise ValueError('exit_code must be an integer in the DWORD range')
        if not _TerminateJobObject(job, exit_code):
            raise _win_error('TerminateJobObject')

    def close(self):
        if self._job_handle is not None and self.active_count():
            self.terminate(125)
            deadline = time.monotonic() + 2
            while self.active_count() and time.monotonic() < deadline:
                time.sleep(0.01)
            if self.active_count():
                error = OSError('Job cleanup unverified; owner handles retained')
                error.cleanup_owner = self
                raise error
        if self.process_handle is not None and not self.wait(0):
            if not _TerminateProcess(self.process_handle, 125):
                error = _win_error('TerminateProcess during close')
                error.cleanup_owner = self
                raise error
            if not self.wait(2):
                error = OSError('Owned process cleanup unverified; handle retained')
                error.cleanup_owner = self
                raise error
        errors = []
        self._close_one('_job_handle', errors)
        self._close_one('process_handle', errors)
        self._close_one('_thread_handle', errors)
        if errors:
            error = OSError('; '.join(errors))
            error.cleanup_owner = self
            raise error

    def __enter__(self):
        self._require_open('_job_handle')
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
        return False
