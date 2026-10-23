"""A live-only inspector observes custody after actual targeted observer loss."""
import asyncio
import unittest

from case import InspectorRun,validate_inspection

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
        self.assertEqual(observed['keeperOwnership'],'inspected-held')
        self.assertTrue(observed['standbyInspectionVerified'])
        with self.assertRaisesRegex(RuntimeError,'^inspector-holder-unsettled-retain-handles$'):
            self.session.case.close_settled()
        self.assertIsNone(self.session.case.recovery.poll())
        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
        after=self.session.summary()
        self.assertFalse(after['cleanupVerified'])
        self.assertFalse(after['automaticReleaseAllowed'])
        self.assertEqual(after['keeperOwnership'],'disposed-fixed-fixture')
        self.assertFalse(self.session.coordinator.accept_cleanup(self.session.witness))
        OBSERVATIONS.append({'beforeObserverLoss':before,'observed':observed,'afterExplicitFixtureDisposal':after})
        return observed

    def test_missing_terminal_custody_survives_original_observer_loss(self):
        self.assertTrue(self.execute('missing')['retentionReceiptVerified'])

    def test_blocked_receipt_custody_survives_loss_without_receipt_credit(self):
        self.assertFalse(self.execute('receipt-blocked')['retentionReceiptVerified'])


class BoundaryTests(unittest.TestCase):
    def test_standby_report_cannot_replace_identity_or_promote_authority(self):
        ready={'startup':{'nonce':'a'*32},'observerProcess':{'pid':1}}
        original={'manifestSha256':'b'*64,'receiptSha256':None}
        inspector={'pid':2}
        report={'event':'killed','nonce':'a'*32,'observer':{'pid':1},'identity':inspector,
            'keeperAlive':True,'earlyInspectionRefused':True,'foreignInspectionRefused':True,'releaseRefused':True,
            'replacementRefused':True,'outcome':'unknown','copyVerified':False,'manifestSha256':'b'*64,
            'receiptSha256':None,'socketPidfdVerified':True,'inspectorPersistence':'keeper-memory-only','nativeExecutionAllowed':False}
        validate_inspection(report,ready,original,inspector)
        for field,value in [('identity',{'pid':3}),('copyVerified',True),('nativeExecutionAllowed',True),
                ('socketPidfdVerified',1),('receiptSha256','c'*64),('inspectorPersistence','durable'),
                ('foreignInspectionRefused',False),('replacementRefused',False)]:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    validate_inspection(report|{field:value},ready,original,inspector)

    def test_inspection_requires_a_settled_unknown_result(self):
        loop=asyncio.new_event_loop()
        try:
            with self.assertRaisesRegex(RuntimeError,'^inspector-before-settled-unknown$'):
                loop.run_until_complete(InspectorRun('missing').recover_after_observer_loss())
        finally:
            loop.close()
