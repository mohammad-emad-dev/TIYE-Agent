"""Verify stored discovery evidence without launching WSL or any provider."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
output = root / 'output/s6-discovery'
report = json.loads((output / 'discovery.json').read_text(encoding='utf-8'))
assert report['schema'] == 'tiye-s6-discovery-v1'
assert report['state'] == 'prerequisite-discovery-completed'
assert report['operatorConfirmedUserSetup'] and report['observedUidNonzero']
assert report['sourceHashesUnchangedAfterRun']
assert report['providerCliInvocations'] == 0
assert report['fullS6Qualified'] is False and report['productionEligible'] is False
expected_sources = {'feasibility/s6-wsl/discover.py', 'feasibility/s6-wsl/PLAN.md'}
assert set(report['sourceHashes']) == expected_sources
for name, expected in report['sourceHashes'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
expected_queries = ['uid', 'os-release', 'kernel', 'native-tools', 'cli-presence']
assert [q['query'] for q in report['queries']] == expected_queries
contents = {}
for query in report['queries']:
    assert query['exitCode'] == 0 and query['timedOut'] is False
    assert query['stderr']['bytes'] == 0
    for stream in ['stdout', 'stderr']:
        artifact = query[stream]
        assert artifact['artifact'] == query['query'] + '.' + stream + '.bin'
        raw = (output / artifact['artifact']).read_bytes()
        assert len(raw) == artifact['bytes']
        assert hashlib.sha256(raw).hexdigest() == artifact['sha256']
        if stream == 'stdout':
            contents[query['query']] = raw.decode('utf-8', errors='strict')
assert contents['uid'].strip().isdecimal() and int(contents['uid']) != 0
assert 'ID=ubuntu\n' in contents['os-release']
assert contents['kernel'].strip()
assert 'git\tpath=/usr/bin/git\tresolved=/usr/bin/git\tmagic=7f454c46\n' in contents['native-tools']
assert 'git version 2.53.0\n' in contents['native-tools']
assert 'node\tnot-on-tested-PATH\n' in contents['native-tools']
assert contents['cli-presence'].splitlines() == [name + '\tnot-on-tested-PATH' for name in ['codex', 'claude', 'opencode', 'gemini', 'agy', 'mimo']]
print('Stored Ubuntu discovery verified; S6 remains unqualified')
