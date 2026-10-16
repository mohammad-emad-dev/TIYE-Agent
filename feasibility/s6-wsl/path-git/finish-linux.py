"""Execute only the unattempted Linux fixture after the Windows fixture failed."""
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s6-path-git'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    target = OUTPUT / 'linux-followup.json'
    with target.open('x', encoding='utf-8', newline='\n') as created:
        created.write('{"state":"preflight"}\n')
    original = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    assert original['state'] == 'incomplete'
    assert original['failure'] == 'windows-mounted failed; no retry'
    assert not any(q['label'] == 'linux-local' for q in original['queries'])
    for name, expected in original['sourceHashes'].items():
        assert digest(ROOT / name) == expected
    fixture_root = original['linuxRoot']
    assert fixture_root.startswith('/tmp/tiye-s6-pathgit-')
    marker = next(q for q in original['queries'] if q['label'] == 'linux-marker')
    token = marker['command'][-1]
    assert len(token) == 32 and all(c in '0123456789abcdef' for c in token)
    prefix = original['queries'][0]['command'][:-2]
    report = {'schema': 'tiye-s6-linux-followup-v1', 'state': 'running',
              'reason': 'Only the independent, previously unattempted Linux fixture; no Windows retry',
              'originalEvidenceSha256': digest(OUTPUT / 'evidence.json'),
              'sourceHashes': {p.relative_to(ROOT).as_posix(): digest(p) for p in [SOURCE / 'fixture.sh', Path(__file__).resolve(), SOURCE / 'protocol.json']},
              'queries': [], 'fullS6Qualified': False, 'productionEligible': False,
              'nativeWindowsGitInteropTested': False, 'rootsRetained': True}
    deadline = time.monotonic() + 120
    def save():
        target.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    def query(label, args, script=None):
        entry = {'label': label, 'command': prefix + args, 'startedAt': datetime.now(timezone.utc).isoformat()}
        started = time.monotonic()
        remaining = deadline - started
        if remaining <= 0:
            raise RuntimeError('Followup deadline exceeded')
        try:
            completed = subprocess.run(entry['command'], input=script, capture_output=True, timeout=min(30, remaining))
            entry.update(exitCode=completed.returncode, timedOut=False)
            stdout, stderr = completed.stdout, completed.stderr
        except subprocess.TimeoutExpired as error:
            entry.update(exitCode=None, timedOut=True)
            stdout, stderr = error.stdout or b'', error.stderr or b''
        entry['elapsedMs'] = (time.monotonic() - started) * 1000
        for stream, raw in [('stdout', stdout), ('stderr', stderr)]:
            artifact = OUTPUT / (label + '.' + stream + '.bin')
            artifact.write_bytes(raw)
            entry[stream] = {'artifact': artifact.name, 'bytes': len(raw), 'sha256': digest(artifact)}
        report['queries'].append(entry)
        save()
        if entry['exitCode'] != 0:
            raise RuntimeError(label + ' failed; no retry')
        return stdout.decode('utf-8', errors='strict').rstrip('\n')
    save()
    try:
        text = query('linux-local', ['/bin/sh', '-s', '--', fixture_root, token], (SOURCE / 'fixture.sh').read_bytes())
        facts = dict(line.split('=', 1) for line in text.splitlines() if line.startswith(('canonicalRepo=', 'canonicalWorktree=', 'blobSha256=', 'fileSha256=', 'base=', 'edited=', 'fixtureComplete=')))
        content = json.loads((SOURCE / 'protocol.json').read_text(encoding='utf-8'))['content']
        expected = hashlib.sha256(content.encode('utf-8')).hexdigest()
        if facts.get('fixtureComplete') != 'true' or facts.get('blobSha256') != expected or facts.get('fileSha256') != expected:
            raise RuntimeError('Linux fixture content or completion mismatch')
        report['facts'] = facts
        original_path = facts['canonicalRepo']
        win = query('linux-local-path-to-windows', ['wslpath', '-w', original_path])
        back = query('linux-local-path-roundtrip', ['wslpath', '-u', win])
        report['path'] = {'linux': original_path, 'windows': win, 'returned': back, 'equal': back == original_path}
        if back != original_path:
            raise RuntimeError('Linux Unicode path roundtrip mismatch')
        report['state'] = 'linux-fixture-completed'
    except (RuntimeError, OSError, UnicodeError) as error:
        report.update(state='incomplete', failure=str(error))
    report['sourceHashesUnchangedAfterRun'] = all(digest(ROOT / p) == h for p, h in report['sourceHashes'].items())
    save()
    print(json.dumps(report, indent=2))
    return 0 if report['state'] == 'linux-fixture-completed' and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
