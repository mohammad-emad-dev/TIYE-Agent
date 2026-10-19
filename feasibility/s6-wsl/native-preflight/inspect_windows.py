"""Owned-account WSL package rehash, with raw diagnostics in protected storage."""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]


def inspect():
    sys.path.insert(0, str(SOURCE.parent / 'private-capture-store'))
    import store
    installed = json.loads((ROOT / 'output/s4-codex-candidate/installation.json').read_text())['linux']
    packet = {'package': installed['root'] + '/package', 'inventory': installed['inventory']}
    code = base64.b64encode((SOURCE / 'inspect_linux.py').read_bytes()).decode('ascii')
    script = 'import base64;exec(base64.b64decode(' + repr(code) + '))'
    system = Path(os.environ['SystemRoot'])
    protected = store.create_store()
    try:
        capture = protected.new_run(uuid.uuid4().hex)
        command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--exec', '/usr/bin/env', '-i',
                   'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-I', '-S', '-B', '-c', script]
        result = subprocess.run(command, input=json.dumps(packet).encode('utf-8') + b'\n',
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32'),
                 'TEMP': str(capture.path), 'TMP': str(capture.path)}, creationflags=subprocess.CREATE_NO_WINDOW)
        capture.write_bytes('stdout.bin', result.stdout)
        capture.write_bytes('stderr.bin', result.stderr)
        if result.returncode != 0 or result.stderr:
            raise ValueError('package-inspection-failed-private-diagnostics-retained')
        document = json.loads(result.stdout)
        expected = {'scope': 'listed-package-bytes-only-no-execution', 'filesMatched': len(installed['inventory']),
                    'allListedDigestsMatched': True, 'uidMatched': True, 'candidateExecuted': False,
                    'credentialFilesRead': False, 'authStatusRequested': False}
        if set(document) != set(expected) or any(type(document[key]) is not type(value)
                or document[key] != value for key, value in expected.items()):
            raise ValueError('unexpected-inspection-output')
        target = ROOT / '.git/tiye-native-inspection' / uuid.uuid4().hex
        target.mkdir(parents=True)
        (target / 'inspection.json').write_text(json.dumps(expected, indent=2) + '\n', encoding='utf-8')
        print('Read-only listed package rehash matched; candidate not executed')
        print('Selected result: ' + target.relative_to(ROOT).as_posix())
        return expected
    finally:
        protected.close()
