"""Check saved public propagation evidence without launching WSL or Git."""
import hashlib
import json
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parents[3]
output = root / 'output/s6-environment'
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = json.loads((output / 'evidence.json').read_text(encoding='utf-8'))
protocol = json.loads((root / 'feasibility/s6-wsl/environment/protocol.json').read_text(encoding='utf-8'))
expected_keys = ['TIYE_SENTINEL', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE',
                 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE']
assert protocol['allowedKeys'] == expected_keys and set(protocol['values']) == set(expected_keys)
assert report['schema'] == 'tiye-s6-environment-v1' and report['state'] == 'bounded-propagation-completed'
assert not report['fullS6Qualified'] and not report['productionEligible']
assert report['nativeLaunchRetries'] == 0 and report['sourceHashesUnchangedAfterRun']
for name, expected in report['sourceHashes'].items():
    assert name.startswith('feasibility/s6-wsl/environment/') and '..' not in Path(name).parts
    assert digest(root / name) == expected
assert report['negativeCases'] == [
    {'case': 'unknown-key', 'category': 'unknown-key', 'nativeLaunches': 0},
    {'case': 'nul-value', 'category': 'invalid-value', 'nativeLaunches': 0}]
assert [c['label'] for c in report['cases']] == protocol['order']
observations = {}
for case in report['cases']:
    assert case['exitCode'] == 0 and not case['timedOut']
    assert case['stderr']['bytes'] == 0
    for stream in ['stdout', 'stderr']:
        entry = case[stream]
        assert entry['artifact'] == case['label'] + '.' + stream + '.bin'
        raw = (output / entry['artifact']).read_bytes()
        assert len(raw) == entry['bytes'] and digest(output / entry['artifact']) == entry['sha256']
        if stream == 'stdout':
            parsed = json.loads(raw)
            assert parsed == case['observation']
            observations[case['label']] = parsed
assert observations['decoy-import-control'] == {'decoyImported': True}
full = observations['explicit-allowlist']
baseline = observations['baseline']
expected_brief = {'sha256': hashlib.sha256(protocol['briefing'].encode('utf-8')).hexdigest(),
                  'bytes': 131, 'lines': 4, 'taskId': full['briefing']['taskId']}
assert expected_brief['taskId'].startswith('s6-public-')
for observation, expected in [(full, protocol['values']), (baseline, {})]:
    assert observation['uidNonzero'] and observation['descendantExitCode'] == 0
    assert observation['selected'] == expected and observation['descendant']['selected'] == expected
    assert observation['decoyPresent'] is False and observation['descendant']['decoyPresent'] is False
    assert observation['briefing'] == observation['descendant']['briefing'] == expected_brief
assert baseline['gitIdents'] == {}
expected_idents = {}
for role in ['AUTHOR', 'COMMITTER']:
    values = protocol['values']
    timestamp = int(datetime.fromisoformat(values['GIT_' + role + '_DATE']).timestamp())
    expected_idents['GIT_' + role + '_IDENT'] = values['GIT_' + role + '_NAME'] + ' <' + values['GIT_' + role + '_EMAIL'] + '> ' + str(timestamp) + ' +0000'
assert full['gitIdents'] == expected_idents
print('Saved WSL allowlist, decoy control, briefing text and synthetic Git identities verified; full S6 remains open')
