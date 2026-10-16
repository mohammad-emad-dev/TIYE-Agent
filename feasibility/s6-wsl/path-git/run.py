"""One-shot isolated path/Git capture; retained roots are never recursively deleted."""
import hashlib
import json
import ntpath
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s6-path-git'
PREFIX = ['wsl.exe', '-d', 'Ubuntu', '--exec', '/usr/bin/env', '-i',
          'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          'LC_ALL=C.UTF-8', 'GIT_CONFIG_NOSYSTEM=1', 'GIT_CONFIG_GLOBAL=/dev/null']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    protocol = json.loads((SOURCE / 'protocol.json').read_text())
    OUTPUT.mkdir(exist_ok=False)
    sources = [SOURCE / name for name in ['run.py', 'fixture.sh', 'protocol.json']]
    hashes = {p.relative_to(ROOT).as_posix(): digest(p) for p in sources}
    report = {'schema': 'tiye-s6-path-git-v1', 'state': 'running',
              'sourceHashes': hashes, 'queries': [], 'fixtures': [], 'paths': [],
              'fullS6Qualified': False, 'nativeWindowsGitInteropTested': False,
              'productionEligible': False, 'rootsRetained': True}
    def save():
        (OUTPUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    deadline = time.monotonic() + protocol['totalDeadlineSeconds']
    def query(label, args, script=None):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('Overall deadline exceeded')
        command = PREFIX + args
        entry = {'label': label, 'command': command, 'startedAt': datetime.now(timezone.utc).isoformat()}
        started = time.monotonic()
        try:
            result = subprocess.run(command, input=script, capture_output=True,
                                    timeout=min(protocol['queryTimeoutSeconds'], remaining))
            entry.update(exitCode=result.returncode, timedOut=False)
            stdout, stderr = result.stdout, result.stderr
        except subprocess.TimeoutExpired as error:
            entry.update(exitCode=None, timedOut=True)
            stdout, stderr = error.stdout or b'', error.stderr or b''
        entry['elapsedMs'] = (time.monotonic() - started) * 1000
        for stream, raw in [('stdout', stdout), ('stderr', stderr)]:
            path = OUTPUT / (label + '.' + stream + '.bin')
            path.write_bytes(raw)
            entry[stream] = {'artifact': path.name, 'bytes': len(raw), 'sha256': digest(path)}
        report['queries'].append(entry)
        save()
        if entry['exitCode'] != 0:
            raise RuntimeError(label + ' failed; no retry')
        return stdout.decode('utf-8', errors='strict').rstrip('\n')
    save()
    try:
        uid = query('uid', ['/usr/bin/id', '-u'])
        if not uid.isdecimal() or int(uid) == 0:
            raise RuntimeError('Non-root initialized user required')
        temp_parent = Path(tempfile.gettempdir()).resolve()
        windows_root = Path(tempfile.mkdtemp(prefix='tiye-s6-pathgit-', dir=temp_parent)).resolve()
        if windows_root.parent != temp_parent or windows_root.is_symlink() or windows_root.is_junction():
            raise RuntimeError('Unexpected Windows root')
        token = uuid.uuid4().hex
        (windows_root / '.tiye-owner').write_text(token, encoding='ascii')
        report['windowsRoot'] = str(windows_root)
        mounted_root = query('windows-to-linux', ['wslpath', '-u', str(windows_root)])
        returned = query('windows-roundtrip', ['wslpath', '-w', mounted_root])
        if ntpath.normcase(ntpath.normpath(returned)) != ntpath.normcase(ntpath.normpath(str(windows_root))):
            raise RuntimeError('Windows root roundtrip mismatch')
        report['paths'].append({'kind': 'windows-root', 'input': str(windows_root), 'linux': mounted_root, 'returned': returned, 'equal': True})
        linux_root = query('linux-root', ['mktemp', '-d', '/tmp/tiye-s6-pathgit-XXXXXXXX'])
        if not linux_root.startswith('/tmp/tiye-s6-pathgit-') or '/' in linux_root[len('/tmp/'):]:
            raise RuntimeError('Unexpected Linux root')
        report['linuxRoot'] = linux_root
        query('linux-marker', ['/bin/sh', '-s', '--', linux_root, token], b'set -eu\ntest -d "$1"\nprintf %s "$2" > "$1/.tiye-owner"\n')
        shell = (SOURCE / 'fixture.sh').read_bytes()
        expected = hashlib.sha256(protocol['content'].encode('utf-8')).hexdigest()
        for label, fixture_root in [('windows-mounted', mounted_root), ('linux-local', linux_root)]:
            text = query(label, ['/bin/sh', '-s', '--', fixture_root, token], shell)
            facts = dict(line.split('=', 1) for line in text.splitlines() if line.startswith(('canonicalRepo=', 'canonicalWorktree=', 'blobSha256=', 'fileSha256=', 'base=', 'edited=', 'fixtureComplete=')))
            if facts.get('fixtureComplete') != 'true' or facts.get('blobSha256') != expected or facts.get('fileSha256') != expected:
                raise RuntimeError(label + ' content or completion mismatch')
            report['fixtures'].append({'filesystem': label, 'root': fixture_root, 'facts': facts})
            # Exercise paths containing spaces and both Unicode scripts, not only ASCII roots.
            for key in ['canonicalRepo']:
                original = facts[key]
                win = query(label + '-path-to-windows', ['wslpath', '-w', original])
                back = query(label + '-path-roundtrip', ['wslpath', '-u', win])
                if back != original:
                    raise RuntimeError(label + ' Unicode path roundtrip mismatch')
                report['paths'].append({'kind': label + '-unicode-repo', 'linux': original, 'windows': win, 'returned': back, 'equal': True})
            save()
        report['state'] = 'bounded-fixtures-completed'
    except (RuntimeError, OSError, UnicodeError) as error:
        report['state'] = 'incomplete'
        report['failure'] = str(error)
    report['sourceHashesUnchangedAfterRun'] = all(digest(p) == hashes[p.relative_to(ROOT).as_posix()] for p in sources)
    save()
    print(json.dumps(report, indent=2))
    return 0 if report['state'] == 'bounded-fixtures-completed' and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
