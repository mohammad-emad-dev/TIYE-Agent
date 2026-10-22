"""Four actual Windows/Ubuntu lifecycle cases, including a bound observer SIGKILL."""
import asyncio
import copy
import unittest

from case import BrokerRun, KilledObserverRun
import linux_runtime

OBSERVATIONS, PRIVATE_RUNS, RETAINED = [], [], []


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

    def execute(self, mode, run_type):
        self.session = run_type(mode)
        self.session.launch_ack.set()
        selected = self.loop.run_until_complete(self.session.execute())
        case = self.session.case
        PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
            'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)})
        OBSERVATIONS.append(selected)
        for name in ('filesystemLimitsVerified', 'retainedSnapshotVerified', 'keeperVerified', 'initializeResponseVerified'):
            self.assertTrue(selected[name])
        for name in ('initializedPeerReceiptEstablished', 'candidateExecuted', 'nativeAdmissionGranted'):
            self.assertFalse(selected[name])
        return selected

    def test_owner_exit_completes_keeper_retention_and_windows_job_cleanup(self):
        self.assertEqual(self.execute('owner-exit', BrokerRun)['outcome'], 'cleanup-observed')

    def test_stall_keeps_lease_result_before_windows_fallback(self):
        selected = self.execute('stall', BrokerRun)
        self.assertEqual(selected['outcome'], 'cleanup-observed')
        self.assertTrue(self.session.witness['leaseExpiredBeforeWindowsDeadline'])

    def test_guardian_loss_preserves_unknown_windows_job_outcome(self):
        selected = self.execute('guardian-loss', BrokerRun)
        self.assertEqual(selected['outcome'], 'unknown')
        self.assertFalse(selected['cleanupVerified'])
        self.assertIsNone(self.session.witness['windowsJobEmpty'])

    def test_bound_observer_sigkill_retains_copy_and_completes_full_cleanup(self):
        selected = self.execute('owner-exit', KilledObserverRun)
        self.assertEqual(selected['outcome'], 'cleanup-observed')
        self.assertEqual(selected['observerFault'], 'killed')


class ReceiptTests(unittest.TestCase):
    def test_mismatched_or_incomplete_receipts_cannot_earn_retention_credit(self):
        expected = {'nonce': 'a' * 32, 'identity': {'pid': 42}, 'startup': {}, 'invocation': 'b' * 32,
                    'observerLossDetected': True}
        document = {'scope': 'fixed-supervised-keeper-retained', 'nonce': expected['nonce'],
            'keeperIdentity': expected['identity'], 'startup': {}, 'invocation': expected['invocation'],
            'observerLossDetected': True, 'cleanup': {'heldPidfdsSignaled': True, 'originalProcEntriesAbsent': True,
                'cgroupEmpty': True, 'sentinelSurvived': True, 'leaseReason': 'eof', 'observationSeconds': 0.1},
            'retention': {}}
        invalid = []
        for field, replacement in [('nonce', 'c' * 32), ('keeperIdentity', {'pid': 43}),
                                   ('observerLossDetected', False)]:
            invalid.append((document | {field: replacement}, 'keeper-receipt-binding'))
        incomplete = copy.deepcopy(document)
        incomplete['cleanup']['cgroupEmpty'] = False
        invalid.append((incomplete, 'keeper-cleanup-unverified'))
        nonfinite = copy.deepcopy(document)
        nonfinite['cleanup']['observationSeconds'] = float('nan')
        invalid.append((nonfinite, 'keeper-cleanup-window'))
        for receipt, reason in invalid:
            with self.subTest(reason=reason):
                with self.assertRaisesRegex(ValueError, '^' + reason + '$'):
                    linux_runtime.NS['keeper_document'](receipt, expected)
