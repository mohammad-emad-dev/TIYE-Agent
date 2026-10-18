"""Windows handle/descriptor boundary. Public snapshots omit actual SIDs."""
import contextlib
import ctypes as C
from ctypes import wintypes as W

KERNEL = C.WinDLL('kernel32', use_last_error=True)
ADVAPI = C.WinDLL('advapi32', use_last_error=True)
PTR = C.c_void_p


class SecurityAttributes(C.Structure):
    _fields_ = [('length', W.DWORD), ('descriptor', PTR), ('inherit', W.BOOL)]


class FileInformation(C.Structure):
    _fields_ = [('attributes', W.DWORD), ('created', W.FILETIME), ('accessed', W.FILETIME),
                ('written', W.FILETIME), ('volume', W.DWORD), ('sizeHigh', W.DWORD),
                ('sizeLow', W.DWORD), ('links', W.DWORD), ('indexHigh', W.DWORD), ('indexLow', W.DWORD)]


class AclHeader(C.Structure):
    _fields_ = [('revision', W.BYTE), ('unused', W.BYTE), ('size', W.WORD),
                ('count', W.WORD), ('unused2', W.WORD)]


def bind(library, name, arguments, returns):
    function = getattr(library, name)
    function.argtypes, function.restype = arguments, returns


bind(KERNEL, 'GetCurrentProcess', [], W.HANDLE)
bind(KERNEL, 'CloseHandle', [W.HANDLE], W.BOOL)
bind(KERNEL, 'LocalFree', [PTR], PTR)
bind(KERNEL, 'CreateDirectoryW', [W.LPCWSTR, C.POINTER(SecurityAttributes)], W.BOOL)
bind(KERNEL, 'CreateFileW', [W.LPCWSTR, W.DWORD, W.DWORD, PTR, W.DWORD, W.DWORD, W.HANDLE], W.HANDLE)
bind(KERNEL, 'GetFileInformationByHandle', [W.HANDLE, C.POINTER(FileInformation)], W.BOOL)
bind(ADVAPI, 'OpenProcessToken', [W.HANDLE, W.DWORD, C.POINTER(W.HANDLE)], W.BOOL)
bind(ADVAPI, 'GetTokenInformation', [W.HANDLE, C.c_int, PTR, W.DWORD, C.POINTER(W.DWORD)], W.BOOL)
bind(ADVAPI, 'ConvertSidToStringSidW', [PTR, C.POINTER(PTR)], W.BOOL)
bind(ADVAPI, 'ConvertStringSecurityDescriptorToSecurityDescriptorW',
     [W.LPCWSTR, W.DWORD, C.POINTER(PTR), C.POINTER(W.DWORD)], W.BOOL)
bind(ADVAPI, 'GetSecurityInfo', [W.HANDLE, C.c_int, W.DWORD] + [C.POINTER(PTR)] * 5, W.DWORD)
bind(ADVAPI, 'GetSecurityDescriptorControl', [PTR, C.POINTER(W.WORD), C.POINTER(W.DWORD)], W.BOOL)
bind(ADVAPI, 'GetAce', [PTR, W.DWORD, C.POINTER(PTR)], W.BOOL)


def checked(success):
    if not success:
        raise C.WinError(C.get_last_error())


def close(handle):
    checked(KERNEL.CloseHandle(handle))


def sid_string(sid):
    allocated = PTR()
    checked(ADVAPI.ConvertSidToStringSidW(sid, C.byref(allocated)))
    try:
        return C.wstring_at(allocated)
    finally:
        KERNEL.LocalFree(allocated)


def current_sid():
    token, size = W.HANDLE(), W.DWORD()
    checked(ADVAPI.OpenProcessToken(KERNEL.GetCurrentProcess(), 8, C.byref(token)))
    try:
        ADVAPI.GetTokenInformation(token, 1, None, 0, C.byref(size))
        if C.get_last_error() != 122 or not size.value:
            raise OSError('token-size-query-failed')
        buffer = C.create_string_buffer(size.value)
        checked(ADVAPI.GetTokenInformation(token, 1, buffer, size, C.byref(size)))
        return sid_string(PTR.from_buffer(buffer).value)
    finally:
        close(token)


@contextlib.contextmanager
def attributes(owner, flags):
    descriptor = PTR()
    sddl = 'O:' + owner + 'D:P' + ''.join('(A;' + flags + ';FA;;;' + sid + ')'
                                       for sid in (owner, 'SY', 'BA'))
    checked(ADVAPI.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, C.byref(descriptor), None))
    try:
        yield SecurityAttributes(C.sizeof(SecurityAttributes), descriptor, False)
    finally:
        KERNEL.LocalFree(descriptor)


def create_directory(path, owner):
    with attributes(owner, 'OICI') as security:
        checked(KERNEL.CreateDirectoryW(str(path), C.byref(security)))


def open_directory(path):
    handle = KERNEL.CreateFileW(str(path), 0x20080, 3, None, 3, 0x02200000, None)
    if handle == PTR(-1).value:
        raise C.WinError(C.get_last_error())
    return handle


def create_file(path, owner):
    with attributes(owner, '') as security:
        handle = KERNEL.CreateFileW(str(path), 0xc0020080, 1, C.byref(security), 1, 0x00200080, None)
        if handle == PTR(-1).value:
            raise C.WinError(C.get_last_error())
    return handle


def open_file(path):
    handle = KERNEL.CreateFileW(str(path), 0x80020080, 1, None, 3, 0x00200080, None)
    if handle == PTR(-1).value:
        raise C.WinError(C.get_last_error())
    return handle


def file_information(handle):
    observed = FileInformation()
    checked(KERNEL.GetFileInformationByHandle(handle, C.byref(observed)))
    if observed.attributes & 0x400:
        raise ValueError('reparse-point-refused')
    return observed


def rules(acl, owner):
    if not acl:
        raise ValueError('null-dacl-refused')
    count = C.cast(acl, C.POINTER(AclHeader)).contents.count
    observed = []
    for index in range(count):
        ace = PTR()
        checked(ADVAPI.GetAce(acl, index, C.byref(ace)))
        kind, flags = C.c_ubyte.from_address(ace.value).value, C.c_ubyte.from_address(ace.value + 1).value
        if kind != 0:
            raise ValueError('unexpected-ace-type')
        sid = sid_string(ace.value + 8)
        role = {owner: 'current-user', 'S-1-5-18': 'system', 'S-1-5-32-544': 'administrators'}.get(sid, 'other')
        observed.append({'role': role, 'mask': W.DWORD.from_address(ace.value + 4).value, 'flags': flags})
    return observed


def snapshot(handle, owner):
    pointers = [PTR() for unused in range(5)]
    status = ADVAPI.GetSecurityInfo(handle, 1, 5, *[C.byref(pointer) for pointer in pointers])
    if status:
        raise C.WinError(status)
    actual_owner, unused_group, acl, unused_sacl, descriptor = pointers
    try:
        control, revision = W.WORD(), W.DWORD()
        checked(ADVAPI.GetSecurityDescriptorControl(descriptor, C.byref(control), C.byref(revision)))
        identity = file_information(handle)
        return {'ownerMatchesCurrentToken': sid_string(actual_owner) == owner,
                'daclProtected': bool(control.value & 0x1000), 'daclPresent': bool(control.value & 4),
                'directory': bool(identity.attributes & 0x10), 'aces': rules(acl, owner)}
    finally:
        KERNEL.LocalFree(descriptor)


def verify_directory(handle, owner):
    observed = snapshot(handle, owner)
    expected = [{'role': role, 'mask': 0x1f01ff, 'flags': 3}
                for role in ('current-user', 'system', 'administrators')]
    if observed != {'ownerMatchesCurrentToken': True, 'daclProtected': True,
                    'daclPresent': True, 'directory': True, 'aces': expected}:
        raise ValueError('directory-security-mismatch')
    return observed


def verify_file(handle, owner):
    observed = snapshot(handle, owner)
    expected = [{'role': role, 'mask': 0x1f01ff, 'flags': 0}
                for role in ('current-user', 'system', 'administrators')]
    if observed != {'ownerMatchesCurrentToken': True, 'daclProtected': True,
                    'daclPresent': True, 'directory': False, 'aces': expected}:
        raise ValueError('file-security-mismatch')
    return observed
