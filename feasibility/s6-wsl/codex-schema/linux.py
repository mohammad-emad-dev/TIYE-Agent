"""Generate schemas from the pinned Linux binary without starting an app-server."""
import base64
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    config = json.loads(sys.stdin.read())
    binary = Path(config['binary'])
    assert os.getuid() != 0 and binary.is_file() and binary.resolve() == binary
    assert sha(binary) == config['binarySha256']
    with binary.open('rb') as stream:
        assert stream.read(4) == b'\x7fELF'
    root = Path(tempfile.mkdtemp(prefix='tiye-codex-schema-', dir='/tmp'))
    (root / '.owner').write_text(config['nonce'], encoding='utf-8')
    for name in ['home', 'codex-home', 'tmp']:
        (root / name).mkdir()
    env = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'HOME': str(root / 'home'),
           'CODEX_HOME': str(root / 'codex-home'), 'TMPDIR': str(root / 'tmp')}
    schema_root = root / 'schemas'
    commands = [['--version'], ['app-server', 'generate-json-schema', '--help'],
                ['app-server', 'generate-json-schema', '--out', str(schema_root)]]
    results = []
    for args in commands:
        result = subprocess.run([str(binary), *args], cwd=root, env=env, capture_output=True, timeout=12)
        results.append({'args': args, 'exitCode': result.returncode,
                        'stdout': result.stdout.decode('utf-8'), 'stderr': result.stderr.decode('utf-8')})
        if result.returncode != 0:
            print(json.dumps({'root': str(root), 'results': results, 'state': 'incomplete'}))
            return 1
        if args == ['--version']:
            assert results[-1]['stdout'].strip() == 'codex-cli 0.157.1'
        elif args[-1] == '--help':
            assert '--out' in results[-1]['stdout']
    paths = sorted(schema_root.rglob('*'))
    assert paths and all(not p.is_symlink() for p in paths)
    files = [p for p in paths if p.is_file()]
    assert 0 < len(files) < 2000 and sum(p.stat().st_size for p in files) < 30000000
    inventory = []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for p in files:
            assert p.suffix == '.json' and p.resolve().is_relative_to(schema_root.resolve())
            raw = p.read_bytes()
            json.loads(raw)
            name = p.relative_to(schema_root).as_posix()
            inventory.append({'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
            archive.writestr(name, raw)
    assert sha(binary) == config['binarySha256']
    packed = buffer.getvalue()
    print(json.dumps({'state': 'schema-generated', 'root': str(root), 'uid': os.getuid(),
                      'binary': str(binary), 'binarySha256': sha(binary), 'results': results,
                      'inventory': inventory, 'archiveSha256': hashlib.sha256(packed).hexdigest(),
                      'archiveBase64': base64.b64encode(packed).decode('ascii'),
                      'runtimeRetained': True, 'modelRequestRun': False, 'appServerSessionStarted': False}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
