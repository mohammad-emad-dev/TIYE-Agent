"""Real evidence loss/corruption and receipt refusal retain unknown mount custody."""
import asyncio
import unittest

from case import UncertainRun,validate_uncertainty

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
                        'linuxDiagnostics':str(case.linux_capture.storage.path),
                        'hostControl':str(case.control_storage.path)})
                    if case.unknown_verified and not case.fixture_disposed:
                        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop,self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self,fault):
        self.session=UncertainRun(fault)
        self.session.launch_ack.set()
        before=self.loop.run_until_complete(self.session.execute())
        self.assertEqual(before['outcome'],'unknown')
        self.assertFalse(before['cleanupVerified'])
        self.assertTrue(before['custodyInventoryVerified'])
        self.assertTrue(before['duplicateClosureVerified'])
        self.assertFalse(before['linuxFinalInventoryVerified'])
        case=self.session.case
        self.assertIsNone(case.observer.poll())
        with self.assertRaisesRegex(RuntimeError,'^unknown-holder-live-retain-observer-and-handles$'):
            case.close_settled()
        self.assertIsNone(case.observer.poll())
        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
        after=self.session.summary()
        self.assertEqual(after['outcome'],'unknown')
        self.assertFalse(after['cleanupVerified'])
        self.assertEqual(after['keeperOwnership'],'disposed-fixed-fixture')
        self.assertTrue(after['fixtureDisposalVerified'])
        self.assertFalse(self.session.coordinator.accept_cleanup(self.session.witness))
        OBSERVATIONS.append({'observed':before,'afterExplicitFixtureDisposal':after})
        return before

    def test_missing_terminal_preserves_custody_with_unknown_receipt(self):
        observed=self.execute('missing')
        self.assertEqual(observed['terminalEvidence'],'absent')
        self.assertTrue(observed['retentionReceiptVerified'])

    def test_invalid_terminal_preserves_custody_with_unknown_receipt(self):
        observed=self.execute('invalid')
        self.assertEqual(observed['terminalEvidence'],'invalid')
        self.assertTrue(observed['retentionReceiptVerified'])

    def test_failed_receipt_publication_preserves_custody_without_receipt_credit(self):
        observed=self.execute('receipt-blocked')
        self.assertEqual(observed['terminalEvidence'],'invalid')
        self.assertFalse(observed['retentionReceiptVerified'])


class BoundaryTests(unittest.TestCase):
    def test_uncertain_report_cannot_promote_or_replace_custody_bindings(self):
        ready={'startup':{'nonce':'a'*32,'runtimeIdentity':[1,2]},
            'keeper':{'identity':{'pid':42}},'descriptor':{'InvocationID':'b'*32}}
        report={'event':'result','nonce':'a'*32,'stage':'held','outcome':'unknown',
            'copyVerified':False,'automaticDeletion':False,'keeperIdentity':{'pid':42},
            'mountIdentity':[1,2],'invocation':'b'*32,'receiptSha256':None,'retentionReceiptVerified':False,
            'keeperAlive':True,'workerPidfdsSignaled':True,'originalProcEntriesAbsent':True,'cgroupEmpty':True,
            'leaseReason':'unverified','evidenceFault':'receipt-blocked','terminalEvidence':'invalid',
            'manifestSha256':'c'*64,'duplicateClosureVerified':True,'linuxFinalInventoryVerified':False,
            'fixtureDisposalVerified':False,'nativeExecutionAllowed':False}
        validate_uncertainty(report,ready,'receipt-blocked')
        for field,value in [('receiptSha256','d'*64),('retentionReceiptVerified',True),
                ('copyVerified',True),('nativeExecutionAllowed',True),('terminalEvidence','absent'),
                ('keeperAlive',1),('duplicateClosureVerified',False),('linuxFinalInventoryVerified',True),
                ('mountIdentity',[2,1]),('invocation','e'*32),('manifestSha256','x'*64)]:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    validate_uncertainty(report|{field:value},ready,'receipt-blocked')
        with self.assertRaises(ValueError):
            validate_uncertainty(report|{'path':'/tmp/untrusted'},ready,'receipt-blocked')

    def test_fixture_disposal_requires_settled_unknown_observation(self):
        loop=asyncio.new_event_loop()
        try:
            session=UncertainRun('missing')
            with self.assertRaisesRegex(RuntimeError,'^fixture-disposal-before-unknown-observation-settled$'):
                loop.run_until_complete(session.dispose_fixed_fixture())
        finally:
            loop.close()
