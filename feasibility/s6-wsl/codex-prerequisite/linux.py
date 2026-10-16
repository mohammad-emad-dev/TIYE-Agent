"""Install one pinned official package in a fresh fixture; run version/help only."""
import hashlib
import json
import os
import platform
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    config = json.loads(sys.stdin.read())
    assert os.getuid() != 0 and platform.machine() == 'x86_64'
    archive = Path(config['archive'])
    assert sha(archive) == config['sha256']
    parent = Path.home() / '.local/share/tiye-feasibility'
    parent.mkdir(parents=True, exist_ok=True)
    assert parent.resolve().is_relative_to(Path.home().resolve()) and parent.stat().st_uid == os.getuid()
    root = Path(tempfile.mkdtemp(prefix='codex-0.157.1-', dir=parent))
    (root / '.owner').write_text(config['nonce'], encoding='utf-8')
    package = root / 'package'
    package.mkdir()
    with tarfile.open(archive, 'r:gz') as bundle:
        members = bundle.getmembers()
        assert len(members) < 5000 and sum(m.size for m in members) < 1024 * 1024 * 1024
        for member in members:
            relative = PurePosixPath(member.name)
            assert not relative.is_absolute() and '..' not in relative.parts
            assert member.isfile() or member.isdir(), member.name
            target = package.joinpath(*relative.parts)
            assert target.resolve().is_relative_to(package.resolve())
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as incoming, target.open('xb') as outgoing:
                    while block := incoming.read(1024 * 1024):
                        outgoing.write(block)
                target.chmod(0o755 if member.mode & stat.S_IXUSR else 0o644)
    inventory = [{'path': p.relative_to(package).as_posix(), 'bytes': p.stat().st_size,
                  'sha256': sha(p), 'elf': p.open('rb').read(4).hex() == '7f454c46'}
                 for p in sorted(package.rglob('*')) if p.is_file()]
    candidates = [item for item in inventory if item['elf'] and Path(item['path']).name == 'codex']
    assert len(candidates) == 1, 'Require exactly one native ELF codex binary; do not guess or execute wrappers'
    binary = package / candidates[0]['path']
    isolated_home = root / 'isolated-home'
    isolated_home.mkdir()
    codex_home = root / 'codex-home'
    codex_home.mkdir()
    env = {'PATH': '/usr/bin:/bin', 'HOME': str(isolated_home), 'CODEX_HOME': str(codex_home),
           'LC_ALL': 'C.UTF-8', 'TMPDIR': str(root)}
    results = []
    for args in [['--version'], ['--help'], ['app-server', '--help']]:
        child = subprocess.run([str(binary), *args], cwd=root, env=env, capture_output=True, timeout=10)
        result = {'args': args, 'exitCode': child.returncode, 'stdout': child.stdout.decode('utf-8'),
                  'stderr': child.stderr.decode('utf-8')}
        results.append(result)
        assert child.returncode == 0, result
    assert results[0]['stdout'].strip() == 'codex-cli 0.157.1'
    assert '--model' in results[1]['stdout'] and '--listen' in results[2]['stdout']
    assert sha(binary) == candidates[0]['sha256']
    print(json.dumps({'uid': os.getuid(), 'machine': platform.machine(), 'root': str(root),
                      'binary': str(binary), 'binarySha256': sha(binary), 'inventory': inventory,
                      'results': results, 'fullS4Qualified': False, 'fullS6Qualified': False,
                      'modelRequestRun': False, 'credentialsRead': False, 'runtimeRetained': True}))


if __name__ == '__main__':
    main()
