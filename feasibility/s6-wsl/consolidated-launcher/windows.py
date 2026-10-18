"""Held Windows process identities for the controlled cross-boundary fixture."""
import ctypes
from ctypes import wintypes as W

KERNEL = ctypes.WinDLL('kernel32', use_last_error=True)
KERNEL.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
KERNEL.OpenProcess.restype = W.HANDLE
KERNEL.CloseHandle.argtypes = [W.HANDLE]
KERNEL.CloseHandle.restype = W.BOOL
KERNEL.WaitForSingleObject.argtypes = [W.HANDLE, W.DWORD]
KERNEL.WaitForSingleObject.restype = W.DWORD
KERNEL.GetProcessTimes.argtypes = [W.HANDLE] + [ctypes.POINTER(W.FILETIME)] * 4
KERNEL.GetProcessTimes.restype = W.BOOL
KERNEL.TerminateProcess.argtypes = [W.HANDLE, W.UINT]
KERNEL.TerminateProcess.restype = W.BOOL


def open_process(pid):
    handle = KERNEL.OpenProcess(0x100000 | 0x1000 | 1, False, pid)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    return handle


def creation_time(handle):
    times = [W.FILETIME() for unused in range(4)]
    if not KERNEL.GetProcessTimes(handle, *[ctypes.byref(value) for value in times]):
        raise ctypes.WinError(ctypes.get_last_error())
    return times[0].dwLowDateTime | (times[0].dwHighDateTime << 32)


def signaled(handle, milliseconds=0):
    status = KERNEL.WaitForSingleObject(handle, milliseconds)
    if status not in (0, 258):
        raise OSError('Windows held-handle wait failed: ' + str(status))
    return status == 0


def close(handle):
    if not KERNEL.CloseHandle(handle):
        raise ctypes.WinError(ctypes.get_last_error())


def kill(handle):
    if not KERNEL.TerminateProcess(handle, 77):
        raise ctypes.WinError(ctypes.get_last_error())


def identity(pid, nonce):
    handle = open_process(pid)
    try:
        return {'pid': pid, 'creationTime': creation_time(handle), 'nonce': nonce}
    finally:
        close(handle)


def hold(expected, nonce):
    if expected['nonce'] != nonce:
        raise ValueError('Windows nonce mismatch')
    handle = open_process(expected['pid'])
    try:
        if creation_time(handle) != expected['creationTime'] or signaled(handle):
            raise ValueError('Windows process instance not live')
    except (OSError, ValueError):
        close(handle)
        raise
    return handle
