"""Real Windows jobs, process handles and protected files; no provider execution."""
import os
import unittest

import composition
from control import ControlRecords, PublicationPending, parameters
from integration import Collector
from resources import writer

OBSERVATIONS = []
PRIVATE_RUNS = []


class AllocationTests(unittest.TestCase):
    def test_live_publisher_retries_only_until_exclusive_handle_closes(self):
        # Regression: 19 Oct sharing error turned explicit owner exit into deadline cleanup.
        storage = writer.store.create_store()
        self.addCleanup(storage.close)
        budget = composition.LeaseBudget('worker')
        controls = ControlRecords(storage, budget, 'a' * 32)
        payload = writer.encode({'nonce': 'a' * 32, 'composition': composition.fingerprint()})
        budget.charge('controller', len(payload))
        handle = writer.winacl.create_file(storage.path / 'ready.json', storage.owner)
        fd, _ = writer.store.verified_descriptor(handle, storage.owner, os.O_BINARY | os.O_RDWR)
        try:
            os.write(fd, payload)
            with self.assertRaises(PublicationPending):
                controls.read('ready.json')
        finally:
            os.close(fd)
        self.assertEqual(controls.read('ready.json')['nonce'], 'a' * 32)

    def test_disjoint_roles_cannot_borrow_reserved_or_each_others_bytes(self):
        for owner, cap in composition.policy.ALLOCATIONS.items():
            self.assertEqual(sum(role[owner] for role in composition.SLICES.values()), cap)
        for role, limits in composition.SLICES.items():
            budget = composition.LeaseBudget(role)
            self.assertEqual(budget.snapshot(), dict.fromkeys(limits, 0))
            for owner, limit in limits.items():
                budget.charge(owner, limit)
                with self.assertRaises(ValueError):
                    budget.charge(owner, 1)
            with self.assertRaises(ValueError):
                budget.charge('reserved', 1)
            self.assertEqual(budget.snapshot(), limits)

    def test_control_records_charge_owner_and_refuse_second_publication(self):
        storage = writer.store.create_store()
        self.addCleanup(storage.close)
        for role, name in (('worker', 'intent.json'), ('collector', 'release.json')):
            budget = composition.LeaseBudget(role)
            control = ControlRecords(storage, budget, 'a' * 32)
            control.write(name, {'fixture': 'synthetic'})
            size = (storage.path / name).stat().st_size
            self.assertEqual(budget.snapshot()['controller'], size)
            with self.assertRaises(OSError):
                control.write(name, {'fixture': 'synthetic'})
            self.assertEqual(budget.snapshot()['controller'], 2 * size)
            self.assertEqual((storage.path / name).stat().st_size, size)
            with self.assertRaisesRegex(ValueError, 'control-binding'):
                ControlRecords(storage, budget, 'b' * 32).read(name)
            with self.assertRaises(ValueError):
                control.write('foreign.json', {})

    def test_stale_composition_refuses_before_child_creation(self):
        for mode, nonce, binding in (('stall', 'a' * 32, '0' * 64),
                                     ('native', 'a' * 32, composition.fingerprint()),
                                     ('valid', 'not-a-nonce', composition.fingerprint())):
            with self.subTest(mode=mode, nonce=nonce):
                with self.assertRaises(ValueError):
                    parameters(mode, nonce, binding)


class WatchdogTests(unittest.TestCase):
    def execute(self, mode):
        collector = Collector(mode)
        PRIVATE_RUNS.append({'mode': mode, 'collector': str(collector.capture.storage.path),
                             'workerControl': str(collector.control_storage.path)})
        report = collector.execute()
        OBSERVATIONS.append(report)
        self.assertTrue(report['verified'])
        self.assertFalse(report['nativeExecutionAllowed'])
        return report

    def test_valid_worker_completes_under_job(self):
        report = self.execute('valid')
        self.assertTrue(report['workerStorageCompleted'])
        self.assertTrue(report['windowsJobEmpty'])
        self.assertFalse(report['workerEvidenceUncertain'])

    def test_blocked_event_loop_and_protocol_descendant_stop_at_deadline(self):
        report = self.execute('stall')
        self.assertTrue(report['guardianReported'])
        self.assertTrue(report['heldRootAndProtocolSignaled'])
        self.assertTrue(report['unrelatedSentinelSurvived'])
        self.assertTrue(report['workerEvidenceUncertain'])

    def test_owner_exit_reaps_protocol_descendant_before_deadline(self):
        report = self.execute('owner-exit')
        self.assertTrue(report['windowsJobEmpty'])
        self.assertTrue(report['heldRootAndProtocolSignaled'])
        self.assertTrue(report['unrelatedSentinelSurvived'])

    def test_guardian_loss_signals_held_processes_without_forging_job_report(self):
        report = self.execute('guardian-loss')
        self.assertFalse(report['guardianReported'])
        self.assertIsNone(report['windowsJobEmpty'])
        self.assertTrue(report['heldRootAndProtocolSignaled'])
        self.assertTrue(report['unrelatedSentinelSurvived'])
        self.assertFalse(report['workerStorageCompleted'])


if __name__ == '__main__':
    unittest.main()
