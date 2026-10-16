"""Record one bounded Ubuntu prerequisite discovery; never invoke provider CLIs."""
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'output/s6-discovery'
LINUX_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
COMMAND = ['wsl.exe', '-d', 'Ubuntu', '--exec', '/usr/bin/env', '-i',
           'PATH=' + LINUX_PATH, 'LC_ALL=C', '/bin/sh', '-s']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(report):
    (OUTPUT / 'discovery.json').write_text(
        json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')


def capture_query(label, script, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise RuntimeError('Discovery deadline exceeded')
    record = {'query': label, 'script': script,
              'startedAt': datetime.now(timezone.utc).isoformat()}
    try:
        completed = subprocess.run(COMMAND, input=script.encode('utf-8'),
                                   capture_output=True, timeout=min(30, remaining))
        record.update(exitCode=completed.returncode, timedOut=False)
        stdout, stderr = completed.stdout, completed.stderr
    except subprocess.TimeoutExpired as error:
        record.update(exitCode=None, timedOut=True)
        stdout, stderr = error.stdout or b'', error.stderr or b''
    record['finishedAt'] = datetime.now(timezone.utc).isoformat()
    for stream, contents in [('stdout', stdout), ('stderr', stderr)]:
        path = OUTPUT / (label + '.' + stream + '.bin')
        path.write_bytes(contents)
        record[stream] = {'artifact': path.name, 'bytes': len(contents),
                          'sha256': digest(path)}
    return record


def read_stdout(record):
    return (OUTPUT / record['stdout']['artifact']).read_bytes().decode('utf-8', errors='strict')


def main():
    OUTPUT.mkdir(exist_ok=False)
    sources = [Path(__file__).resolve(), ROOT / 'feasibility/s6-wsl/PLAN.md']
    hashes = {p.relative_to(ROOT).as_posix(): digest(p) for p in sources}
    report = {'schema': 'tiye-s6-discovery-v1', 'state': 'running',
              'operatorConfirmedUserSetup': True, 'command': COMMAND,
              'sourceHashes': hashes, 'queries': [], 'providerCliInvocations': 0,
              'fullS6Qualified': False, 'productionEligible': False}
    save(report)
    deadline = time.monotonic() + 300
    queries = [
        ('uid', 'id -u\n'),
        ('os-release', 'cat /etc/os-release\n'),
        ('kernel', 'uname -r\n'),
        ('native-tools', '''set -eu
for tool in git node; do
  candidate=$(command -v "$tool" || true)
  if [ -z "$candidate" ]; then
    printf '%s\\tnot-on-tested-PATH\\n' "$tool"
    continue
  fi
  resolved=$(readlink -f "$candidate")
  magic=$(od -An -tx1 -N4 "$resolved" | tr -d ' \\n')
  printf '%s\\tpath=%s\\tresolved=%s\\tmagic=%s\\n' "$tool" "$candidate" "$resolved" "$magic"
  case "$resolved" in
    /mnt/*) printf '%s\\tversion-not-run-interop-path\\n' "$tool"; continue ;;
  esac
  if [ "$magic" != 7f454c46 ]; then
    printf '%s\\tversion-not-run-non-ELF\\n' "$tool"
    continue
  fi
  "$resolved" --version
done
'''),
        ('cli-presence', '''set -eu
for tool in codex claude opencode gemini agy mimo; do
  candidate=$(command -v "$tool" || true)
  if [ -z "$candidate" ]; then
    printf '%s\\tnot-on-tested-PATH\\n' "$tool"
  else
    printf '%s\\tpath=%s\\tresolved=%s\\n' "$tool" "$candidate" "$(readlink -f "$candidate")"
  fi
done
'''),
    ]
    for label, script in queries:
        record = capture_query(label, script, deadline)
        report['queries'].append(record)
        save(report)
        if record['exitCode'] != 0 or record['stderr']['bytes']:
            report['state'] = 'incomplete-query'
            break
        if label == 'uid':
            uid = read_stdout(record).strip()
            if not uid.isdecimal() or int(uid) == 0:
                report['state'] = 'user-initialization-unconfirmed'
                break
            report['observedUidNonzero'] = True
    else:
        report['state'] = 'prerequisite-discovery-completed'
    report['sourceHashesUnchangedAfterRun'] = all(digest(p) == hashes[p.relative_to(ROOT).as_posix()] for p in sources)
    save(report)
    print(json.dumps(report, indent=2))
    for record in report['queries']:
        print(record['query'] + ':\n' + read_stdout(record))
    return 0 if report['state'] == 'prerequisite-discovery-completed' and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
