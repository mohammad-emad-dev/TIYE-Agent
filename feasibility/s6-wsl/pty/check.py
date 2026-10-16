"""Validate the stored mock PTY capture, optionally including installed build bytes."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
output = root / 'output/s6-pty'
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
native = json.loads((output / 'native.json').read_text(encoding='utf-8'))
coordinator = json.loads((output / 'coordinator.json').read_text(encoding='utf-8'))
prelaunch = json.loads((output / 'prelaunch.json').read_text(encoding='utf-8'))
protocol = json.loads((root / 'feasibility/s6-wsl/pty/protocol.json').read_text(encoding='utf-8'))
assert native['state'] == 'bounded-pty-observations-completed'
assert not native['fullS6Qualified'] and not native['productionEligible']
assert coordinator['exit'] == {'code': 0, 'signal': None}
assert not coordinator['timedOut'] and coordinator['sourceBuildBinariesUnchanged']
assert native['isatty'] == '111' and native['mode'] == {'echo': 0, 'isig': 1}
assert native['initialSize'] == protocol['initialSize'] == [120, 24]
assert native['resizedSize'] == protocol['resizedSize'] == [100, 16]
assert native['linuxSigintObserved'] and native['inputs'].count('\x03') == 1
assert native['terminalExitCode'] == native['workerExitCode'] == 0 and native['workerSignal'] is None
assert native['linuxIdentity']['status'] == 'verified-live'
assert native['linuxIdentity']['uid'] != 0 and native['linuxIdentity']['children'] == []
assert native['linuxIdentity']['nonceMatched']
assert native['afterStopIdentity'] == {'status': 'gone', 'bootIdSha256': native['linuxIdentity']['bootIdSha256']}
assert native['windowsWorkerPid'] > 0 and native['windowsWslPid'] > 0
assert len(native['payloads']) == len(protocol['pastes']) == 3
before = native['beforeStop']['lines']
for ordinal, (payload, observed) in enumerate(zip(protocol['pastes'], native['payloads']), 1):
    expected = payload.replace('\r\n', '\n').replace('\n', '\r')
    assert observed['ordinal'] == ordinal and observed['sentText'] == payload and observed['receivedText'] == expected
    assert observed['receivedUtf8Bytes'] == len(expected.encode('utf-8'))
    assert observed['linuxSha256'] == hashlib.sha256(expected.encode('utf-8')).hexdigest()
    assert observed['visibleBufferMatched']
    assert native['inputs'].count('\x1b[200~' + expected + '\x1b[201~') == 1
    ack = 'TIYE_ACK ' + native['nonce'] + ' ' + str(ordinal) + ' ' + str(observed['receivedUtf8Bytes']) + ' ' + observed['linuxSha256']
    assert ack in before
    for row in expected.split('\r'):
        visible = 'VISIBLE ' + row
        assert visible in before and before.index(ack) < before.index(visible)
assert native['inputs'].count('\x1b[200~STOP ' + native['nonce'] + '\x1b[201~') == 1
transcript = (output / 'decoded-vt.log').read_bytes()
assert len(transcript) == native['transcriptBytes'] == native['renderer']['receivedBytes']
assert hashlib.sha256(transcript).hexdigest() == native['transcriptSha256'] == native['renderer']['receivedSha256']
assert len(transcript) <= 1048576
assert native['renderer']['cols'] == 100 and native['renderer']['rows'] == 16
assert native['versions'] == {'electron': '38.8.6', 'node': '22.22.0', 'nodePty': '1.1.0', 'xterm': '5.5.0'}
assert (output / 'terminal-before-stop.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
assert not (output / 'worker.stderr.log').read_bytes()
for name, expected in prelaunch['sourceBuildBinaryHashes'].items():
    assert '..' not in Path(name).parts and not Path(name).is_absolute()
    runtime_input = '/node_modules/' in name or '/dist/' in name
    if '--runtime' in sys.argv or not runtime_input:
        assert digest(root / name) == expected, name
print('Stored WSL mock PTY input/resize/SIGINT/exit capture verified; full S6 remains open')
