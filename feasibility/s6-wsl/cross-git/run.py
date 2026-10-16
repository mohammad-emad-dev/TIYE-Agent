"""Capture owner-side Git controls and foreign metadata reads without repair."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s6-cross-git'
WSL = ['wsl.exe', '-d', 'Ubuntu', '--exec', '/usr/bin/env', '-i',
       'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LC_ALL=C.UTF-8', 'GIT_CONFIG_NOSYSTEM=1', 'GIT_CONFIG_GLOBAL=/dev/null',
       'GIT_OPTIONAL_LOCKS=0']
OPTIONS = ['-c', 'core.hooksPath=/dev/null', '-c', 'init.templateDir=',
           '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-c', 'commit.gpgsign=false',
           '-c', 'user.name=TIYE-Fixture', '-c', 'user.email=fixture@example.invalid']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(root):
    return {p.relative_to(root).as_posix(): digest(p) for p in sorted(root.rglob('*')) if p.is_file()}


def main():
    OUTPUT.mkdir(exist_ok=False)
    protocol = json.loads((SOURCE / 'protocol.json').read_text())
    sources = [SOURCE / p for p in ['run.py', 'linux-fixture.sh', 'protocol.json']]
    report = {'schema': 'tiye-s6-cross-git-v1', 'state': 'running', 'queries': [],
              'sourceHashes': {p.relative_to(ROOT).as_posix(): digest(p) for p in sources},
              'fullS6Qualified': False, 'productionEligible': False, 'rootsRetained': True}
    def save():
        (OUTPUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    deadline = time.monotonic() + protocol['totalDeadlineSeconds']
    native_env = {k: os.environ[k] for k in ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'] if k in os.environ}
    native_env.update(GIT_CONFIG_NOSYSTEM='1', GIT_OPTIONAL_LOCKS='0')
    def query(label, command, script=None, foreign=False):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('Cohort deadline exceeded')
        entry = {'label': label, 'command': command, 'foreignRead': foreign,
                 'startedAt': datetime.now(timezone.utc).isoformat()}
        started = time.monotonic()
        try:
            completed = subprocess.run(command, input=script, capture_output=True, env=native_env,
                                       timeout=min(30, remaining))
            entry.update(exitCode=completed.returncode, timedOut=False)
            stdout, stderr = completed.stdout, completed.stderr
        except subprocess.TimeoutExpired as error:
            entry.update(exitCode=None, timedOut=True)
            stdout, stderr = error.stdout or b'', error.stderr or b''
        entry['elapsedMs'] = (time.monotonic() - started) * 1000
        for stream, raw in [('stdout', stdout), ('stderr', stderr)]:
            target = OUTPUT / (label + '.' + stream + '.bin')
            target.write_bytes(raw)
            entry[stream] = {'artifact': target.name, 'bytes': len(raw), 'sha256': digest(target)}
        report['queries'].append(entry)
        save()
        if entry['timedOut'] or (entry['exitCode'] != 0 and not foreign):
            raise RuntimeError(label + ' failed; no retry')
        return stdout
    save()
    try:
        git = shutil.which('git.exe')
        if not git:
            raise RuntimeError('Native Windows git.exe not found')
        report['nativeGitExecutable'] = git
        temp_parent = Path(tempfile.gettempdir()).resolve()
        win_root = Path(tempfile.mkdtemp(prefix='tiye-s6-crossgit-', dir=temp_parent)).resolve()
        if win_root.parent != temp_parent or win_root.is_symlink() or win_root.is_junction():
            raise RuntimeError('Unexpected Windows fixture root')
        token = uuid.uuid4().hex
        (win_root / '.tiye-owner').write_text(token, encoding='ascii')
        global_config = win_root / 'empty-global.config'
        global_config.write_bytes(b'')
        hooks, template = win_root / 'empty-hooks', win_root / 'empty-template'
        hooks.mkdir(); template.mkdir()
        native_env['GIT_CONFIG_GLOBAL'] = str(global_config)
        win_options = OPTIONS + ['-c', 'core.hooksPath=' + str(hooks), '-c', 'init.templateDir=' + str(template)]
        def win(label, folder, *args, foreign=False):
            return query(label, [git, *win_options, '-C', str(folder), *args], foreign=foreign)
        report['windowsRoot'] = str(win_root)
        report['nativeGitVersion'] = query('windows-version', [git, '--version']).decode().strip()
        repo, wt = win_root / 'repo space مرحبا 日本', win_root / 'worktree space مرحبا 日本'
        repo.mkdir()
        win('windows-init', repo, 'init', '--initial-branch=main')
        query('windows-config', [git, *win_options, '-C', str(repo), 'config', '--list', '--show-origin'])
        (repo / 'payload.txt').write_bytes(b'base\n')
        win('windows-base-add', repo, 'add', 'payload.txt')
        win('windows-base-commit', repo, 'commit', '-m', 'base')
        base = win('windows-base-head', repo, 'rev-parse', '--verify', 'HEAD').decode().strip()
        win('windows-worktree-add', repo, 'worktree', 'add', '-b', 'fixture-edit', str(wt))
        content = protocol['content'].encode('utf-8')
        (wt / 'payload.txt').write_bytes(content)
        win('windows-edit-add', wt, 'add', 'payload.txt')
        win('windows-edit-commit', wt, 'commit', '-m', 'edit')
        head = win('windows-edit-head', wt, 'rev-parse', '--verify', 'HEAD').decode().strip()
        win('windows-merge', repo, 'merge', '--ff-only', 'fixture-edit')
        win('windows-ancestor', repo, 'merge-base', '--is-ancestor', base, head)
        blob = win('windows-blob', repo, 'cat-file', 'blob', 'HEAD:payload.txt')
        if blob != content or (repo / 'payload.txt').read_bytes() != content:
            raise RuntimeError('Windows payload mismatch')
        for label, folder in [('main', repo), ('worktree', wt)]:
            if win('windows-clean-' + label, folder, 'status', '--porcelain'):
                raise RuntimeError('Windows fixture dirty')
            if win('windows-control-' + label, folder, 'rev-parse', '--verify', 'HEAD').decode().strip() != head:
                raise RuntimeError('Windows refs mismatch')
        pointer = (wt / '.git').read_text(encoding='utf-8')
        gitdir = Path(pointer.strip().removeprefix('gitdir: '))
        report['windowsFixture'] = {'base': base, 'head': head, 'worktree': str(wt), 'gitfile': pointer,
                                    'commondir': (gitdir / 'commondir').read_text(), 'blobSha256': hashlib.sha256(blob).hexdigest()}
        linux_wt = query('windows-worktree-to-linux', WSL + ['wslpath', '-u', str(wt)]).decode().strip()
        before = snapshot(win_root)
        query('linux-reads-windows', WSL + ['/usr/bin/git', *OPTIONS, '-C', linux_wt, 'rev-parse', '--verify', 'HEAD'], foreign=True)
        after = snapshot(win_root)
        report['windowsSnapshot'] = {'before': before, 'after': after, 'equal': before == after}
        if before != after:
            raise RuntimeError('Windows fixture bytes changed around foreign read')
        if win('windows-owner-after', wt, 'rev-parse', '--verify', 'HEAD').decode().strip() != head:
            raise RuntimeError('Windows owner control changed')
        linux_root = query('linux-root', WSL + ['mktemp', '-d', '/tmp/tiye-s6-crossgit-XXXXXXXX']).decode().strip()
        if not linux_root.startswith('/tmp/tiye-s6-crossgit-') or '/' in linux_root[len('/tmp/'):]:
            raise RuntimeError('Unexpected Linux root')
        report['linuxRoot'] = linux_root
        text = query('linux-fixture', WSL + ['/bin/sh', '-s', '--', linux_root, token], (SOURCE / 'linux-fixture.sh').read_bytes()).decode('utf-8')
        facts = dict(line.split('=', 1) for line in text.splitlines() if line.startswith(('repo=', 'worktree=', 'head=', 'blobSha256=', 'gitfile=', 'commondir=', 'fixtureComplete=')))
        if facts.get('fixtureComplete') != 'true' or facts.get('blobSha256') != hashlib.sha256(content).hexdigest():
            raise RuntimeError('Linux fixture incomplete or wrong content')
        report['linuxFixture'] = facts
        unc = query('linux-worktree-to-windows', WSL + ['wslpath', '-w', facts['worktree']]).decode().strip()
        report['linuxWorktreeUnc'] = unc
        snapshot_script = b'set -eu\ncd "$1"\nfind . -type f -print0 | sort -z | xargs -0 sha256sum\n'
        before_linux = query('linux-snapshot-before', WSL + ['/bin/sh', '-s', '--', linux_root], snapshot_script)
        win('windows-reads-linux', unc, 'rev-parse', '--verify', 'HEAD', foreign=True)
        after_linux = query('linux-snapshot-after', WSL + ['/bin/sh', '-s', '--', linux_root], snapshot_script)
        report['linuxSnapshotEqual'] = before_linux == after_linux
        if before_linux != after_linux:
            raise RuntimeError('Linux fixture bytes changed around foreign read')
        control = query('linux-owner-after', WSL + ['/usr/bin/git', *OPTIONS, '-C', facts['worktree'], 'rev-parse', '--verify', 'HEAD']).decode().strip()
        if control != facts['head']:
            raise RuntimeError('Linux owner control changed')
        report['state'] = 'bounded-observations-completed'
    except (RuntimeError, OSError, UnicodeError, ValueError) as error:
        report.update(state='incomplete', failure=str(error))
    report['sourceHashesUnchangedAfterRun'] = all(digest(ROOT / p) == h for p, h in report['sourceHashes'].items())
    save()
    print(json.dumps({k: v for k, v in report.items() if k not in ['queries', 'windowsSnapshot']}, indent=2))
    print(json.dumps([{'label': q['label'], 'exitCode': q['exitCode']} for q in report['queries']], indent=2))
    return 0 if report['state'] == 'bounded-observations-completed' and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
