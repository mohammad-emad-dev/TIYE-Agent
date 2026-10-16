"""Record once, or verify saved offline framing evidence without overwriting it."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from framing import OfflineConnection, ReplayError
from test_framing import approval, completed, wire

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s4-codex-framing'
ARCHIVE = ROOT / 'output/s4-codex-schema/schemas.zip'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def source_hashes():
    files = list(SOURCE.glob('*.py')) + list((SOURCE.parent / 'codex-replay').glob('*.py'))
    return {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in sorted(files)}


def walkthrough():
    connection = OfflineConnection(ARCHIVE)
    trace = []
    def step(action, public_input, operation):
        try:
            result = operation()
        except ReplayError as error:
            result = {'refused': str(error)}
        trace.append({'action': action, 'input': public_input, 'result': result,
                      **connection.snapshot()})
        return result
    def feed(raw):
        return step('feed', {'hex': raw.hex(), 'byteCount': len(raw)}, lambda: connection.feed(raw))
    raw = wire(approval())
    feed(raw[:31])
    stamp = feed(raw[31:])[0]['fingerprint']
    step('disconnect', {}, connection.disconnect)
    step('decide', {'id': 7, 'decision': 'accept', 'fingerprint': stamp},
         lambda: connection.decide(7, 'accept', stamp))
    feed(wire(completed()))
    # Separate synthetic connection, not a resume or callback replay.
    connection = OfflineConnection(ARCHIVE)
    feed(wire({'method': 'fixture/unmodeled', 'params': {'text': 'مرحبا 😀'}}) + b'\xff\n' + wire(completed()))
    step('disconnect', {}, connection.disconnect)
    connection = OfflineConnection(ARCHIVE)
    feed(wire(completed()))
    step('disconnect', {}, connection.disconnect)
    assert len(trace) == 9 and all(x['taskSuccess'] is None for x in trace)
    return trace


def check():
    report = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    assert report['state'] == 'offline-framing-verified'
    assert report['sourceSha256'] == source_hashes()
    assert report['schemaArchiveSha256'] == sha(ARCHIVE.read_bytes())
    assert report['tests']['exitCode'] == 0
    assert report['phase1Construction'] == 'HOLD'
    assert not any(report[k] for k in ['modelRequestRun', 'nativeTransportRun', 'fullS4Qualified', 'fullS6Qualified'])
    for name, digest in report['artifactSha256'].items():
        assert sha((OUT / name).read_bytes()) == digest, name
    assert json.loads((OUT / 'transcript.json').read_text(encoding='utf-8')) == walkthrough()
    print('Saved offline framing evidence verified; no native/provider qualification')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        check()
        return
    hashes = source_hashes()
    archive_hash = sha(ARCHIVE.read_bytes())
    declared = json.loads((ROOT / 'output/s4-codex-schema/capabilities.json').read_text(encoding='utf-8'))
    assert archive_hash == declared['archiveSha256']
    trace = walkthrough()
    OUT.mkdir(exist_ok=False)
    command = [sys.executable, '-B', '-X', 'utf8', '-m', 'unittest', 'discover',
               '-s', str(SOURCE), '-p', 'test_framing.py', '-v']
    child = subprocess.run(command, capture_output=True, timeout=30)
    (OUT / 'tests.stdout.bin').write_bytes(child.stdout)
    (OUT / 'tests.stderr.bin').write_bytes(child.stderr)
    assert child.returncode == 0, child.stderr.decode('utf-8', errors='replace')
    (OUT / 'transcript.json').write_text(json.dumps(trace, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    assert hashes == source_hashes()
    assert archive_hash == sha(ARCHIVE.read_bytes())
    report = {'schema': 'tiye-offline-jsonl-framing-v1', 'state': 'offline-framing-verified',
              'sourceSha256': hashes, 'schemaArchiveSha256': archive_hash,
              'tests': {'exitCode': child.returncode, 'command': command, 'deadlineSeconds': 30},
              'walkthroughSteps': len(trace), 'packetsAreSynthetic': True,
              'modelRequestRun': False, 'nativeTransportRun': False,
              'fullS4Qualified': False, 'fullS6Qualified': False, 'phase1Construction': 'HOLD',
              'artifactSha256': {p.name: sha(p.read_bytes()) for p in OUT.iterdir() if p.is_file()}}
    (OUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    check()


if __name__ == '__main__':
    main()
