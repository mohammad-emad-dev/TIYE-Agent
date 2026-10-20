"""Bounded private transport for a separate fixed-fixture qualification."""
import base64
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
spec = importlib.util.spec_from_file_location('limits_private_transport',
                                            SOURCE.parent / 'native-inventory/inspect_windows.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)

EXPECTED = {
    'file': ['short-write-at-limit', 'write-EFBIG', 'truncate-EFBIG'],
    'bytes': ['bytes-ENOSPC', 'blocks-exhausted-inodes-available'],
    'inodes': ['inodes-ENOSPC', 'inodes-exhausted-blocks-available'],
    'privilege': ['hard-limit-raise-refused', 'remount-refused', 'exec-EACCES'],
}


def sources():
    paths = [*SOURCE.glob('*.py'), SOURCE.parent / 'native-inventory/inspect_windows.py']
    return {**transport.composition.sources(),
            **{path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
               for path in sorted(paths)}}


def validate(record):
    if (type(record) is not dict or set(record) != {'scope', 'cases', 'hostMountNamespaceUnchanged',
            'candidateExecuted', 'nativeExecutionAllowed'}
            or record['scope'] != 'fixed-disposable-filesystem-limit-fixtures'
            or record['hostMountNamespaceUnchanged'] is not True
            or record['candidateExecuted'] is not False or record['nativeExecutionAllowed'] is not False
            or type(record['cases']) is not list or len(record['cases']) != len(EXPECTED)):
        raise ValueError('fixture-result-scope')
    for row, (case, checks) in zip(record['cases'], EXPECTED.items()):
        if (type(row) is not dict or set(row) != {'case', 'checks', 'capless', 'noNewPrivileges',
                                                'plainUnmountVerified'}
                or row['case'] != case or row['checks'] != checks
                or any(row[key] is not True for key in ('capless', 'noNewPrivileges', 'plainUnmountVerified'))):
            raise ValueError('fixture-case-or-checks')


def develop():
    bound = sources()
    encoded = base64.b64encode((SOURCE / 'linux.py').read_bytes()).decode('ascii')
    system = Path(os.environ['SystemRoot'])
    command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
               '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
               '-I', '-S', '-B', '-c', 'import base64,sys;exec(base64.b64decode(sys.argv[1]))', encoded, 'outer']
    handles = contextlib.ExitStack()
    capture = transport.BudgetCapture(transport.composition.LeaseBudget('collector'))
    handles.callback(capture.close)
    files = transport.MetadataFiles(capture, capture.budget)
    handles.callback(files.close)
    process, threads = None, []
    try:
        files.write('controller', 'attempt.json', transport.writer.encode({'scope': 'fixed-limit-fixtures',
                                                                          'sources': bound}))
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        target = {'files': files, 'lock': threading.Lock(), 'errors': []}
        threads = [threading.Thread(target=transport.drain,
                    args=(target, name, getattr(process, name)), daemon=True) for name in ('stdout', 'stderr')]
        for thread in threads:
            thread.start()
        code = process.wait(timeout=45)
        for thread in threads:
            thread.join(timeout=2)
        if code != 0 or target['errors'] or any(thread.is_alive() for thread in threads):
            raise RuntimeError('fixture-failed-private-diagnostics-retained')
        stdout, stderr = (capture.storage.path / ('observer/' + name + '.bin') for name in ('stdout', 'stderr'))
        if stderr.stat().st_size or stdout.stat().st_size > 4096:
            raise ValueError('unexpected-fixture-output')
        record = json.loads(stdout.read_bytes())
        validate(record)
        if sources() != bound:
            raise ValueError('fixture-source-drift')
        files.write('controller', 'outcome.json', transport.writer.encode(record))
        files.audit()
        destination = ROOT / '.git/tiye-runtime-limits' / uuid.uuid4().hex
        destination.mkdir(parents=True)
        for name, document in [('observations.json', record), ('sources.json', bound),
                               ('private-locator.json', {'path': str(capture.storage.path)})]:
            (destination / name).write_text(json.dumps(document, indent=2) + '\n', encoding='utf-8')
        print('Four fixed filesystem-limit cases passed: ' + str(destination / 'observations.json'))
    except BaseException:
        (ROOT / '.git/tiye-runtime-limits-failure.json').write_text(json.dumps(
            {'privateDiagnosticRoot': str(capture.storage.path)}), encoding='utf-8')
        raise
    finally:
        transport.close_readers(handles, process, threads)


if __name__ == '__main__':
    develop()
