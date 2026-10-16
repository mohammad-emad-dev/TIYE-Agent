"""Verify the single saved cohort without launching Electron, WSL or signaling."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/s6-recovery'


def read(name):
    return json.loads((OUT / name).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    coordinator, prelaunch = read('coordinator.json'), read('prelaunch.json')
    assert coordinator['state'] == 'bounded-live-survivor-recovery-completed'
    assert coordinator['sourcesUnchanged'] and not coordinator['fullS6Qualified']
    assert coordinator['phase1Construction'] == 'HOLD'
    assert coordinator['elapsedMs'] < 70000 and prelaunch['attempts'] == 1 and prelaunch['retries'] == 0
    for name, digest in coordinator['artifactSha256'].items():
        assert sha(OUT / name) == digest, name
    for name, digest in prelaunch['sourceBinaryHashes'].items():
        # Installed executable bytes are machine-specific; saved sources are portable.
        if name.startswith('feasibility/'):
            assert sha(ROOT / name) == digest, name
    assert [s['stage'] for s in coordinator['stages']] == ['crash', 'restart']
    assert all(not s['timedOut'] for s in coordinator['stages'])
    assert coordinator['stages'][0]['exit']['code'] not in [None, 0]
    assert coordinator['stages'][1]['exit'] == {'code': 0, 'signal': None}
    crash, restart = read('crash.json'), read('restart.json')
    assert crash['completed'] and restart['completed']
    assert crash['crashRequested'] == 'Electron main process.crash'
    assert crash['descriptor'] == restart['descriptor']
    assert crash['electronPid'] != restart['electronPid']
    for index, stage in enumerate([crash, restart]):
        assert stage['electronPid'] == coordinator['stages'][index]['ownedElectronPid']
        for entry in stage['observations']:
            assert entry['exitCode'] == 0 and entry['signal'] is None and entry['error'] is None
            assert (OUT / (entry['prefix'] + '.stderr.bin')).read_bytes() == b''
            assert read(entry['prefix'] + '.stdout.bin') == entry['result']
    assert [o['mode'] for o in crash['observations']] == ['bootstrap', 'inspect']
    assert [o['mode'] for o in restart['observations']] == [
        'inspect', 'inspect', 'admit', 'admit-negative', 'negative', 'inspect', 'recover', 'wait-gone', 'inspect']
    boot = crash['observations'][0]['result']
    assert hashlib.sha256(boot['registryText'].encode('utf-8')).hexdigest() == crash['descriptor']['registrySha256']
    registry = json.loads(boot['registryText'])
    assert registry['nonce'] == crash['descriptor']['nonce']
    pre = crash['observations'][1]['result']
    first, second, blocked, refused, negative, after, recovery, final, stable = [o['result'] for o in restart['observations']]
    expected = [s['expected'] for s in pre['states']]
    assert registry['identities'] == expected
    for value in [boot['observation'], pre, first, second, blocked['observation'], after]:
        assert len(value['states']) == 2
        assert all(s['status'] == 'verified-live' and s['expected'] == e for s, e in zip(value['states'], expected))
        assert all(all(s['observed'][k] == e[k] for k in ['pid', 'startTicks', 'uid', 'bootIdSha256'])
                   for s, e in zip(value['states'], expected))
    assert all(second['heartbeats'][role]['counter'] > first['heartbeats'][role]['counter'] for role in ['root', 'child'])
    assert blocked['decision'] == 'blocked-existing' and blocked['newLaunches'] == 0 and not blocked['signals']
    assert refused['decision'] == 'paused-unverified' and refused['newLaunches'] == 0 and not refused['signals']
    assert refused['observation']['states'][0]['status'] == 'unverified'
    assert negative['decision'] == 'paused-unverified' and not negative['signals'] and negative['newLaunches'] == 0
    assert negative['negativeControl']
    assert negative['expectedIdentities'][0]['startTicks'] == expected[0]['startTicks'] + 1
    assert recovery['expectedIdentities'] == expected and not recovery['negativeControl']
    assert recovery['decision'] == 'verified-supervisor-signaled' and recovery['newLaunches'] == 0
    assert recovery['signals'] == [{'pid': expected[0]['pid'], 'signal': 'SIGTERM', 'mechanism': 'pidfd'}]
    assert all(s['status'] == 'gone' and s['observed'] is None for value in [final, stable] for s in value['states'])
    assert final['supervisorExit']['reason'] == 'SIGTERM' and final['supervisorExit']['childExitCode'] == 0
    assert final['heartbeats'] == stable['heartbeats']
    assert first['bootIdSha256'] == stable['bootIdSha256'] == expected[0]['bootIdSha256'] == expected[1]['bootIdSha256']
    assert stable['ageSeconds'] < 60
    assert all(len(value['launchRecords']) == 1 for value in [first, second, after, final, stable])
    assert stable['launchRecords'][0]['pid'] == expected[0]['pid']
    assert boot['fixtureSourceSha256'] == sha(Path(__file__).parent / 'linux.py')
    print('Stored live-survivor crash/restart recovery verified; no general process-tree or full S6 qualification')


if __name__ == '__main__':
    main()
