"""Adversarial plan/integrity tests; no WSL, provider, or launcher processes."""
import copy
import tempfile
import unittest
from pathlib import Path

import check


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.plan = check.load(check.ROOT / check.OUTPUT / 'contract.json')

    def test_frozen_plan_cannot_grant_execution(self):
        result = check.check()
        self.assertIs(result['nativeExecutionAllowed'], False)
        self.assertIs(result['nativeAdmissionGranted'], False)
        self.assertEqual(result['phase1'], 'HOLD')

    def test_security_and_scope_mutations_refused(self):
        changes = [
            ('nativeExecutionAllowed', True), ('nativeAdmissionGranted', True),
            ('provider.productRouteEligible', True),
            ('provider.u0RequiresProductRouteEligibility', True),
            ('provider.authenticatedCasesRequireProductRouteEligibility', False),
            ('candidate.currentIdentityRechecked', True),
            ('environment.inheritEnvironment', True),
            ('environment.copyCachedCredentialsOrConfig', True),
            ('u0.attempts', True), ('u0.retries', 1),
            ('u0.packets', [{'method': 'account/login/start'}]),
            ('capture.writerStatus', 'qualified'),
            ('capture.windowsCaptureTotalBytes', 98304),
            ('deadlines.overallSeconds', 120), ('deadlines.workCutoffSeconds', True),
            ('laterT0.status', 'admitted'),
            ('laterT0.attempts', True),
        ]
        for dotted, value in changes:
            with self.subTest(field=dotted):
                changed = copy.deepcopy(self.plan)
                target = changed
                keys = dotted.split('.')
                for key in keys[:-1]:
                    target = target[key]
                target[keys[-1]] = value
                with self.assertRaises(ValueError):
                    check.validate_plan(changed)

    def test_json_ambiguity_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'ambiguous.json'
            for payload in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}'):
                with self.subTest(payload=payload):
                    path.write_text(payload, encoding='utf-8')
                    with self.assertRaises(ValueError):
                        check.load(path)

    def test_path_redirection_refused(self):
        for name in ('../outside', '/absolute', 'C:/absolute', 'a\\b', 'a/../b', './a'):
            with self.subTest(path=name), self.assertRaises(ValueError):
                check.bound_path(check.ROOT, name)

    def test_saved_content_drift_refused(self):
        index = check.load(check.ROOT / check.OUTPUT / 'index.json')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in [*index['bindings'], check.OUTPUT + '/index.json']:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((check.ROOT / name).read_bytes())
            self.assertIs(check.check(root)['nativeExecutionAllowed'], False)
            victim = root / 'output/s4-codex-native-protocol/README.md'
            victim.write_bytes(victim.read_bytes() + b'\nchanged\n')
            with self.assertRaisesRegex(ValueError, 'changed-bound-file'):
                check.check(root)


if __name__ == '__main__':
    unittest.main()
