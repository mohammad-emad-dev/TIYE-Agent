"""Saved manifests do not grant native or durable recovery admission."""
import copy
import json
import unittest

import run


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.evidence = json.loads((run.OUT / 'evidence.json').read_text())
        self.observations = json.loads((run.OUT / 'observations.json').read_text())

    def test_source_and_reference_changes_are_refused(self):
        run.validate(self.evidence, self.observations)
        for section in ('sources', 'references', 'artifacts'):
            with self.subTest(section=section):
                changed = copy.deepcopy(self.evidence)
                changed[section][next(iter(changed[section]))] = '0' * 64
                with self.assertRaises(ValueError):
                    run.validate(changed, self.observations)

    def test_promoted_scope_or_extra_private_fields_are_refused(self):
        for field in ('nativeExecutionAllowed', 'liveCrossOsScheduleQualified', 'durableRecoveryQualified'):
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    run.validate(self.evidence, dict(self.observations, **{field: True}))
        with self.assertRaises(ValueError):
            run.validate(self.evidence, dict(self.observations, privatePid=42))
