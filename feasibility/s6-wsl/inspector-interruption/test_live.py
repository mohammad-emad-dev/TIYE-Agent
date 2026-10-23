"""A live-only inspector observes custody after actual targeted observer loss."""
import asyncio
import errno
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from case import InspectorRun,validate_reconciliation

OBSERVATIONS,PRIVATE_RUNS,RETAINED=[],[],[]


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop=asyncio.new_event_loop()
        self.session=None

    def tearDown(self):
        if self.session is not None:
            try:
                case=self.session.case
                if case is not None:
                    PRIVATE_RUNS.append({'collector':str(case.capture.storage.path),
                        'linuxDiagnostics':str(case.linux_capture.storage.path),'hostControl':str(case.control_storage.path)})
                    if case.inspection_verified and not case.fixture_disposed:
                        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop,self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self,fault):
        self.session=InspectorRun(fault)
        self.session.launch_ack.set()
        before=self.loop.run_until_complete(self.session.execute())
        self.assertFalse(before['observerLossVerified'])
        self.loop.run_until_complete(self.session.recover_after_observer_loss())
        observed=self.session.summary()
        self.assertEqual(observed['outcome'],'unknown')
        self.assertFalse(observed['cleanupVerified'])
        self.assertTrue(observed['interruptionVerified'])
        self.assertTrue(observed['slotOccupied'])
        self.assertEqual(observed['standbyInspectionVerified'],fault=='unobserved-ack')
        with self.assertRaisesRegex(RuntimeError,'^inspector-holder-unsettled-retain-handles$'):
            self.session.case.close_settled()
        if fault=='unobserved-ack':
            self.assertIsNone(self.session.case.recovery.poll())
        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
        after=self.session.summary()
        self.assertFalse(after['cleanupVerified'])
        self.assertFalse(after['automaticReleaseAllowed'])
        self.assertEqual(after['keeperOwnership'],'disposed-fixed-fixture')
        self.assertFalse(self.session.coordinator.accept_cleanup(self.session.witness))
        OBSERVATIONS.append({'beforeObserverLoss':before,'observed':observed,'afterExplicitFixtureDisposal':after})
        return observed

    def test_dead_inspector_cannot_be_replaced_or_release_custody(self):
        self.assertTrue(self.execute('inspector-loss')['retentionReceiptVerified'])

    def test_unobserved_ack_keeps_slot_and_survives_observer_loss(self):
        self.assertFalse(self.execute('unobserved-ack')['retentionReceiptVerified'])


class BoundaryTests(unittest.TestCase):
    def test_retired_cgroup_read_failure_does_not_credit_a_present_directory(self):
        spec=importlib.util.spec_from_file_location('interrupted_inspector_status_test',Path(__file__).with_name('status.py'))
        status=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(status)
        with tempfile.TemporaryDirectory() as directory:
            group=Path(directory)
            self.assertFalse(status.cgroup_empty(group))
            # A kernel cgroup-retirement error is injected at the filesystem boundary.
            with patch.object(Path,'read_text',side_effect=OSError(errno.ENODEV,'retired cgroup')):
                self.assertFalse(status.cgroup_empty(group))
                self.assertTrue(status.cgroup_empty(group/'already-removed'))
                with patch.object(Path,'stat',side_effect=PermissionError(errno.EACCES,'denied')):
                    with self.assertRaises(PermissionError):
                        status.cgroup_empty(group)
            with patch.object(Path,'read_text',side_effect=PermissionError(errno.EACCES,'denied')):
                with self.assertRaises(PermissionError):
                    status.cgroup_empty(group)

    def test_enrollment_status_cannot_reset_slot_or_replace_identity(self):
        ready={'startup':{'nonce':'a'*32,'runtimeIdentity':[1,2]},'keeper':{'identity':{'pid':42}}}
        inspector={'pid':43}
        status={'event':'inspector-status','nonce':'a'*32,'keeperIdentity':{'pid':42},'mountIdentity':[1,2],
            'identity':inspector,'slotOccupied':True,'inspectorState':'ended','persistence':'keeper-memory-only',
            'replacementAllowed':False,'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
        report={'event':'result','nonce':'a'*32,'stage':'inspector-reconciled','status':status,
            'replacementRefused':True,'releaseRefused':True,'interruption':'inspector-loss'}
        validate_reconciliation(report,ready,inspector,'inspector-loss')
        for field,value in [('identity',{'pid':44}),('slotOccupied',False),('inspectorState','live'),
                ('replacementAllowed',True),('automaticReleaseAllowed',True),('nativeExecutionAllowed',True),
                ('slotOccupied',1),('persistence','durable')]:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    validate_reconciliation(report|{'status':status|{field:value}},ready,inspector,'inspector-loss')

    def test_inspection_requires_a_settled_unknown_result(self):
        loop=asyncio.new_event_loop()
        try:
            with self.assertRaisesRegex(RuntimeError,'^inspector-before-settled-unknown$'):
                loop.run_until_complete(InspectorRun('inspector-loss').recover_after_observer_loss())
        finally:
            loop.close()
