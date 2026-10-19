"""Pure lease/budget checks and real Windows/Ubuntu cleanup witnesses."""
import json
from pathlib import Path
import tempfile
import unittest

import composition
import linux_runtime
from cohort import WSLCase

OBSERVATIONS = []
PRIVATE_RUNS = []


class ContractTests(unittest.TestCase):
    def test_removed_cgroup_events_require_empty_or_removed_owned_directory(self):
        # 19 Oct regression: a real cgroup vanished between exists() and read_text().
        # Temporary files cover the disappearance boundary; live tests use real cgroups.
        with tempfile.TemporaryDirectory(prefix='tiye-cgroup-boundary-') as temporary:
            cgroup = Path(temporary) / 'owned-cgroup'
            cgroup.mkdir()
            events = cgroup / 'cgroup.events'
            events.write_text('populated 1\n')
            self.assertFalse(linux_runtime.cgroup_empty(cgroup))
            events.write_text('populated 0\n')
            self.assertTrue(linux_runtime.cgroup_empty(cgroup))
            events.unlink()
            self.assertFalse(linux_runtime.cgroup_empty(cgroup))
            cgroup.rmdir()
            self.assertTrue(linux_runtime.cgroup_empty(cgroup))

    def test_linux_slices_refuse_reserved_unknown_and_excess_charges(self):
        self.assertEqual(sum(linux_runtime.CAPS.values()) + linux_runtime.RESERVED, 131072)
        for role, cap in linux_runtime.CAPS.items():
            ledger = linux_runtime.Ledger(role)
            ledger.charge(cap)
            for size in (1, True, -1):
                with self.subTest(role=role, size=size):
                    with self.assertRaises(ValueError):
                        ledger.charge(size)
            self.assertEqual(ledger.used, cap)
        with self.assertRaises(ValueError):
            linux_runtime.Ledger('reserved')

    def test_heartbeat_identity_sequence_and_duplicate_keys_fail_closed(self):
        nonce = 'a' * 32
        self.assertEqual(linux_runtime.heartbeat(json.dumps({'nonce': nonce, 'sequence': 1}), nonce, 0), 1)
        packets = [json.dumps({'nonce': nonce, 'sequence': step}) for step in (True, 0, 2)]
        packets += [json.dumps({'nonce': 'b' * 32, 'sequence': 1}),
                    '{"nonce":"' + nonce + '","sequence":1,"sequence":1}',
                    '{"nonce":"' + nonce + '","sequence":NaN}']
        for packet in packets:
            with self.subTest(packet=packet):
                with self.assertRaises(ValueError):
                    linux_runtime.heartbeat(packet, nonce, 0)


class LiveTests(unittest.TestCase):
    def execute(self, mode):
        case = WSLCase(mode)
        PRIVATE_RUNS.append({'mode': mode, 'collector': str(case.capture.storage.path),
            'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)})
        report = case.execute()
        OBSERVATIONS.append(report)
        self.assertTrue(report['linuxPidfdsSignaled'])
        self.assertTrue(report['linuxCgroupEmpty'])
        self.assertTrue(report['linuxSentinelSurvived'])
        self.assertTrue(report['workerEvidenceUncertain'])
        self.assertFalse(report['nativeExecutionAllowed'])
        return report

    def test_owner_exit_stops_linux_unit_after_windows_job_cleanup(self):
        report = self.execute('owner-exit')
        self.assertTrue(report['windowsHeldProcessesSignaled'])
        self.assertTrue(report['windowsJobEmpty'])

    def test_guardian_loss_requires_linux_witness_without_job_empty_claim(self):
        report = self.execute('guardian-loss')
        self.assertTrue(report['windowsHeldProcessesSignaled'])
        self.assertIsNone(report['windowsJobEmpty'])

    def test_heartbeat_stall_expires_linux_before_windows_watchdog(self):
        report = self.execute('stall')
        self.assertTrue(report['leaseExpiredBeforeWindowsDeadline'])
        self.assertEqual(report['leaseReason'], 'expired')


if __name__ == '__main__':
    unittest.main()
