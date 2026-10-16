"""Finish the unattempted peer read after a metadata-observation harness error."""
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s6-cross-git'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    target = OUTPUT / 'peer-followup.json'
    with target.open('x', encoding='utf-8') as first:
        first.write('{"state":"preflight"}\n')
    original = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    assert original['failure'] == 'linux-fixture failed; no retry'
    assert not any(q['label'] == 'windows-reads-linux' for q in original['queries'])
    for p, expected in original['sourceHashes'].items():
        assert digest(ROOT / p) == expected
    text = (OUTPUT / 'linux-fixture.stdout.bin').read_bytes().decode('utf-8')
    facts = dict(line.split('=', 1) for line in text.splitlines() if line.startswith(('repo=', 'worktree=', 'head=', 'blobSha256=', 'gitfile=')))
    assert facts['worktree'].startswith(original['linuxRoot'] + '/')
    marker_query = next(q for q in original['queries'] if q['label'] == 'linux-fixture')
    token = marker_query['command'][-1]
    assert len(token) == 32 and all(c in '0123456789abcdef' for c in token)
    prefix = marker_query['command'][:marker_query['command'].index('/bin/sh')]
    assert prefix[-1] == 'GIT_OPTIONAL_LOCKS=0'
    native_env = {k: os.environ[k] for k in ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'] if k in os.environ}
    native_env.update(GIT_CONFIG_NOSYSTEM='1', GIT_OPTIONAL_LOCKS='0', GIT_CONFIG_GLOBAL=str(Path(original['windowsRoot']) / 'empty-global.config'))
    report = {'schema': 'tiye-s6-cross-peer-followup-v1', 'state': 'running',
              'originalEvidenceSha256': digest(OUTPUT / 'evidence.json'),
              'sourceHashes': {p.relative_to(ROOT).as_posix(): digest(p) for p in [Path(__file__).resolve(), SOURCE / 'protocol.json']},
              'queries': [], 'fullS6Qualified': False, 'productionEligible': False,
              'fixtureRecreated': False, 'metadataRewritten': False}
    def save():
        target.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    deadline = time.monotonic() + 120
    def query(label, command, script=None, foreign=False):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('Followup deadline exceeded')
        entry = {'label': label, 'command': command, 'foreignRead': foreign}
        started = time.monotonic()
        try:
            result = subprocess.run(command, input=script, capture_output=True, env=native_env, timeout=min(30, remaining))
            entry.update(exitCode=result.returncode, timedOut=False)
            stdout, stderr = result.stdout, result.stderr
        except subprocess.TimeoutExpired as error:
            entry.update(exitCode=None, timedOut=True)
            stdout, stderr = error.stdout or b'', error.stderr or b''
        entry['elapsedMs'] = (time.monotonic() - started) * 1000
        for stream, raw in [('stdout', stdout), ('stderr', stderr)]:
            p = OUTPUT / (label + '.' + stream + '.bin')
            p.write_bytes(raw)
            entry[stream] = {'artifact': p.name, 'bytes': len(raw), 'sha256': digest(p)}
        report['queries'].append(entry)
        save()
        if entry['timedOut'] or (entry['exitCode'] != 0 and not foreign):
            raise RuntimeError(label + ' failed; no retry')
        return stdout
    save()
    try:
        script = b'''set -eu
test "$(cat "$1/.tiye-owner")" = "$2"
worktree="$3"
pointer=$(cat "$worktree/.git")
gitdir=${pointer#gitdir: }
case "$gitdir" in "$1/"*) ;; *) exit 41 ;; esac
printf 'gitfile=%s\\n' "$pointer"
printf 'gitdir=%s\\n' "$gitdir"
printf 'commondir='; cat "$gitdir/commondir"
/usr/bin/git -C "$worktree" rev-parse --verify HEAD
test -z "$(/usr/bin/git -C "$worktree" status --porcelain)"
'''
        metadata = query('linux-owner-metadata', prefix + ['/bin/sh', '-s', '--', original['linuxRoot'], token, facts['worktree']], script).decode('utf-8')
        if facts['head'] + '\n' not in metadata:
            raise RuntimeError('Linux owner HEAD changed')
        report['linuxOwnerMetadata'] = metadata
        unc = query('linux-worktree-to-windows', prefix + ['wslpath', '-w', facts['worktree']]).decode().strip()
        report['unc'] = unc
        snap = b'set -eu\ncd "$1"\nfind . -type f -print0 | sort -z | xargs -0 sha256sum\n'
        before = query('linux-snapshot-before', prefix + ['/bin/sh', '-s', '--', original['linuxRoot']], snap)
        options = ['-c', 'core.hooksPath=' + str(Path(original['windowsRoot']) / 'empty-hooks'), '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false']
        query('windows-reads-linux', [original['nativeGitExecutable'], *options, '-C', unc, 'rev-parse', '--verify', 'HEAD'], foreign=True)
        after = query('linux-snapshot-after', prefix + ['/bin/sh', '-s', '--', original['linuxRoot']], snap)
        report['linuxSnapshotEqual'] = before == after
        if before != after:
            raise RuntimeError('Linux fixture bytes changed around foreign read')
        owner = query('linux-owner-after', prefix + ['/usr/bin/git', '-C', facts['worktree'], 'rev-parse', '--verify', 'HEAD']).decode().strip()
        if owner != facts['head']:
            raise RuntimeError('Linux owner HEAD changed')
        report['state'] = 'remaining-peer-read-recorded'
    except (RuntimeError, OSError, UnicodeError) as error:
        report.update(state='incomplete', failure=str(error))
    report['sourceHashesUnchangedAfterRun'] = all(digest(ROOT / p) == h for p, h in report['sourceHashes'].items())
    save()
    print(json.dumps(report, indent=2))
    return 0 if report['state'] == 'remaining-peer-read-recorded' and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
