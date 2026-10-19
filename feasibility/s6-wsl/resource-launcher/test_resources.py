"""Real protected files; short/error writes injected only at the OS boundary."""
import asyncio
import errno
import os
import time
import unittest
from unittest.mock import patch

from deadlines import PhaseClock
from launcher import SyntheticRun
from resources import BudgetCapture, MetadataFiles, policy, writer

OBSERVATIONS = []
PRIVATE_RUNS = []


class PersistenceTests(unittest.TestCase):
    def allocate(self):
        budget = policy.MetadataBudget()
        capture = BudgetCapture(budget)
        self.addCleanup(capture.close)
        files = MetadataFiles(capture, budget)
        self.addCleanup(files.close)
        return budget, capture, files

    def test_all_metadata_owners_charge_and_final_inventory_matches(self):
        budget, capture, files = self.allocate()
        self.assertEqual(budget.snapshot()['stream'], (capture.path / 'retention.json').stat().st_size)
        files.write('controller', 'attempt.json', b'{}')
        files.write('observer', 'stdout.bin', b'observed')
        capture.feed('stdout', b'raw\n')
        capture.eof('stdout')
        capture.eof('stderr')
        capture.finish()
        sizes = files.audit()
        self.assertEqual(sizes, budget.snapshot())
        self.assertLess(sum(sizes.values()), policy.TOTAL - policy.RESERVED)
        with self.assertRaises(ValueError):
            files.write('controller', 'attempt.json', b'late')
        with self.assertRaises(PermissionError):
            with (capture.storage.path / 'observer/stdout.bin').open('ab'):
                pass

    def test_exact_owner_cap_then_extra_byte_leaves_file_unchanged(self):
        budget, capture, files = self.allocate()
        # Boundary cases: exact allocation and one byte beyond it.
        for _ in range(policy.ALLOCATIONS['observer'] // writer.CHUNK):
            files.write('observer', 'stdout.bin', b'x' * writer.CHUNK)
        with self.assertRaisesRegex(ValueError, 'allocation-exhausted'):
            files.write('observer', 'stdout.bin', b'!')
        self.assertEqual((capture.storage.path / 'observer/stdout.bin').stat().st_size,
                         policy.ALLOCATIONS['observer'])
        self.assertEqual(budget.snapshot()['observer'], policy.ALLOCATIONS['observer'])
        self.assertEqual(budget.snapshot()['controller'], 0)

    def test_short_and_uncertain_writes_never_refund(self):
        for kind in ('short', 'error'):
            with self.subTest(kind=kind):
                budget, capture, files = self.allocate()
                actual_write = os.write
                def fail_write(fd, payload):
                    if kind == 'error':
                        raise OSError(errno.ENOSPC, 'injected-only')
                    return actual_write(fd, payload[:3])
                with patch('resources.os.write', side_effect=fail_write):
                    with self.assertRaises(OSError):
                        files.write('controller', 'attempt.json', b'123456789')
                self.assertEqual(budget.snapshot()['controller'], 9)
                self.assertEqual((capture.storage.path / 'controller/attempt.json').stat().st_size,
                                 3 if kind == 'short' else 0)
                files.write('controller', 'outcome.json', b'failed')
                self.assertEqual(budget.snapshot()['controller'], 15)

    def test_stream_retention_charge_refuses_before_allocation_write(self):
        budget = policy.MetadataBudget()
        budget.charge('stream', policy.ALLOCATIONS['stream'])
        with self.assertRaisesRegex(ValueError, 'allocation-exhausted'):
            BudgetCapture(budget)
        self.assertEqual(budget.snapshot()['stream'], policy.ALLOCATIONS['stream'])

    def test_completion_metadata_cannot_bypass_stream_allocation(self):
        budget, capture, _ = self.allocate()
        budget.charge('stream', policy.ALLOCATIONS['stream'] - budget.snapshot()['stream'])
        capture.eof('stdout')
        capture.eof('stderr')
        with self.assertRaisesRegex(ValueError, 'allocation-exhausted'):
            capture.finish()
        self.assertFalse(capture.completed)
        self.assertFalse((capture.path / 'completion.json').exists())
        self.assertEqual(budget.snapshot()['stream'], policy.ALLOCATIONS['stream'])

    def test_inventory_and_content_drift_refuse_final_audit(self):
        for kind in ('extra', 'content'):
            with self.subTest(kind=kind):
                _, capture, files = self.allocate()
                files.write('observer', 'stdout.bin', b'original')
                if kind == 'extra':
                    (capture.storage.path / 'observer/extra').write_bytes(b'fixture')
                else:
                    fd = files.fds['observer', 'stdout.bin']
                    os.lseek(fd, 0, os.SEEK_SET)
                    os.write(fd, b'changed!')
                with self.assertRaises(ValueError):
                    files.audit()


class DeadlineTests(unittest.IsolatedAsyncioTestCase):
    async def test_quota_fault_revokes_future_spawns_and_raw_persistence(self):
        run = SyntheticRun('valid')
        try:
            run.clock.schedule = policy.NativeSchedule(time.monotonic() - 100)
            run.clock.enter('host-start')
            with self.assertRaisesRegex(ValueError, 'spawn-revoked-expired'):
                await run.spawn('observer')
            run.budget.charge('observer', policy.ALLOCATIONS['observer'])
            run.persist_diagnostic('stdout', b'rejected')
            self.assertEqual(run.fault, 'diagnostic-persistence-fault')
            with self.assertRaisesRegex(ValueError, 'spawn-revoked'):
                await run.spawn('protocol')
            await run.initialize()
            run.capture.feed('stdout', b'late\n')
            self.assertEqual(run.children, {})
            self.assertEqual((run.capture.path / 'stdout.bin').stat().st_size, 0)
            self.assertEqual(run.capture.snapshot()['streams']['stdout']['discarded'], 5)
            self.assertEqual(run.clock.schedule.phase, 'host-start')
        finally:
            run.files.close()
            run.capture.close()

    async def test_expired_window_does_not_run_or_cancel_pending_task(self):
        clock = PhaseClock()
        clock.schedule = policy.NativeSchedule(time.monotonic() - 100)
        clock.enter('host-start')
        event = asyncio.Event()
        task = asyncio.create_task(event.wait())
        done, pending = await clock.wait({task})
        self.assertEqual(done, set())
        self.assertEqual(pending, {task})
        self.assertFalse(task.done())
        event.set()
        await task


class LauncherTests(unittest.TestCase):
    def execute(self, scenario):
        async def execute():
            run = SyntheticRun(scenario)
            PRIVATE_RUNS.append({'scenario': scenario, 'path': str(run.capture.storage.path)})
            try:
                result = await run.run()
                PRIVATE_RUNS[-1]['result'] = result
                self.assertTrue(result['directChildrenReapedAndPipesDrained'])
                self.assertTrue(result['workRevoked'])
                self.assertFalse(result['nativeExecutionAllowed'])
                self.assertFalse(result['processTreeQualified'])
                self.assertLess(result['elapsedSeconds'], 90)
                for owner, size in result['finalMetadataBytes'].items():
                    self.assertLessEqual(size, result['chargedMetadataBytes'][owner])
                    self.assertLessEqual(result['chargedMetadataBytes'][owner], policy.ALLOCATIONS[owner])
                OBSERVATIONS.append({'scenario': scenario, 'verified': True,
                                     'fault': result['fault'], 'storageCompleted': result['storageCompleted'],
                                     'directChildrenReapedAndPipesDrained': True,
                                     'nativeExecutionAllowed': False})
                return result
            finally:
                # Harness rescue is separate from, and earns no measured cleanup credit.
                for child in run.children.values():
                    if child.returncode is None:
                        child.kill()
                        await asyncio.wait_for(child.wait(), 5)
        return asyncio.run(execute())

    def test_valid_children_complete_storage_with_shared_charges(self):
        result = self.execute('valid')
        self.assertIsNone(result['fault'])
        self.assertTrue(result['storageCompleted'])
        self.assertEqual(result['signals'], [])
        self.assertEqual([row['phase'] for row in result['phases']],
                         ['host-start', 'child-start', 'initialize', 'eof', 'observe'])

    def test_diagnostic_overflow_faults_and_reaps_without_completion(self):
        result = self.execute('overflow')
        self.assertEqual(result['fault'], 'diagnostic-persistence-fault')
        self.assertFalse(result['storageCompleted'])
        self.assertLessEqual(result['chargedMetadataBytes']['observer'], policy.ALLOCATIONS['observer'])

    def test_work_timeout_revokes_then_terminates_direct_child(self):
        result = self.execute('timeout')
        self.assertEqual(result['fault'], 'initialize-expired')
        self.assertFalse(result['storageCompleted'])
        self.assertEqual(result['signals'], [{'role': 'protocol', 'phase': 'term'}])
        self.assertEqual([row['phase'] for row in result['phases']],
                         ['host-start', 'child-start', 'initialize', 'eof', 'term', 'observe'])


if __name__ == '__main__':
    unittest.main()
