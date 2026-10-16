"""Check this saved partial cohort, including its required Windows failure."""
import hashlib
import json
import ntpath
from pathlib import Path

root = Path(__file__).resolve().parents[3]
output = root / 'output/s6-path-git'
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
original = json.loads((output / 'evidence.json').read_text(encoding='utf-8'))
followup = json.loads((output / 'linux-followup.json').read_text(encoding='utf-8'))
assert original['schema'] == 'tiye-s6-path-git-v1'
assert followup['schema'] == 'tiye-s6-linux-followup-v1'
assert original['state'] == 'incomplete' and original['failure'] == 'windows-mounted failed; no retry'
assert followup['state'] == 'linux-fixture-completed'
assert followup['originalEvidenceSha256'] == digest(output / 'evidence.json')
assert [q['label'] for q in original['queries']] == ['uid', 'windows-to-linux', 'windows-roundtrip', 'linux-root', 'linux-marker', 'windows-mounted']
assert [q['label'] for q in followup['queries']] == ['linux-local', 'linux-local-path-to-windows', 'linux-local-path-roundtrip']
streams = {}
for report in [original, followup]:
    assert report['fullS6Qualified'] is False and report['productionEligible'] is False
    assert report['nativeWindowsGitInteropTested'] is False and report['rootsRetained']
    assert report['sourceHashesUnchangedAfterRun']
    for name, expected in report['sourceHashes'].items():
        assert name.startswith('feasibility/s6-wsl/path-git/')
        assert '..' not in Path(name).parts
        assert digest(root / name) == expected
    for query in report['queries']:
        assert not query['timedOut']
        assert query['exitCode'] == (128 if query['label'] == 'windows-mounted' else 0)
        for stream in ['stdout', 'stderr']:
            entry = query[stream]
            assert entry['artifact'] == query['label'] + '.' + stream + '.bin'
            raw = (output / entry['artifact']).read_bytes()
            assert len(raw) == entry['bytes'] and digest(output / entry['artifact']) == entry['sha256']
            streams[(query['label'], stream)] = raw.decode('utf-8', errors='strict')
failure = streams[('windows-mounted', 'stderr')]
assert 'config.lock failed: Operation not permitted' in failure
assert "could not set 'core.filemode' to 'false'" in failure
assert 'fixtureComplete=true' not in streams[('windows-mounted', 'stdout')]
assert not original['fixtures']
facts = followup['facts']
protocol = json.loads((root / 'feasibility/s6-wsl/path-git/protocol.json').read_text(encoding='utf-8'))
expected_hash = hashlib.sha256(protocol['content'].encode('utf-8')).hexdigest()
assert facts['blobSha256'] == facts['fileSha256'] == expected_hash
assert facts['base'] != facts['edited']
linux = streams[('linux-local', 'stdout')]
for name, value in facts.items():
    assert name + '=' + value + '\n' in linux
assert 'Fast-forward\n' in linux and 'git version 2.53.0\n' in linux
assert streams[('linux-local', 'stderr')] == "Preparing worktree (new branch 'fixture-edit')\n"
assert 'file:/etc/' not in linux and 'file:/home/' not in linux
assert 'worktree ' + facts['canonicalRepo'] + '\n' in linux
assert 'worktree ' + facts['canonicalWorktree'] + '\n' not in linux
assert followup['path']['linux'] == followup['path']['returned'] == facts['canonicalRepo']
assert followup['path']['windows'] == streams[('linux-local-path-to-windows', 'stdout')].rstrip('\n')
assert followup['path']['returned'] == streams[('linux-local-path-roundtrip', 'stdout')].rstrip('\n')
win = original['paths'][0]
assert ntpath.normcase(ntpath.normpath(win['input'])) == ntpath.normcase(ntpath.normpath(win['returned']))
assert win['linux'] == streams[('windows-to-linux', 'stdout')].rstrip('\n')
assert win['returned'] == streams[('windows-roundtrip', 'stdout')].rstrip('\n')
print('Partial cohort verified: Windows-mounted init failed; Linux fixture and recorded path round trips passed; full S6 remains open')
