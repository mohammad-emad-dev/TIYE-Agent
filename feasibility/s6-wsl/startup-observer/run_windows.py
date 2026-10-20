"""Protected harness for the synthetic Linux startup observer; no provider calls."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
sys.path.append(str(SOURCE.parent / 'native-inventory'))
import inspect_windows as transport

BOOTSTRAP = '''import sys,json,hashlib
raw=sys.stdin.buffer.readline(65537)
if len(raw)>65536 or not raw.endswith(b'\\n'): raise ValueError('bundle-bound')
bundle=json.loads(raw)
for member in bundle.values():
    if hashlib.sha256(member['source'].encode()).hexdigest()!=member['sha256']: raise ValueError('source-drift')
POLICY={'__name__':'frozen_helper_policy'}
exec(bundle['policy']['source'],POLICY)
OBSERVER={'__name__':'startup_observer','POLICY':POLICY}
exec(bundle['observer']['source'],OBSERVER)
TESTS={'__name__':'startup_observer_tests','OBSERVER':OBSERVER}
exec(bundle['tests']['source'],TESTS)
print(json.dumps(TESTS['run_tests']()))
'''


def validate(record):
    required = {'scope': 'synthetic-linux-startup-observer', 'tests': 4,
        'beforeActiveAfterVerified': True, 'heldPidfdExitVerified': True,
        'interruptedAliasesRetained': True, 'forbiddenInventoryRefused': True,
        'automaticRetryAllowed': False, 'candidateExecuted': False, 'nativeHelpersObserved': False,
        'effectivePathQualified': False, 'effectiveConfigurationResolved': False, 'nativeExecutionAllowed': False}
    if (type(record) is not dict or set(record) != set(required)
            or any(type(record[key]) is not type(expected) or record[key] != expected
                   for key, expected in required.items())):
        raise ValueError('observer-scope-or-promotion')


def bundle():
    paths = {'policy': SOURCE.parent / 'native-inventory/linux.py',
             'observer': SOURCE / 'observer.py', 'tests': SOURCE / 'tests_linux.py'}
    return {name: {'source': path.read_text(encoding='utf-8'),
                   'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for name, path in paths.items()}


def develop():
    system = Path(os.environ['SystemRoot'])
    flags = ['-I', '-S', '-B'] + (['-O'] if sys.flags.optimize else [])
    argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
            '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
            *flags, '-c', BOOTSTRAP]
    handles = contextlib.ExitStack()
    capture = transport.BudgetCapture(transport.composition.LeaseBudget('collector'))
    handles.callback(capture.close)
    files = transport.MetadataFiles(capture, capture.budget)
    handles.callback(files.close)
    process, threads = None, []
    try:
        packet = bundle()
        files.write('controller', 'attempt.json', transport.writer.encode({
            'scope': 'synthetic-startup-observer', 'sources': {name: part['sha256'] for name, part in packet.items()}}))
        process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        target = {'files': files, 'lock': threading.Lock(), 'errors': []}
        threads = [threading.Thread(target=transport.drain,
                   args=(target, name, getattr(process, name)), daemon=True) for name in ('stdout', 'stderr')]
        for thread in threads:
            thread.start()
        payload = transport.writer.encode(packet) + b'\n'
        if len(payload) > 65536 or process.stdin.write(payload) != len(payload):
            raise OSError('bundle-bound-or-short-write')
        process.stdin.close()
        code = process.wait(timeout=45)
        for thread in threads:
            thread.join(timeout=2)
        if code != 0 or target['errors'] or any(thread.is_alive() for thread in threads) or bundle() != packet:
            raise RuntimeError('observer-tests-failed-private-diagnostics-retained')
        stdout = capture.storage.path / 'observer/stdout.bin'
        if (capture.storage.path / 'observer/stderr.bin').stat().st_size or stdout.stat().st_size > 8192:
            raise ValueError('observer-output-bound-or-diagnostic')
        report = json.loads(stdout.read_bytes())
        if set(report) != {'selected', 'privateRuns'}:
            raise ValueError('observer-harness-schema')
        validate(report['selected'])
        files.write('controller', 'outcome.json', transport.writer.encode(report))
        files.audit()
        destination = ROOT / '.git/tiye-startup-observer' / uuid.uuid4().hex
        destination.mkdir(parents=True)
        (destination / 'observations.json').write_text(json.dumps(report['selected'], indent=2) + '\n', encoding='utf-8')
        (destination / 'private-locator.json').write_text(json.dumps({'path': str(capture.storage.path)}) + '\n')
        print('Synthetic startup observer passed: ' + str(destination / 'observations.json'))
    except BaseException:
        (ROOT / '.git/tiye-startup-observer-failure.json').write_text(
            json.dumps({'privateDiagnosticRoot': str(capture.storage.path)}), encoding='utf-8')
        raise
    finally:
        transport.close_readers(handles, process, threads)


if __name__ == '__main__':
    develop()
