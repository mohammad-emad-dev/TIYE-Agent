"""Separate peer/resource identity checks from selected reachability claims."""
import hashlib
import json
from pathlib import PurePosixPath
import re

import contract


def canonical(record):
    return json.dumps(record, sort_keys=True, allow_nan=False)


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def validate_ambient(record, event):
    probe, resources = event['probe'], event['resources']
    peer, nonce = record['linux']['identities'][2], record['linux']['nonce']
    require(event['event'] == 'ambient' and event['nonce'] == probe['nonce'] == nonce, 'ambient-nonce-binding')
    require(all(probe['actor'][key] == peer[key] for key in ('pid', 'startTicks', 'uid', 'ppid', 'sid', 'cgroup')),
            'ambient-peer-identity')
    require(probe['actor']['uid'] == resources['ownerUid'] == 1000
            and resources['ownerPid'] == record['linux']['observer']['pid'], 'resource-owner-identity')
    require(probe['uidTuple'] == [1000, 1000, 1000, 1000] and int(probe['capEff'], 16) == 0
            and int(probe['capAmb'], 16) == 0 and probe['umask'] == '0077'
            and set(probe['namespaceIds']) == {'mnt', 'net', 'user'}
            and probe['namespaceIds'] == resources['namespaceIds'], 'runtime-identity-capability-or-namespace')
    require(probe['environmentNames'] == ['CODEX_HOME', 'HOME', 'LC_ALL', 'PATH', 'TMPDIR']
            and all(probe[key] is True for key in ('freshEnvironment', 'cwdMatchesRuntime', 'resourcesOutsideHome', 'resourcesOutsideCwd')),
            'ambient-environment-or-boundary')
    for key, prefix in (('readSha256', 'owned-read:'), ('writeSha256', 'owned-write:')):
        expected = hashlib.sha256((prefix + nonce).encode('ascii')).hexdigest()
        require(probe[key] == expected, 'synthetic-file-content')
    require(resources['writeSha256'] == probe['writeSha256'] and probe['deniedErrno'] == 13
            and probe['expectedDeniedErrno'] == 13, 'synthetic-write-or-denial')
    validate_resources(resources, probe)


def validate_resources(resources, probe):
    root = resources['resourceRoot']
    require(re.fullmatch('/tmp/tiye-ambient-resources-[a-z0-9_]+', root) is not None, 'synthetic-root-shape')
    require(resources['rootIdentity']['uid'] == 1000 and resources['rootIdentity']['mode'] == 0o700
            and resources['rootIdentity']['type'] == 0o40000, 'synthetic-root-metadata')
    expected = {'read.txt': (0o600, 0o100000), 'deny.txt': (0, 0o100000),
                'service.sock': (0o600, 0o140000), 'peer-write.txt': (0o600, 0o100000)}
    require(set(resources['initial']) == set(expected), 'synthetic-resource-inventory')
    for name, (mode, kind) in expected.items():
        metadata = resources['initial'][name]
        require(metadata['uid'] == 1000 and metadata['mode'] == mode and metadata['type'] == kind,
                'synthetic-resource-metadata')
    require(all(resources[key] is True for key in ('rootAbsent', 'threadsStopped', 'listenerFdsClosed')),
            'resource-cleanup-unverified')
    receipts = resources['receipts']
    require(set(receipts) == {'unix', 'tcp'} and all(row['nonceMatched'] is True for row in receipts.values()), 'listener-nonce')
    require(receipts['unix']['peerCredentials'] == [probe['actor']['pid'], 1000, probe['gid']]
            and probe['unix']['ackMatched'] is True
            and receipts['unix']['listenerEndpoint'] == probe['unix']['remoteEndpoint'] == str(PurePosixPath(root) / 'service.sock'),
            'unix-peer-credentials-or-ack')
    require(probe['tcp']['ackMatched'] is True and receipts['tcp']['listenerEndpoint'] == probe['tcp']['remoteEndpoint']
            and receipts['tcp']['peerEndpoint'] == probe['tcp']['localEndpoint']
            and probe['tcp']['remoteEndpoint'][0] == '127.0.0.1', 'tcp-endpoint-or-ack')


def verdict(fingerprint):
    return {'case': 'owned-ambient-probe', 'sourceSetSha256': fingerprint,
        'scope': 'shared-account-cli-mock', 'freshEnvironmentObserved': True,
        'outsideFreshHomeRead': True, 'outsideFreshHomeWrite': True, 'mode000ReadDenied': True,
        'unixConnectObserved': True, 'unixPeerCredentialsBound': True, 'tcpLoopbackConnectObserved': True,
        'tcpPidAttributed': False, 'ownedResourceCleanupVerified': True, 'lifecycleCleanupVerified': True,
        'realCredentialsTested': False, 'externalNetworkTested': False, 'confinementProven': False,
        'retentionRequired': True, 'deletionAllowed': False}


def select_public(record, event, storage, fingerprint):
    validate_ambient(record, event)
    require(all(storage['prelaunch'].values()) and len(storage['audit']) == len(contract.filenames('valid')),
            'private-storage-not-verified')
    return verdict(fingerprint)


def validate_records(records, fingerprint):
    require(canonical(records) == canonical([verdict(fingerprint)]), 'unreviewed-or-promoted-ambient-verdict')
