"""Offline integrity and scope checks for the saved version/help installation."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/s4-codex-candidate'


def main():
    evidence = json.loads((OUT / 'installation.json').read_text(encoding='utf-8'))
    protocol = json.loads((Path(__file__).parent / 'protocol.json').read_text(encoding='utf-8'))
    assert evidence['state'] == 'linux-version-help-completed' and evidence['sourcesUnchanged']
    assert evidence['attempts'] == 1 and evidence['retries'] == 0
    assert not evidence['fullS4Qualified'] and not evidence['fullS6Qualified'] and not evidence['modelRequestRun']
    assert evidence['phase1Construction'] == 'HOLD'
    for name, digest in evidence['sourceHashes'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name
    assert evidence['archive']['sha256'] == protocol['assetSha256']
    assert evidence['archive']['url'] == protocol['assetUrl'] and evidence['linuxExitCode'] == 0
    for label in ['stdout', 'stderr']:
        raw = (OUT / evidence[label]['artifact']).read_bytes()
        assert len(raw) == evidence[label]['bytes'] and hashlib.sha256(raw).hexdigest() == evidence[label]['sha256']
    assert not (OUT / 'linux.stderr.bin').read_bytes()
    linux = evidence['linux']
    assert json.loads((OUT / 'linux.stdout.bin').read_text(encoding='utf-8')) == linux
    assert linux['uid'] > 0 and linux['machine'] == 'x86_64' and not linux['modelRequestRun']
    assert not linux['fullS4Qualified'] and not linux['fullS6Qualified']
    assert len(linux['results']) == 3
    assert [r['args'] for r in linux['results']] == protocol['allowedCommands']
    assert all(r['exitCode'] == 0 for r in linux['results'])
    assert linux['results'][0]['stdout'].strip() == 'codex-cli 0.157.1'
    assert '--model' in linux['results'][1]['stdout'] and '--listen' in linux['results'][2]['stdout']
    selected = [p for p in linux['inventory'] if str(Path(linux['root']) / 'package' / p['path']) == linux['binary']]
    # POSIX paths in Windows evidence must be compared without host separators.
    selected = [p for p in linux['inventory'] if linux['root'] + '/package/' + p['path'] == linux['binary']]
    assert len(selected) == 1 and selected[0]['elf'] and selected[0]['sha256'] == linux['binarySha256']
    print('Saved Linux Codex version/help prerequisite verified; no authentication, model access or product qualification')


if __name__ == '__main__':
    main()
