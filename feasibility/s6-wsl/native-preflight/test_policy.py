"""Budget and clock refusal regressions; no provider, WSL or package execution."""
from concurrent.futures import ThreadPoolExecutor
import unittest

import policy


class PolicyTests(unittest.TestCase):
    def test_all_producers_and_reserved_bytes_do_not_exceed_total(self):
        budget = policy.MetadataBudget()
        for owner, limit in policy.ALLOCATIONS.items():
            budget.charge(owner, limit)
            with self.assertRaises(ValueError):
                budget.charge(owner, 1)
        self.assertEqual(sum(budget.snapshot().values()) + policy.RESERVED, policy.TOTAL)
        policy.audit_metadata_sizes(budget.snapshot())
        with self.assertRaises(ValueError):
            budget.charge('reserve', 1)
        oversized = budget.snapshot()
        oversized['stream'] += 1
        with self.assertRaises(ValueError):
            policy.audit_metadata_sizes(oversized)

    def test_uncertain_attempt_and_replacement_are_not_refunded(self):
        budget = policy.MetadataBudget()
        budget.charge('stream', 65536)
        # Failed/partial writes have no rollback API; replacement charges again.
        budget.charge('stream', 65536)
        with self.assertRaises(ValueError):
            budget.charge('stream', 1)

    def test_concurrent_charges_cannot_overbook(self):
        budget = policy.MetadataBudget()
        def charge(_worker):
            accepted = 0
            for _ in range(128):
                try:
                    budget.charge('controller', 2048)
                    accepted += 1
                except ValueError:
                    pass
            return accepted
        with ThreadPoolExecutor(max_workers=8) as pool:
            accepted = sum(pool.map(charge, range(8)))
        self.assertEqual(accepted * 2048, policy.ALLOCATIONS['controller'])
        self.assertEqual(budget.snapshot()['controller'], accepted * 2048)

    def test_boolean_negative_and_unknown_charge_refused(self):
        for owner, size in (('stream', True), ('stream', -1), ('stream', 0.5), ('unknown', 1)):
            with self.subTest(owner=owner, size=size), self.assertRaises(ValueError):
                policy.MetadataBudget().charge(owner, size)

    def test_phase_caps_and_one_overall_deadline(self):
        clock = policy.NativeSchedule(100)
        self.assertEqual(clock.enter('host-start', 100), 30)
        self.assertEqual(clock.enter('child-start', 130), 15)
        self.assertEqual(clock.enter('initialize', 145), 15)
        self.assertEqual(clock.enter('eof', 160), 5)
        self.assertEqual(clock.enter('term', 165), 5)
        self.assertEqual(clock.enter('kill', 170), 5)
        self.assertEqual(clock.enter('observe', 175), 15)
        self.assertEqual(clock.remaining(190), 0)

    def test_early_fault_starts_15_second_cleanup_without_restoring_work(self):
        clock = policy.NativeSchedule(0)
        clock.enter('host-start', 0)
        clock.enter('eof', 2)
        clock.enter('term', 7)
        clock.enter('kill', 12)
        self.assertEqual(clock.remaining(17), 0)
        with self.assertRaises(ValueError):
            clock.enter('initialize', 17)

    def test_late_cleanup_is_clipped_and_expired_work_cannot_advance(self):
        clock = policy.NativeSchedule(0)
        clock.enter('host-start', 0)
        with self.assertRaises(TimeoutError):
            clock.enter('child-start', 31)
        self.assertEqual(clock.enter('eof', 74), 1)
        self.assertEqual(clock.enter('term', 75), 0)
        self.assertEqual(clock.enter('kill', 80), 0)
        self.assertEqual(clock.enter('observe', 89), 1)
        self.assertEqual(clock.remaining(90), 0)

    def test_clock_regression_nonfinite_and_phase_reentry_refused(self):
        for value in (True, float('nan'), float('inf')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                policy.NativeSchedule(value)
        clock = policy.NativeSchedule(10)
        clock.enter('host-start', 10)
        with self.assertRaises(ValueError):
            clock.remaining(9)
        with self.assertRaises(ValueError):
            clock.enter('host-start', 11)


if __name__ == '__main__':
    unittest.main()
