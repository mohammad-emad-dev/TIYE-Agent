"""Verify this saved two-case observation; do not launch or signal processes."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
output = root / 'output/s6-lifecycle'
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
report = json.loads((output / 'evidence.json').read_text(encoding='utf-8'))
assert report['schema'] == 'tiye-s6-lifecycle-v1'
assert report['state'] == 'bounded-lifecycle-observations-completed'
assert report['fullS6Qualified'] is False and report['productionEligible'] is False
assert report['duplicateLaunches'] == 0 and report['sourceHashesUnchangedAfterRun']
for name, expected in report['sourceHashes'].items():
    assert name.startswith('feasibility/s6-wsl/lifecycle/') and '..' not in Path(name).parts
    assert digest(root / name) == expected
assert [case['scenario'] for case in report['cases']] == ['graceful', 'launcher-exit']
for case in report['cases']:
    assert case['completed'] and case['launcherStreamsJoined']
    assert not case.get('emergencyOwnedLauncherTermination', False)
    registry = case['ready']['registry']
    raw_registry = json.dumps(registry).encode('utf-8')
    assert hashlib.sha256(raw_registry).hexdigest() == case['ready']['registrySha256']
    assert registry['nonce'] == case['nonce'] and registry['scenario'] == case['scenario']
    identities = registry['identities']
    assert len(identities) == 2 and identities[0]['pid'] != identities[1]['pid']
    assert all(i['uid'] != 0 and i['startTicks'] > 0 for i in identities)
    assert identities[0]['bootIdSha256'] == identities[1]['bootIdSha256']
    results = {}
    for observation in case['observations']:
        assert observation['exitCode'] == 0 and not observation['timedOut']
        assert observation['stderr']['bytes'] == 0
        for stream in ['stdout', 'stderr']:
            entry = observation[stream]
            assert entry['artifact'] == case['scenario'] + '-' + observation['label'] + '.' + stream + '.bin'
            raw = (output / entry['artifact']).read_bytes()
            assert len(raw) == entry['bytes'] and digest(output / entry['artifact']) == entry['sha256']
            if stream == 'stdout':
                assert json.loads(raw) == observation['result']
        results[observation['label']] = observation['result']
    for stream in ['stdout', 'stderr']:
        entry = case['launcher-' + stream]
        assert entry['artifact'] == case['scenario'] + '-launcher.' + stream + '.bin'
        assert (output / entry['artifact']).stat().st_size == entry['bytes']
        assert digest(output / entry['artifact']) == entry['sha256']
    assert case['launcher-stderr']['bytes'] == 0
    assert json.loads((output / case['launcher-stdout']['artifact']).read_bytes()) == case['ready']
    for label in ['live-first', 'live-second']:
        assert [s['status'] for s in results[label]['states']] == ['verified-live', 'verified-live']
        assert [s['expected'] for s in results[label]['states']] == identities
    for role in ['root', 'child']:
        assert results['live-second']['heartbeats'][role]['counter'] > results['live-first']['heartbeats'][role]['counter']
    for label in ['final', 'stable']:
        assert all(s['status'] == 'gone' and s['observed'] is None for s in results[label]['states'])
        assert [s['expected'] for s in results[label]['states']] == identities
        assert results[label]['ageSeconds'] < 30
    assert results['stable']['heartbeats'] == results['final']['heartbeats']
    if case['scenario'] == 'graceful':
        assert case['ownedLauncherExitCode'] == 0
        assert list(results) == ['live-first', 'live-second', 'final', 'stable']
    else:
        assert case['ownedLauncherExitCode'] == 1
        assert list(results) == ['live-first', 'live-second', 'negative-identity', 'after-negative', 'after-launcher-exit', 'recovery', 'final', 'stable']
        assert results['negative-identity'] == {'decision': 'paused-unverified', 'negativeControl': True, 'signals': []}
        assert all(s['status'] == 'verified-live' for s in results['after-negative']['states'])
        assert all(s['status'] == 'gone' for s in results['after-launcher-exit']['states'])
        assert results['recovery'] == {'decision': 'no-live-survivors', 'negativeControl': False, 'signals': []}
print('Stored graceful/launcher-exit mock observations verified; no live-survivor cleanup or full S6 qualification')
