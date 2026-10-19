"""Run only passive Python inspection; persist bounded diagnostics privately."""
import base64
import contextlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
sys.path.append(str(SOURCE.parent / 'resource-watchdog'))
import composition
from resources import BudgetCapture, MetadataFiles, writer

if Path(composition.__file__).resolve() != SOURCE.parent / 'resource-watchdog/composition.py':
    raise RuntimeError('inspection-accounting-binding')

RETAINED = []


def validate(document):
    fields = {'scope', 'filesMatched', 'exactPackageInventoryMatched', 'policyTests', 'configPresence',
              'candidateExecuted', 'credentialContentsRead', 'keyringQueried', 'nativeHelpersObserved',
              'effectiveConfigurationResolved', 'nativeExecutionAllowed'}
    if (type(document) is not dict or set(document) != fields
            or document['scope'] != 'passive-complete-package-and-fixed-config-metadata'
            or type(document['filesMatched']) is not int or document['filesMatched'] != 44
            or document['exactPackageInventoryMatched'] is not True
            or type(document['policyTests']) is not int or document['policyTests'] != 3):
        raise ValueError('inspection-scope-or-count')
    for name in fields - {'scope', 'filesMatched', 'exactPackageInventoryMatched', 'policyTests', 'configPresence'}:
        if document[name] is not False:
            raise ValueError('inspection-promotion')
    import importlib.util
    spec = importlib.util.spec_from_file_location('passive_linux_policy', SOURCE / 'linux.py')
    policy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(policy)
    if (type(document['configPresence']) is not dict or set(document['configPresence']) != set(policy.CONFIG_PATHS)
            or any(status not in ('absent-parent', 'absent-entry', 'present-link', 'present-entry',
                                  'unresolved-parent', 'unresolved-entry')
                   for status in document['configPresence'].values())):
        raise ValueError('config-metadata-scope')


def drain(target, name, pipe):
    discard = False
    try:
        while payload := pipe.read(writer.CHUNK):
            if not discard:
                try:
                    with target['lock']:
                        target['files'].write('observer', name + '.bin', payload)
                except (OSError, ValueError):
                    target['errors'].append('capture-limit-or-storage')
                    discard = True
    except OSError:
        target['errors'].append('reader-failed')


def inspect(optimized=False):
    installed = json.loads((ROOT / 'output/s4-codex-candidate/installation.json').read_text())['linux']
    frozen = (SOURCE.parent / 'native-preflight/inspect_linux.py').read_bytes()
    local = (SOURCE / 'linux.py').read_bytes()
    script = ('import base64;FROZEN={"__name__":"frozen_inventory"};exec(base64.b64decode('
              + repr(base64.b64encode(frozen).decode()) + '),FROZEN);exec(base64.b64decode('
              + repr(base64.b64encode(local).decode()) + '))')
    system = Path(os.environ['SystemRoot'])
    command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
               '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
               '-I', '-S', '-B'] + (['-O'] if optimized else []) + ['-c', script]
    handles = contextlib.ExitStack()
    capture = BudgetCapture(composition.LeaseBudget('collector'))
    handles.callback(capture.close)
    files = MetadataFiles(capture, capture.budget)
    handles.callback(files.close)
    process, threads = None, []
    try:
        files.write('controller', 'attempt.json', writer.encode({'scope': 'passive-inspection',
            'linuxSourceSha256': composition.sha(SOURCE / 'linux.py'),
            'frozenInspectorSha256': composition.sha(SOURCE.parent / 'native-preflight/inspect_linux.py'),
            'optimizedLinux': optimized}))
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        target = {'files': files, 'lock': threading.Lock(), 'errors': []}
        threads = [threading.Thread(target=drain, args=(target, name, getattr(process, name)), daemon=True)
                   for name in ('stdout', 'stderr')]
        for thread in threads:
            thread.start()
        payload = writer.encode({'package': installed['root'] + '/package', 'inventory': installed['inventory']}) + b'\n'
        if len(payload) > 65536 or process.stdin.write(payload) != len(payload):
            raise OSError('inspection-input-bound-or-short-write')
        process.stdin.close()
        code = process.wait(timeout=45)
        for thread in threads:
            thread.join(timeout=2)
        if any(thread.is_alive() for thread in threads) or target['errors'] or code != 0:
            raise RuntimeError('inspection-failed-private-diagnostics-retained')
        stderr = capture.storage.path / 'observer/stderr.bin'
        stdout = capture.storage.path / 'observer/stdout.bin'
        if stderr.stat().st_size or stdout.stat().st_size > 8192:
            raise ValueError('unexpected-inspection-output')
        selected = json.loads(stdout.read_bytes())
        validate(selected)
        files.write('controller', 'outcome.json', writer.encode(selected))
        files.audit()
        destination = ROOT / '.git/tiye-native-inventory' / uuid.uuid4().hex
        destination.mkdir(parents=True)
        (destination / 'inspection.json').write_text(json.dumps(selected, indent=2) + '\n', encoding='utf-8')
        (destination / 'private-locator.json').write_text(json.dumps({'path': str(capture.storage.path)}) + '\n')
        print('Passive package/config inspection passed: ' + str(destination / 'inspection.json'))
        return selected
    except BaseException:
        (ROOT / '.git/tiye-native-inventory-failure.json').write_text(
            json.dumps({'privateDiagnosticRoot': str(capture.storage.path)}), encoding='utf-8')
        raise
    finally:
        close_readers(handles, process, threads)


def close_readers(handles, process, threads):
    try:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for thread in threads:
            thread.join(timeout=2)
        if any(thread.is_alive() for thread in threads):
            raise RuntimeError('inspection-readers-unsettled-handles-retained')
        if process is not None:
            process.stdout.close()
            process.stderr.close()
        handles.close()
    except BaseException:
        RETAINED.append((handles, process, threads))
        raise


if __name__ == '__main__':
    inspect('--optimized-linux' in sys.argv[1:])
