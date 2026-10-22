"""Private bounded capture for the separate fixed observer-loss qualification."""
import base64
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import threading
import uuid

import build

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
spec = importlib.util.spec_from_file_location('broker_private_transport',
                                            SOURCE.parent / 'native-inventory/inspect_windows.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
MODES = ('observer-exit', 'observer-kill', 'unexpected-node')
BOOT = '''import base64,hashlib,json,sys
wire=sys.stdin.buffer.readline(65537)
if len(wire)>65536 or not wire.endswith(b'\\n'): raise ValueError('bundle-bound')
p=json.loads(wire);s=base64.b64decode(p['sourceBase64'],validate=True)
if hashlib.sha256(s).hexdigest()!=p['sha256']: raise ValueError('bundle-digest')
exec(compile(s,'synthetic_retention_broker','exec'),{'__name__':'__main__','BUNDLE':p})
'''


def sources():
    paths = [*SOURCE.glob('*.py'), *build.COMPONENTS.values(),
             SOURCE.parent / 'limited-observer/build.py', SOURCE.parent / 'native-inventory/inspect_windows.py']
    return {**transport.composition.sources(),
            **{path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
               for path in sorted(paths)}}


def validate(record):
    if (type(record) is not dict or set(record) != {'scope', 'cases', 'candidateExecuted', 'nativeExecutionAllowed'}
            or record['scope'] != 'fixed-synthetic-observer-loss-broker' or record['candidateExecuted'] is not False
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != len(MODES)):
        raise ValueError('broker-observation-scope')
    for row, mode in zip(record['cases'], MODES):
        expected = {'mode': mode, 'observerEndedVerified': True, 'serviceCleanupVerified': True,
                    'copyVerified': mode != 'unexpected-node', 'retainedAfterBrokerExit': mode != 'unexpected-node',
                    'unknownHeldAcrossControlEof': mode == 'unexpected-node',
                    'invalidReleaseRefusedWithoutDisposal': mode == 'unexpected-node', 'nativeExecutionAllowed': False}
        if (type(row) is not dict or set(row) != set(expected) or row['mode'] != mode
                or any(row[key] is not value for key, value in expected.items() if key != 'mode')):
            raise ValueError('broker-observation-promotion-or-incomplete')


def validate_private_runs(records):
    if type(records) is not list or len(records) != len(MODES):
        raise ValueError('broker-private-locator-count')
    for row, mode in zip(records, MODES):
        if (type(row) is not dict or set(row) != {'root', 'retention', 'mode'} or row['mode'] != mode
                or type(row['root']) is not str or not row['root'].startswith('/tmp/tiye-charged-')):
            raise ValueError('broker-private-locator-schema')
        if mode == 'unexpected-node':
            if row['retention'] is not None:
                raise ValueError('unknown-cannot-claim-copy')
        elif type(row['retention']) is not str or not row['retention'].startswith('/tmp/tiye-limited-retained-'):
            raise ValueError('broker-copy-private-locator')


def develop():
    bound = sources()
    source = (SOURCE / 'linux_runtime.py').read_bytes()
    if source != build.generated():
        raise ValueError('broker-generated-source-drift')
    system = Path(os.environ['SystemRoot'])
    command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
               '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
               '-I', '-S', '-B', '-c', BOOT]
    handles = contextlib.ExitStack()
    capture = transport.BudgetCapture(transport.composition.LeaseBudget('collector'))
    handles.callback(capture.close)
    files = transport.MetadataFiles(capture, capture.budget)
    handles.callback(files.close)
    process, threads = None, []
    try:
        files.write('controller', 'attempt.json', transport.writer.encode({'scope': 'fixed-retention-broker',
                                                                         'sources': bound}))
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        target = {'files': files, 'lock': threading.Lock(), 'errors': []}
        threads = [threading.Thread(target=transport.drain,
                    args=(target, name, getattr(process, name)), daemon=True) for name in ('stdout', 'stderr')]
        for thread in threads:
            thread.start()
        payload = transport.writer.encode({'sourceBase64': base64.b64encode(source).decode('ascii'),
                                           'sha256': hashlib.sha256(source).hexdigest()}) + b'\n'
        if len(payload) > 65536 or process.stdin.write(payload) != len(payload):
            raise ValueError('broker-bundle-write-bound')
        process.stdin.close()
        code = process.wait(timeout=60)
        for thread in threads:
            thread.join(timeout=2)
        if code != 0 or target['errors'] or any(thread.is_alive() for thread in threads):
            raise RuntimeError('broker-fixtures-failed-private-diagnostics-retained')
        stdout, stderr = (capture.storage.path / ('observer/' + name + '.bin') for name in ('stdout', 'stderr'))
        if stderr.stat().st_size or stdout.stat().st_size > 4096:
            raise ValueError('unexpected-broker-output')
        private_record = json.loads(stdout.read_bytes())
        private_runs = private_record.pop('privateRuns')
        validate_private_runs(private_runs)
        selected = private_record
        validate(selected)
        if sources() != bound:
            raise ValueError('broker-source-drift')
        files.write('controller', 'outcome.json', transport.writer.encode(selected))
        files.audit()
        destination = ROOT / '.git/tiye-retention-broker' / uuid.uuid4().hex
        destination.mkdir(parents=True)
        for name, document in [('observations.json', selected), ('sources.json', bound),
                               ('private-locator.json', {'path': str(capture.storage.path)})]:
            (destination / name).write_text(json.dumps(document, indent=2) + '\n', encoding='utf-8')
        print('Three retention-broker cases passed: ' + str(destination / 'observations.json'))
    except BaseException:
        (ROOT / '.git/tiye-retention-broker-failure.json').write_text(json.dumps(
            {'privateDiagnosticRoot': str(capture.storage.path)}), encoding='utf-8')
        raise
    finally:
        if process is not None and process.stdin and not process.stdin.closed:
            process.stdin.close()
        transport.close_readers(handles, process, threads)


if __name__ == '__main__':
    develop()
