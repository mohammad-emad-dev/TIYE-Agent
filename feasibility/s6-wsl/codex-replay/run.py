"""Record or verify a public synthetic replay and its behavior-test gate."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from replay import ReplayError, ReplaySession, decode_packet

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s4-codex-replay'
ARCHIVE = ROOT / 'output/s4-codex-schema/schemas.zip'
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def walkthrough():
    session = ReplaySession(ARCHIVE)
    trace = []
    def entry(action, public_input, operation):
        try:
            result = operation()
        except ReplayError as error:
            result = {'refused': str(error)}
        trace.append({'action': action, 'input': public_input, 'result': result,
                      'status': session.status, 'taskSuccess': session.task_success})
        return result
    def incoming(packet):
        raw = json.dumps(packet, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        return entry('receive', {'syntheticUtf8Packet': raw.decode('utf-8')}, lambda: session.receive(decode_packet(raw)))
    def done(thread='thread-owned', turn='turn-owned', status='completed'):
        return {'method': 'turn/completed', 'params': {'threadId': thread, 'turn': {'id': turn, 'items': [], 'status': status}}}
    def request(ident):
        return {'id': ident, 'method': 'item/commandExecution/requestApproval', 'params': {
            'threadId': 'thread-owned', 'turnId': 'turn-owned', 'itemId': 'item-same',
            'approvalId': 'callback-' + str(ident), 'startedAtMs': 1000, 'command': 'echo public-fixture'}}
    def decide(ident, choice, stamp):
        return entry('decide', {'id': ident, 'decision': choice, 'fingerprint': stamp}, lambda: session.decide(ident, choice, stamp))
    entry('expect-response', {'id': 1, 'method': 'turn/interrupt'}, lambda: session.expect_response(1, 'turn/interrupt'))
    incoming(done(thread='foreign'))
    incoming({'id': 1, 'result': {}})
    receipt = incoming(request(7))
    stamp = receipt['fingerprint']
    decide(7, 'acceptForSession', stamp)
    decide(7, {'acceptWithExecpolicyAmendment': {'execpolicy_amendment': ['echo']}}, stamp)
    decide(7, {'applyNetworkPolicyAmendment': {'network_policy_amendment': {'host': 'fixture.invalid', 'action': 'allow'}}}, stamp)
    decide(7, 'accept', 'wrong-operation-fingerprint')
    decide(7, 'decline', stamp)
    decide(7, 'decline', stamp)
    incoming({'method': 'serverRequest/resolved', 'params': {'threadId': 'thread-owned', 'requestId': 7}})
    later = incoming(request('7'))
    incoming(done(turn='stale-turn'))
    incoming(done())
    decide('7', 'accept', later['fingerprint'])
    incoming(done())
    incoming(done(status='failed'))
    assert session.status == 'needs-attention' and session.task_success is None
    assert [x['result'].get('scope') for x in trace if x['result'] and x['result'].get('event') == 'wider-grant-refused'] == ['session', 'execpolicy', 'network-policy']
    assert sum(x['result'] is not None and x['result'].get('event') == 'reply-planned' for x in trace) == 1
    return trace


def check():
    report = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    assert report['state'] == 'offline-replay-verified' and report['tests']['exitCode'] == 0
    assert not report['fullS4Qualified'] and not report['fullS6Qualified'] and report['phase1Construction'] == 'HOLD'
    assert sha(ARCHIVE.read_bytes()) == report['schemaArchiveSha256']
    for name, digest in report['sourceSha256'].items():
        assert sha((ROOT / name).read_bytes()) == digest, name
    for name, digest in report['artifactSha256'].items():
        assert sha((OUT / name).read_bytes()) == digest, name
    assert json.loads((OUT / 'transcript.json').read_text(encoding='utf-8')) == walkthrough()
    print('Saved offline Codex replay verified; client policy only, no native/provider qualification')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        check()
        return
    OUT.mkdir(exist_ok=False)
    sources = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in SOURCE.iterdir() if p.suffix in ['.py', '.json']}
    archive_hash = sha(ARCHIVE.read_bytes())
    declared = json.loads((ROOT / 'output/s4-codex-schema/capabilities.json').read_text(encoding='utf-8'))
    assert archive_hash == declared['archiveSha256']
    command = [sys.executable, '-B', '-X', 'utf8', '-m', 'unittest', 'discover', '-s', str(SOURCE), '-p', 'test_replay.py', '-v']
    child = subprocess.run(command, capture_output=True, timeout=30)
    (OUT / 'tests.stdout.bin').write_bytes(child.stdout)
    (OUT / 'tests.stderr.bin').write_bytes(child.stderr)
    assert child.returncode == 0, child.stderr.decode('utf-8', errors='replace')
    trace = walkthrough()
    (OUT / 'transcript.json').write_text(json.dumps(trace, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    assert all(sha((ROOT / name).read_bytes()) == digest for name, digest in sources.items())
    report = {'schema': 'tiye-codex-offline-replay-v1', 'state': 'offline-replay-verified',
              'sourceSha256': sources, 'schemaArchiveSha256': archive_hash,
              'tests': {'exitCode': child.returncode, 'command': command, 'deadlineSeconds': 30},
              'walkthroughSteps': len(trace), 'packetsAreSynthetic': True, 'modelRequestRun': False,
              'fullS4Qualified': False, 'fullS6Qualified': False, 'phase1Construction': 'HOLD',
              'artifactSha256': {p.name: sha(p.read_bytes()) for p in OUT.iterdir() if p.is_file()}}
    (OUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    check()


if __name__ == '__main__':
    main()
