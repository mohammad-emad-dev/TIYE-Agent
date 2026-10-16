"""Capture fixed synthetic peers once; --check never launches any subprocess."""
import argparse
import asyncio
import hashlib
import json
import platform
import subprocess
import sys
import unittest
from pathlib import Path
from harness import run_case
from peer import MODES

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s4-codex-stdio'
ARCHIVE = ROOT / 'output/s4-codex-schema/schemas.zip'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def hashes():
    files = [p for folder in ['codex-stdio', 'codex-framing', 'codex-replay']
             for p in (SOURCE.parent / folder).glob('*.py')]
    return {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in sorted(files)}


def save(name, value):
    with (OUT / name).open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def check():
    report = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    assert report['state'] == 'synthetic-native-stdio-verified'
    assert report['sourceSha256'] == hashes()
    assert report['schemaArchiveSha256'] == sha(ARCHIVE.read_bytes())
    assert report['tests']['exitCode'] == 0
    assert report['phase1Construction'] == 'HOLD'
    assert report['scenarios'] == list(MODES)
    assert not any(report[k] for k in ['providerRequestRun', 'fullS4Qualified', 'fullS6Qualified'])
    for name, digest in report['artifactSha256'].items():
        assert sha((OUT / name).read_bytes()) == digest, name
    suite = unittest.defaultTestLoader.discover(str(SOURCE), pattern='test_capture.py')
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    assert result.wasSuccessful()
    print('Saved native synthetic stdio evidence verified; no new subprocess or provider launch')


async def capture():
    for mode in MODES:
        report, raw = await run_case(mode)
        save(mode + '.json', report)
        for stream, data in raw.items():
            with (OUT / (mode + '.' + stream + '.bin')).open('xb') as target:
                target.write(data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        check()
        return
    source_hashes = hashes()
    archive_hash = sha(ARCHIVE.read_bytes())
    declared = json.loads((ROOT / 'output/s4-codex-schema/capabilities.json').read_text(encoding='utf-8'))
    assert archive_hash == declared['archiveSha256']
    OUT.mkdir(exist_ok=False)
    asyncio.run(capture())
    command = [sys.executable, '-B', '-X', 'utf8', '-m', 'unittest', 'discover',
               '-s', str(SOURCE), '-p', 'test_capture.py', '-v']
    child = subprocess.run(command, capture_output=True, timeout=30)
    (OUT / 'tests.stdout.bin').write_bytes(child.stdout)
    (OUT / 'tests.stderr.bin').write_bytes(child.stderr)
    assert child.returncode == 0, child.stderr.decode('utf-8', errors='replace')
    assert source_hashes == hashes()
    assert archive_hash == sha(ARCHIVE.read_bytes())
    save('evidence.json', {'schema': 'tiye-native-synthetic-stdio-v1',
        'state': 'synthetic-native-stdio-verified', 'scenarios': list(MODES),
        'sourceSha256': source_hashes, 'schemaArchiveSha256': archive_hash,
        'runtime': {'python': platform.python_version(), 'platform': platform.platform()},
        'tests': {'exitCode': child.returncode, 'command': command, 'deadlineSeconds': 30},
        'nativeWindowsSyntheticPeerRun': sys.platform == 'win32', 'providerRequestRun': False,
        'fullS4Qualified': False, 'fullS6Qualified': False, 'phase1Construction': 'HOLD',
        'artifactSha256': {p.name: sha(p.read_bytes()) for p in OUT.iterdir() if p.is_file()}})
    check()


if __name__ == '__main__':
    main()
