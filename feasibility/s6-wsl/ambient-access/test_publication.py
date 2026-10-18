"""Offline validator regressions use synthetic records, not live resource claims."""
import copy
import hashlib
import json
import unittest

import run
from publication import validate_ambient, validate_records


def synthetic_records():
    nonce = 'a' * 32
    actor = {'pid': 7, 'startTicks': 8, 'uid': 1000, 'ppid': 6, 'sid': 7, 'cgroup': 'fixture'}
    namespaces = {'mnt': 'fixture-mnt', 'net': 'fixture-net', 'user': 'fixture-user'}
    root = '/tmp/tiye-ambient-resources-fixture'
    probe = {'nonce': nonce, 'actor': copy.deepcopy(actor), 'gid': 1000, 'uidTuple': [1000] * 4,
        'capEff': '0', 'capAmb': '0', 'umask': '0077', 'namespaceIds': namespaces,
        'environmentNames': ['CODEX_HOME', 'HOME', 'LC_ALL', 'PATH', 'TMPDIR'],
        'freshEnvironment': True, 'cwdMatchesRuntime': True, 'resourcesOutsideHome': True, 'resourcesOutsideCwd': True,
        'readSha256': hashlib.sha256(('owned-read:' + nonce).encode()).hexdigest(),
        'writeSha256': hashlib.sha256(('owned-write:' + nonce).encode()).hexdigest(),
        'deniedErrno': 13, 'expectedDeniedErrno': 13,
        'unix': {'ackMatched': True, 'remoteEndpoint': root + '/service.sock'},
        'tcp': {'ackMatched': True, 'remoteEndpoint': ['127.0.0.1', 40001], 'localEndpoint': ['127.0.0.1', 40002]}}
    resources = {'resourceRoot': root, 'rootIdentity': {'uid': 1000, 'mode': 0o700, 'type': 0o40000},
        'ownerPid': 4, 'ownerUid': 1000, 'namespaceIds': copy.deepcopy(namespaces), 'writeSha256': probe['writeSha256'],
        'initial': {name: {'uid': 1000, 'mode': mode, 'type': kind} for name, mode, kind in
            [('read.txt', 0o600, 0o100000), ('deny.txt', 0, 0o100000),
             ('service.sock', 0o600, 0o140000), ('peer-write.txt', 0o600, 0o100000)]},
        'rootAbsent': True, 'threadsStopped': True, 'listenerFdsClosed': True,
        'receipts': {'unix': {'nonceMatched': True, 'peerCredentials': [7, 1000, 1000], 'listenerEndpoint': root + '/service.sock'},
                     'tcp': {'nonceMatched': True, 'listenerEndpoint': ['127.0.0.1', 40001], 'peerEndpoint': ['127.0.0.1', 40002]}}}
    return ({'linux': {'nonce': nonce, 'identities': [{}, {}, actor], 'observer': {'pid': 4}}},
            {'event': 'ambient', 'nonce': nonce, 'probe': probe, 'resources': resources})


class AmbientChecks(unittest.TestCase):
    def setUp(self):
        self.digest = run.fingerprint(run.source_manifest())
        self.records = json.loads((run.OUT / 'observations.json').read_text(encoding='utf-8'))

    def test_saved_capture_verifies(self):
        self.assertEqual(run.check(), 0)

    def test_private_fields_refuse_publication(self):
        changed = copy.deepcopy(self.records)
        changed[0]['resourceRoot'] = 'synthetic-private-path'
        with self.assertRaisesRegex(ValueError, 'unreviewed-or-promoted'):
            validate_records(changed, self.digest)

    def test_reach_does_not_promote_confinement_credentials_or_tcp_pid(self):
        for key in ('confinementProven', 'realCredentialsTested', 'externalNetworkTested', 'tcpPidAttributed', 'deletionAllowed'):
            with self.subTest(key=key):
                changed = copy.deepcopy(self.records)
                changed[0][key] = True
                with self.assertRaisesRegex(ValueError, 'unreviewed-or-promoted'):
                    validate_records(changed, self.digest)

    def test_wrong_peer_nonce_endpoint_or_capability_is_rejected(self):
        record, baseline = synthetic_records()
        validate_ambient(record, baseline)
        for scenario in ('nonce', 'pid', 'tcp', 'capability', 'namespace'):
            with self.subTest(scenario=scenario):
                changed = copy.deepcopy(baseline)
                if scenario == 'nonce':
                    changed['nonce'] = 'b' * 32
                elif scenario == 'pid':
                    changed['resources']['receipts']['unix']['peerCredentials'][0] = 99
                elif scenario == 'tcp':
                    changed['resources']['receipts']['tcp']['peerEndpoint'][1] = 40003
                elif scenario == 'capability':
                    changed['probe']['capEff'] = '1'
                else:
                    changed['probe']['namespaceIds']['net'] = 'wrong-fixture-net'
                with self.assertRaises(ValueError):
                    validate_ambient(record, changed)

    def test_cleanup_and_denial_cannot_be_inferred_from_reach(self):
        record, baseline = synthetic_records()
        for scenario in ('cleanup', 'denial', 'ownership'):
            with self.subTest(scenario=scenario):
                changed = copy.deepcopy(baseline)
                if scenario == 'cleanup':
                    changed['resources']['rootAbsent'] = False
                elif scenario == 'denial':
                    changed['probe']['deniedErrno'] = None
                else:
                    changed['resources']['ownerPid'] = 99
                with self.assertRaises(ValueError):
                    validate_ambient(record, changed)

    def test_assessment_cannot_admit_native(self):
        assessment = run.admission_assessment(self.digest)
        assessment['nativeAdmissionGranted'] = True
        with self.assertRaisesRegex(ValueError, 'cannot-promote-admission'):
            run.validate_assessment(assessment, self.digest)


if __name__ == '__main__':
    unittest.main()
