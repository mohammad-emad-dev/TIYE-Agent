"""Three actual Windows/Ubuntu compositions plus strict fixture reply refusals."""
import asyncio
import json
import unittest
import zlib

from bindings import composition
from case import ObservedRun
import linux_runtime
import build

OBSERVATIONS = []
PRIVATE_RUNS = []
RETAINED = []


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.session = None

    def tearDown(self):
        if self.session is not None:
            try:
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop, self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self, mode):
        self.session = ObservedRun(mode)
        self.session.launch_ack.set()
        selected = self.loop.run_until_complete(self.session.execute())
        case = self.session.case
        PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
            'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)})
        OBSERVATIONS.append(selected)
        self.assertTrue(selected['startupObserverVerified'])
        self.assertTrue(selected['initializeResponseVerified'])
        self.assertFalse(selected['initializedPeerReceiptEstablished'])
        self.assertFalse(selected['candidateExecuted'])
        self.assertFalse(selected['nativeAdmissionGranted'])
        return selected

    def test_owner_exit_requires_startup_observer_and_owned_cleanup(self):
        selected = self.execute('owner-exit')
        self.assertEqual(selected['outcome'], 'cleanup-observed')

    def test_stall_requires_lease_expiry_and_startup_observer(self):
        selected = self.execute('stall')
        self.assertEqual(selected['outcome'], 'cleanup-observed')
        self.assertTrue(self.session.witness['leaseExpiredBeforeWindowsDeadline'])

    def test_guardian_loss_keeps_job_unknown_despite_observer_success(self):
        selected = self.execute('guardian-loss')
        self.assertEqual(selected['outcome'], 'unknown')
        self.assertFalse(selected['cleanupVerified'])
        self.assertIsNone(self.session.witness['windowsJobEmpty'])


class ReplyTests(unittest.TestCase):
    def test_invalid_reply_never_qualifies_fixture_initialize(self):
        validate = linux_runtime.NS['validate_init_reply']
        valid = {'id': 1, 'result': {'codexHome': '/private/fresh', 'platformFamily': 'unix',
                 'platformOs': 'linux', 'userAgent': 'tiye-fixed-synthetic-fixture'}}
        validate(json.dumps(valid).encode(), '/private/fresh')
        invalid = [json.dumps(valid | {'id': identity}).encode() for identity in (True, 1.0, 2)]
        invalid += [json.dumps(valid | {'error': {}}).encode(),
                    json.dumps(valid).replace('"id": 1', '"id": 1,"id": 1').encode(),
                    json.dumps(valid).encode('utf-16'), b'{"id":NaN}',
                    json.dumps(valid | {'result': valid['result'] | {'codexHome': '/stale'}}).encode()]
        for payload in invalid:
            with self.subTest(payload=payload):
                with self.assertRaises((ValueError, UnicodeError)):
                    validate(payload, '/private/fresh')


class CompositionTests(unittest.TestCase):
    def test_decompression_refuses_overflow_truncation_trailing_bytes_and_wrong_schema(self):
        parts = {name: path.read_text(encoding='utf-8') for name, path in build.COMPONENTS.items()}
        packed = zlib.compress(json.dumps(parts).encode())
        self.assertEqual(build.decode_sources(packed), parts)
        invalid = [zlib.compress(b'x' * 131073), packed[:-1], packed + b'trailing',
                   zlib.compress(json.dumps({'legacy': 'unbound'}).encode())]
        for payload in invalid:
            with self.subTest(length=len(payload)):
                with self.assertRaises((ValueError, zlib.error)):
                    build.decode_sources(payload)
        self.assertEqual((composition.SOURCE / 'linux_runtime.py').read_bytes(), build.generated())
