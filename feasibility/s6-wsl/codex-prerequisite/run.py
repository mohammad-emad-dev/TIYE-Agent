"""One download and one Ubuntu installation/version-help stage; preserve outcomes."""
import hashlib
import json
import subprocess
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s4-codex-candidate'
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def main():
    OUTPUT.mkdir(exist_ok=False)
    protocol = json.loads((SOURCE / 'protocol.json').read_text(encoding='utf-8'))
    sources = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in SOURCE.iterdir() if p.is_file()}
    report = {'schema': 'tiye-s4-codex-prerequisite-v1', 'state': 'running', 'sourceHashes': sources,
              'attempts': 1, 'retries': 0, 'fullS4Qualified': False, 'fullS6Qualified': False,
              'modelRequestRun': False, 'phase1Construction': 'HOLD'}
    runtime = Path(tempfile.mkdtemp(prefix='tiye-codex-package-'))
    report['retainedHostRuntime'] = str(runtime)
    def save():
        (OUTPUT / 'installation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    save()
    try:
        archive = runtime / 'codex.tar.gz'
        request = urllib.request.Request(protocol['assetUrl'], headers={'User-Agent': 'TIYE-feasibility-prerequisite'})
        started = time.monotonic()
        with urllib.request.urlopen(request, timeout=30) as response, archive.open('xb') as stream:
            while block := response.read(1024 * 1024):
                if time.monotonic() - started > 90 or stream.tell() + len(block) > 200 * 1024 * 1024:
                    raise RuntimeError('Download bound exceeded')
                stream.write(block)
        report['archive'] = {'url': protocol['assetUrl'], 'sha256': sha(archive.read_bytes()),
                             'bytes': archive.stat().st_size, 'elapsedMs': (time.monotonic() - started) * 1000}
        save()
        assert report['archive']['sha256'] == protocol['assetSha256'], 'Official asset digest mismatch'
        converted = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '--exec', '/usr/bin/wslpath', '-a', '-u', str(archive)],
                                   capture_output=True, timeout=10)
        assert converted.returncode == 0 and not converted.stderr
        report['archiveLinuxPath'] = converted.stdout.decode().strip()
        config = {'archive': report['archiveLinuxPath'], 'sha256': protocol['assetSha256'], 'nonce': uuid.uuid4().hex}
        command = ['wsl.exe', '-d', 'Ubuntu', '--cd', '/tmp', '--exec', '/usr/bin/env', '-i',
                   'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-u', '-c',
                   (SOURCE / 'linux.py').read_text(encoding='utf-8')]
        child = subprocess.run(command, input=json.dumps(config).encode(), capture_output=True, timeout=45)
        report['linuxExitCode'] = child.returncode
        for label, raw in [('stdout', child.stdout), ('stderr', child.stderr)]:
            name = 'linux.' + label + '.bin'
            (OUTPUT / name).write_bytes(raw)
            report[label] = {'artifact': name, 'sha256': sha(raw), 'bytes': len(raw)}
        save()
        assert child.returncode == 0 and not child.stderr, 'Linux installation/help stage incomplete; no retry'
        report['linux'] = json.loads(child.stdout)
        report['state'] = 'linux-version-help-completed'
    except (OSError, RuntimeError, ValueError, AssertionError, subprocess.SubprocessError) as error:
        report.update(state='incomplete', failureCategory=type(error).__name__, failure=str(error))
    report['sourcesUnchanged'] = all(sha((ROOT / p).read_bytes()) == digest for p, digest in sources.items())
    save()
    print(json.dumps({k: v for k, v in report.items() if k not in ['linux', 'sourceHashes']}, indent=2))
    return 0 if report['state'] == 'linux-version-help-completed' and report['sourcesUnchanged'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
