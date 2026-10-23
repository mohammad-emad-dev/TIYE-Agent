"""Presentation cannot promote historical evidence or confer execution rights."""
import itertools
import unittest

from policy import DOMAINS,observation_from_record,recovery_decision
from saved import saved_decisions,verified_saved_record

BASE={'provenance':'current-bound','authority':'original-observer','keeper':'live','observer':'live',
    'inspector':'not-enrolled','custody':'verified-held','terminal':'absent','receipt':'invalid','copy':'none'}
CASES=[
    ('original',{},'held-original'),
    ('inspector',{'authority':'pinned-inspector','observer':'ended','inspector':'live'},'held-inspector'),
    ('historical',{'provenance':'historical','authority':'none'},'historical-only'),
    ('holder-ended',{'keeper':'ended','custody':'unconfirmed','authority':'none'},'holder-ended'),
    ('reader-ended',{'observer':'ended','inspector':'ended','custody':'unconfirmed','authority':'none'},'reader-ended'),
    ('no-owner',{'authority':'none','custody':'unconfirmed','observer':'unconfirmed'},'authority-unconfirmed'),
]
PERMISSIONS=('cleanupVerified','exportExecutionAllowed','automaticRetryAllowed','automaticDeletionAllowed',
    'automaticReleaseAllowed','inspectorReplacementAllowed','nativeExecutionAllowed')


class PolicyTests(unittest.TestCase):
    def test_each_recovery_situation_has_a_distinct_user_next_step(self):
        steps=set()
        for name,changes,expected in CASES:
            with self.subTest(case=name):
                decision=recovery_decision(observation_from_record(BASE|changes))
                self.assertEqual(decision['status'],expected)
                self.assertTrue(decision['title'])
                steps.add(decision['suggestedNextStep'])
        self.assertEqual(len(steps),len(CASES))

    def test_receipt_terminal_and_fixture_copy_never_promote_custody_or_execution(self):
        for name,changes,expected in CASES:
            for terminal,receipt,copy in itertools.product(DOMAINS['terminal'],DOMAINS['receipt'],DOMAINS['copy']):
                with self.subTest(case=name,terminal=terminal,receipt=receipt,copy=copy):
                    decision=recovery_decision(observation_from_record(BASE|changes|
                        {'terminal':terminal,'receipt':receipt,'copy':copy}))
                    self.assertEqual(decision['status'],expected)
                    self.assertEqual(decision['commands'],[])
                    self.assertEqual(decision['outcome'],'unknown')
                    for permission in PERMISSIONS:
                        self.assertIs(decision[permission],False)
                    self.assertEqual(decision['observedEvidence']['receipt'],receipt)
                    self.assertEqual(decision['observedEvidence']['copy'],copy)

    def test_contradictory_authority_and_holder_claims_are_refused(self):
        invalid=[{'provenance':'historical'}, {'keeper':'ended'}, {'authority':'none'},
            {'observer':'ended'}, {'authority':'pinned-inspector'},
            {'authority':'pinned-inspector','observer':'ended','inspector':'ended'},
            {'custody':'unconfirmed'}]
        for changes in invalid:
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError):
                    observation_from_record(BASE|changes)

    def test_untrusted_schema_cannot_inject_permissions_paths_or_unknown_states(self):
        for field in DOMAINS:
            for invalid in (True,None,{},'unsupported'):
                with self.subTest(field=field,invalid=invalid):
                    with self.assertRaises(ValueError):
                        observation_from_record(BASE|{field:invalid})
        for extra in ('exportExecutionAllowed','destination','pid','nativeExecutionAllowed'):
            with self.subTest(extra=extra):
                with self.assertRaises(ValueError):
                    observation_from_record(BASE|{extra:True})
        with self.assertRaises(TypeError):
            recovery_decision(BASE)

    def test_sealed_saved_observations_are_always_historical(self):
        decisions=saved_decisions(verified_saved_record())
        self.assertEqual(len(decisions),6)
        for row in decisions:
            decision=row['decision']
            self.assertEqual(decision['provenance'],'historical')
            self.assertEqual(decision['status'],'historical-only')
            self.assertEqual(decision['commands'],[])
            self.assertIs(decision['exportExecutionAllowed'],False)
            self.assertNotIn('pid',decision)


if __name__=='__main__':
    unittest.main()
