"""Cross-process evidence uncertainty never becomes a successful retention receipt."""
import importlib.util

from bindings import composition,cohort

spec=importlib.util.spec_from_file_location('uncertain_sealed_case',composition.SOURCE.parent/'supervised-shutdown/case.py')
previous=importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
FAULTS={'missing','invalid','receipt-blocked'}
FIELDS={'event','nonce','stage','outcome','copyVerified','automaticDeletion','keeperIdentity','mountIdentity',
    'invocation','receiptSha256','retentionReceiptVerified','keeperAlive','workerPidfdsSignaled',
    'originalProcEntriesAbsent','cgroupEmpty','leaseReason','evidenceFault','terminalEvidence','manifestSha256',
    'duplicateClosureVerified','linuxFinalInventoryVerified','fixtureDisposalVerified','nativeExecutionAllowed'}


def validate_uncertainty(report,ready,fault):
    if fault not in FAULTS or type(report) is not dict or set(report)!=FIELDS:
        raise ValueError('uncertain-report-schema')
    expected={'event':'result','nonce':ready['startup']['nonce'],'stage':'held','outcome':'unknown',
        'copyVerified':False,'automaticDeletion':False,'keeperIdentity':ready['keeper']['identity'],
        'mountIdentity':ready['startup']['runtimeIdentity'],'invocation':ready['descriptor']['InvocationID'],
        'retentionReceiptVerified':fault!='receipt-blocked','keeperAlive':True,'workerPidfdsSignaled':True,
        'originalProcEntriesAbsent':True,'cgroupEmpty':True,'leaseReason':'unverified','evidenceFault':fault,
        'terminalEvidence':'absent' if fault=='missing' else 'invalid','duplicateClosureVerified':True,
        'linuxFinalInventoryVerified':False,'fixtureDisposalVerified':False,'nativeExecutionAllowed':False}
    if cohort.writer.encode({key:report[key] for key in expected})!=cohort.writer.encode(expected):
        raise ValueError('uncertain-report-binding')
    for name in ('receiptSha256','manifestSha256'):
        digest=report[name]
        if name=='receiptSha256' and fault=='receipt-blocked':
            if digest is not None:
                raise ValueError('uncertain-receipt-not-verified')
        elif type(digest) is not str or len(digest)!=64 or any(char not in '0123456789abcdef' for char in digest):
            raise ValueError('uncertain-report-digest')


class UncertainCase(previous.ShutdownCase):
    def inject(self):
        if len(self.held)!=2 or self.linux_ready is None or self.fault not in FAULTS:
            raise RuntimeError('uncertain-injection-before-readiness')
        self.controls.write('release.json',{'action':'exit-owner','fault':'none'})
        command=('observe-'+self.fault+'\n').encode()
        if self.observer.stdin.write(command)!=len(command):
            raise OSError('uncertain-injection-short-write')
        self.observer.stdin.flush()

    def observe(self):
        report=self.message('result')
        validate_uncertainty(report,self.linux_ready,self.fault)
        guardian=self.collect_guardian()
        if self.observer.poll() is not None or self.observer_errors:
            raise ValueError('uncertain-observer-not-owned')
        if not all(cohort.windows.signaled(handle,2000) for handle in self.held):
            raise ValueError('uncertain-Windows-process-live')
        self.unknown_report,self.unknown_verified=report,True
        self.job_empty=guardian['windowsJobEmpty']
        selected=self.selected_witness(guardian,report)
        selected['verified'],selected['linuxSentinelSurvived']=False,False
        self.files.write('controller','outcome.json',cohort.writer.encode({
            'selected':selected,'linux':report,'linuxReady':self.linux_ready,'guardian':guardian}))
        return selected


class UncertainRun(previous.previous.UnknownRun):
    def __init__(self,fault):
        super().__init__('owner-exit')
        if fault not in FAULTS:
            raise ValueError('uncertain-fixed-fault')
        self.fault=fault

    def prepare(self):
        self.case=UncertainCase(self.mode)
        self.case.fault=self.fault
        self.case.prepare_linux()

    def summary(self):
        selected=super().summary()
        observed=self.case is not None and self.case.unknown_verified
        report=self.case.unknown_report if observed else {}
        return selected|{'evidenceFault':self.fault,
            'retentionReceiptVerified':report.get('retentionReceiptVerified',False),
            'terminalEvidence':report.get('terminalEvidence','unconfirmed'),
            'custodyInventoryVerified':observed,'duplicateClosureVerified':observed,
            'linuxFinalInventoryVerified':False}
