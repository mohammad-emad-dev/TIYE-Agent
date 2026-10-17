"""Compose the mock protocol with independently observed service cleanup."""
import base64
import io
import json
import os
import signal
import sys
import time
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import witness


class ManagedTransportTests(witness.ServiceTests):
    def exercise(self, mode, crash):
        for name in ('transport.py', 'owned.py', 'protocol_peer.py'):
            (self.folder / name).write_bytes((SOURCE / name).read_bytes())
        (self.folder / 'mode.txt').write_text(mode)
        owned, cgroup = self.prepare()
        protocol = witness.read_record(self.folder / 'protocol.json')
        self.assertEqual(protocol['nonce'], self.nonce)
        self.assertIs(protocol['mockOnly'], True)
        self.assertEqual(protocol['childMembership']['cgroup'], '0::' + self.descriptor['controlGroup'])
        self.assertEqual(protocol['childMembership']['identity']['uid'], 1000)
        report = protocol['report']
        self.assertTrue(report['directChildReaped'])
        self.assertEqual(report['readerEof'], {'stdout': True, 'stderr': True})
        self.assertEqual(report['cleanupErrors'], [])
        self.assertFalse(report['spawnUncertain'])
        self.assertEqual(report['returnCode'], 0)
        self.assertEqual(report['signals'], [])
        self.assertTrue(all(write['state'] == 'locally-drained' for write in report['writes']))
        stderr = base64.b64decode(protocol['rawBase64']['stderr'], validate=True)
        if mode == 'valid':
            self.assertTrue(protocol['accepted'])
            self.assertIsNone(protocol['handshakeFault'])
            self.assertIsNone(report['fault'])
            self.assertEqual(len(report['writes']), 2)
            self.assertEqual(stderr, b'initialized-notification-observed\n')
        else:
            self.assertFalse(protocol['accepted'])
            self.assertEqual(protocol['handshakeFault'], 'uncorrelated-or-error-response')
            self.assertEqual(report['fault'], 'uncorrelated-or-error-response')
            self.assertEqual(len(report['writes']), 1)
            self.assertEqual(stderr, b'')
        started = time.monotonic()
        if crash:
            signal.pidfd_send_signal(owned[0][0], signal.SIGKILL)
        else:
            (self.folder / 'release-main').write_text('release')
        self.finish('main-crash' if crash else 'normal-main-exit', owned, cgroup, started)
        record = witness.OBSERVATIONS[-1]
        record['case'] = mode + ('-crash' if crash else '-exit')
        record['protocol'] = protocol

    def test_valid_protocol_then_normal_worker_exit(self):
        self.exercise('valid', False)

    def test_valid_protocol_then_worker_crash(self):
        self.exercise('valid', True)

    def test_foreign_response_suppresses_notification_then_cleanup(self):
        self.exercise('foreign', False)


if __name__ == '__main__':
    if os.getuid() != 1000:
        raise ValueError('expected-non-root-uid1000')
    log = io.StringIO()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(ManagedTransportTests))
    print(json.dumps({'testCount': tests.testsRun, 'passed': tests.wasSuccessful(),
        'systemdVersion': witness.service.command(['/usr/bin/systemd-run', '--version'])['stdout'],
        'log': log.getvalue(), 'observations': witness.OBSERVATIONS}))
    raise SystemExit(0 if tests.wasSuccessful() else 1)
