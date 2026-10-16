"""Verify this stored partial NAT/pipe-relay cohort without network activity."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
output = root / 'output/s6-connectivity'
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = json.loads((output / 'evidence.json').read_text(encoding='utf-8'))
assert report['schema'] == 'tiye-s6-connectivity-v1'
assert report['state'] == 'route-observations-completed'
assert report['networkingMode'] == 'nat' and report['sdkVersion'] == '1.32.1'
assert not report['fullS6Qualified'] and not report['productionEligible']
assert report['networkConfigurationChanged'] is False
assert report['sourceHashesUnchangedAfterRun']
assert report['ownedServerExitObserved'] and report['serverPortClosedAfterExit'] is None
assert report['serverBind']['host'] == '127.0.0.1' and report['serverBind']['port'] != 40900
for name, expected in report['sourceHashes'].items():
    assert name.startswith('feasibility/') and '..' not in Path(name).parts
    assert digest(root / name) == expected
for name, expected in report['artifactHashes'].items():
    assert Path(name).name == name and digest(output / name) == expected
assert [r['route'] for r in report['routes']] == ['windows-control', 'ubuntu-loopback', 'ubuntu-interop-pipe']
for route in report['routes']:
    assert not route['timedOut']
    name = route['route']
    assert json.loads((output / (name + '.stdout.json')).read_text()) == route['client']
    assert not (output / (name + '.stderr.bin')).read_bytes()
    if name == 'ubuntu-loopback':
        assert route['exitCode'] == 1 and route['client']['state'] == 'route-incomplete'
        assert route['client']['errorClass'] == 'ConnectionRefusedError'
        assert route['client']['steps'] == []
        assert route['serverCorrelation'] == {'member-a': 0, 'member-b': 0}
        continue
    assert route['exitCode'] == 0 and route['client']['state'] == 'roundtrip-completed'
    steps = route['client']['steps']
    assert len(steps) == 13
    for operation in ['missing-token', 'bad-token', 'foreign-member-session']:
        assert [s['httpStatus'] for s in steps if s['operation'] == operation] == [401]
    for member in ['member-a', 'member-b']:
        assert route['serverCorrelation'][member] == 1
        own = [s for s in steps if s.get('member') == member]
        assert [s['operation'] for s in own] == ['initialize', 'tools/list', 'tools/call', 'acknowledgement', 'delete-session']
        assert own[3]['matched']
        assert own[-1]['httpStatus'] == 200
        assert all(s['requestIdMatched'] and s['httpStatus'] == 200 for s in own[:3])
logs = (output / 'server.stdout.log').read_text(encoding='utf-8')
assert logs.count('auth-rejected ') == 4 and logs.count('session-ownership-rejected ') == 2
for member in ['member-a', 'member-b']:
    assert logs.count('report-match member=' + member + ' matched=true') == 2
    assert logs.count('session-close member=' + member) == 2
assert not (output / 'server.stderr.log').read_bytes()
assert 'matched=false' not in logs and 'Bearer ' not in logs
listener = json.loads((output / 'listener-observation.json').read_text())
assert listener['originalEvidenceSha256'] == digest(output / 'evidence.json')
assert listener['scriptSha256'] == digest(root / 'feasibility/s6-wsl/connectivity/observe-listener.ps1')
assert listener['exitCode'] == 0 and listener['tcpListenerAbsent']
assert listener['observation']['port'] == report['serverBind']['port']
assert listener['observation']['tcpListenersAtPort'] == 0
print('Partial NAT connectivity evidence verified: direct loopback refused, interop pipe roundtrip passed, later listener inventory empty')
