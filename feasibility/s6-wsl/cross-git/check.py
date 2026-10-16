"""Verify saved controls, refusals and content inventories; no native execution."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
output = root / 'output/s6-cross-git'
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
original = json.loads((output / 'evidence.json').read_text(encoding='utf-8'))
followup = json.loads((output / 'peer-followup.json').read_text(encoding='utf-8'))
assert original['state'] == 'incomplete' and original['failure'] == 'linux-fixture failed; no retry'
assert followup['state'] == 'remaining-peer-read-recorded'
assert followup['originalEvidenceSha256'] == digest(output / 'evidence.json')
assert not followup['fixtureRecreated'] and not followup['metadataRewritten']
assert json.loads((output / 'peer-preflight.json').read_text()) == {'state': 'preflight'}
streams = {}
for report in [original, followup]:
    assert report['fullS6Qualified'] is False and report['productionEligible'] is False
    assert report['sourceHashesUnchangedAfterRun']
    for name, expected in report['sourceHashes'].items():
        assert name.startswith('feasibility/s6-wsl/cross-git/') and '..' not in Path(name).parts
        assert digest(root / name) == expected
    for query in report['queries']:
        label = query['label']
        assert label not in streams and not query['timedOut']
        expected_exit = 128 if label in ['linux-reads-windows', 'windows-reads-linux'] else 1 if label == 'linux-fixture' else 0
        assert query['exitCode'] == expected_exit
        streams[label] = {}
        for stream in ['stdout', 'stderr']:
            entry = query[stream]
            assert entry['artifact'] == label + '.' + stream + '.bin'
            raw = (output / entry['artifact']).read_bytes()
            assert len(raw) == entry['bytes'] and digest(output / entry['artifact']) == entry['sha256']
            streams[label][stream] = raw
foreign = [q for r in [original, followup] for q in r['queries'] if q['foreignRead']]
assert [q['label'] for q in foreign] == ['linux-reads-windows', 'windows-reads-linux']
assert all(q['command'][-3:] == ['rev-parse', '--verify', 'HEAD'] for q in foreign)
windows = original['windowsFixture']
assert original['nativeGitVersion'] == 'git version 2.55.0.windows.5'
assert windows['base'] != windows['head']
protocol = json.loads((root / 'feasibility/s6-wsl/cross-git/protocol.json').read_text(encoding='utf-8'))
content = protocol['content'].encode('utf-8')
assert streams['windows-blob']['stdout'] == content
assert windows['blobSha256'] == hashlib.sha256(content).hexdigest()
for label in ['windows-control-main', 'windows-control-worktree', 'windows-owner-after']:
    assert streams[label]['stdout'].decode().strip() == windows['head']
assert streams['windows-clean-main']['stdout'] == streams['windows-clean-worktree']['stdout'] == b''
assert original['windowsSnapshot']['before'] == original['windowsSnapshot']['after']
assert original['windowsSnapshot']['equal']
assert streams['linux-snapshot-before']['stdout'] == streams['linux-snapshot-after']['stdout']
assert followup['linuxSnapshotEqual']
error = streams['linux-reads-windows']['stderr'].decode('utf-8')
assert 'not a git repository' in error and 'C:/Users/' in error
assert 'dubious ownership' in streams['windows-reads-linux']['stderr'].decode('utf-8')
linux_error = streams['linux-fixture']['stderr'].decode('utf-8')
assert '/commondir' in linux_error and 'No such file or directory' in linux_error
metadata = followup['linuxOwnerMetadata']
assert streams['linux-owner-metadata']['stdout'].decode('utf-8') == metadata
assert 'commondir=../..\n' in metadata
linux_head = streams['linux-owner-after']['stdout'].decode().strip()
assert len(linux_head) == 40 and metadata.endswith(linux_head + '\n')
assert 'head=' + linux_head + '\n' in streams['linux-fixture']['stdout'].decode('utf-8')
assert 'blobSha256=' + hashlib.sha256(content).hexdigest() + '\n' in streams['linux-fixture']['stdout'].decode('utf-8')
print('Saved partial cross-Git observations verified: owner controls succeed; both peer reads refused; byte inventories unchanged')
