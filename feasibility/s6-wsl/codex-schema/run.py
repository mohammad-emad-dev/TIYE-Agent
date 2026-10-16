"""One bounded Ubuntu schema-generation capture; refuse existing evidence."""
import base64
import hashlib
import json
import subprocess
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s4-codex-schema'
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def main():
    OUT.mkdir(exist_ok=False)
    installed = json.loads((ROOT / 'output/s4-codex-candidate/installation.json').read_text(encoding='utf-8'))
    assert installed['state'] == 'linux-version-help-completed'
    sources = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in SOURCE.iterdir() if p.is_file()}
    report = {'schema': 'tiye-codex-schema-capture-v1', 'state': 'running', 'sourceSha256': sources,
              'installationSha256': sha((ROOT / 'output/s4-codex-candidate/installation.json').read_bytes()),
              'attempts': 1, 'retries': 0, 'fullS4Qualified': False, 'fullS6Qualified': False,
              'phase1Construction': 'HOLD'}
    def save():
        (OUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    save()
    try:
        config = {k: installed['linux'][k] for k in ['binary', 'binarySha256']}
        config['nonce'] = uuid.uuid4().hex
        command = ['wsl.exe', '-d', 'Ubuntu', '--cd', '/tmp', '--exec', '/usr/bin/env', '-i',
                   'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-u', '-c',
                   (SOURCE / 'linux.py').read_text(encoding='utf-8')]
        child = subprocess.run(command, input=json.dumps(config).encode(), capture_output=True, timeout=45)
        report['exitCode'] = child.returncode
        for name, raw in [('stdout', child.stdout), ('stderr', child.stderr)]:
            (OUT / (name + '.bin')).write_bytes(raw)
            report[name] = {'bytes': len(raw), 'sha256': sha(raw)}
        save()
        assert child.returncode == 0 and not child.stderr, 'Native schema stage incomplete; no retry'
        native = json.loads(child.stdout)
        archive = base64.b64decode(native.pop('archiveBase64'), validate=True)
        assert sha(archive) == native['archiveSha256']
        (OUT / 'schemas.zip').write_bytes(archive)
        report['native'] = native
        report['state'] = 'schema-generated'
    except (OSError, ValueError, AssertionError, subprocess.SubprocessError) as error:
        report.update(state='incomplete', failureCategory=type(error).__name__, failure=str(error))
    report['sourcesUnchanged'] = all(sha((ROOT / p).read_bytes()) == h for p, h in sources.items())
    save()
    print(json.dumps({'state': report['state'], 'exitCode': report.get('exitCode'),
                      'files': len(report.get('native', {}).get('inventory', [])),
                      'failure': report.get('failure'), 'sourcesUnchanged': report['sourcesUnchanged']}))
    return 0 if report['state'] == 'schema-generated' and report['sourcesUnchanged'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
