"""Real Windows fault delivery keeps protocol diagnostics separate from cleanup proof."""
import importlib.util
import math
import time

from bindings import adapter,composition,cohort

spec=importlib.util.spec_from_file_location('supervised_shutdown_sealed_case',composition.SOURCE.parent/'scheduled-unknown/case.py')
previous=importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
EXPECTED={'truncated':'fault-truncated','wrong-nonce':'fault-heartbeat','oversize':'fault-oversize'}


def validate_shutdown(report,ready,fault):
    fields=previous.FIELDS|{'terminalSequence'}
    if type(report) is not dict or set(report)!=fields:
        raise ValueError('supervised-shutdown-report-schema')
    reason=report['leaseReason']
    if ((reason!=EXPECTED[fault] if fault!='none' else reason not in ('eof','expired'))
            or type(report['terminalSequence']) is not int or report['terminalSequence']<1):
        raise ValueError('supervised-shutdown-terminal-diagnostic')
    # Reuse the closed binding verifier; a permitted token here validates the
    # shared fields only. Actual fault reason remains separately checked above.
    shared={key:value for key,value in report.items() if key!='terminalSequence'}
    previous.validate_refusal(shared|{'leaseReason':'eof'},ready)


class ShutdownCase(previous.UnknownCase):
    fault='none'

    def validate_guardian(self,report,code):
        if (self.mode!='owner-exit' or self.fault=='none'
                or type(report) is not dict or report.get('stopReason')!='job-empty'):
            return super().validate_guardian(report,code)
        fields={'mode','nonce','composition','stopReason','stopDecisionSeconds','deadlineSeconds',
            'activeProcessesBeforeStop','stopRequestReturnedSeconds','nativeExecutionAllowed',
            'windowsJobEmpty','rootHandleSignaled','rootExitCode','cleanupObservationSeconds','postCloseElapsedSeconds'}
        if set(report)!=fields:
            raise ValueError('shutdown-empty-job-schema')
        for field in ('stopDecisionSeconds','stopRequestReturnedSeconds','cleanupObservationSeconds','postCloseElapsedSeconds'):
            if type(report[field]) not in (int,float) or not math.isfinite(report[field]) or report[field]<0:
                raise ValueError('shutdown-empty-job-timing')
        expected={'mode':self.mode,'nonce':self.nonce,'composition':composition.fingerprint(),
            'stopReason':'job-empty','deadlineSeconds':composition.DEADLINE,'activeProcessesBeforeStop':0,
            'nativeExecutionAllowed':False,'windowsJobEmpty':True,'rootHandleSignaled':True,'rootExitCode':17}
        if (cohort.writer.encode({key:report[key] for key in expected})!=cohort.writer.encode(expected)
                or code!=0 or report['stopDecisionSeconds']>=composition.DEADLINE
                or report['cleanupObservationSeconds']>composition.OBSERVE+0.2):
            raise ValueError('shutdown-empty-job-binding')

    def inject(self):
        if len(self.held)!=2 or self.linux_ready is None:
            raise RuntimeError('shutdown-injection-before-readiness')
        if self.mode=='guardian-loss':
            return adapter.LiveCase.inject(self)
        self.controls.write('release.json',{'action':'stall' if self.mode=='stall' else 'exit-owner','fault':self.fault})
        if self.observer.stdin.write(b'observe\n')!=8:
            raise OSError('shutdown-observe-command-short-write')
        self.observer.stdin.flush()

    def observe(self):
        report=self.message('result')
        validate_shutdown(report,self.linux_ready,self.fault)
        if self.mode=='stall' and time.monotonic()-self.guardian_started>=composition.DEADLINE:
            raise ValueError('shutdown-fault-after-Windows-fallback')
        guardian=self.collect_guardian()
        if self.observer.poll() is not None or self.observer_errors:
            raise ValueError('shutdown-observer-not-owned')
        if not all(cohort.windows.signaled(handle,2000) for handle in self.held):
            raise ValueError('shutdown-Windows-process-live')
        self.unknown_report,self.unknown_verified=report,True
        self.job_empty=guardian['windowsJobEmpty'] if guardian else None
        selected=self.selected_witness(guardian,report)
        selected['verified'],selected['linuxSentinelSurvived']=False,False
        self.files.write('controller','outcome.json',cohort.writer.encode({
            'selected':selected,'linux':report,'linuxReady':self.linux_ready,'guardian':guardian}))
        return selected

    def dispose_fixed_fixture(self):
        if not self.unknown_verified or self.fixture_disposed or self.observer.poll() is not None:
            raise RuntimeError('shutdown-disposal-before-bound-unknown')
        payload=b'dispose-supervised-fixture\n'
        if self.observer.stdin.write(payload)!=len(payload):
            raise OSError('shutdown-disposal-short-write')
        self.observer.stdin.flush()
        disposed=self.message('result')
        expected=self.unknown_report|{'stage':'fixture-disposed','keeperAlive':False,'fixtureDisposalVerified':True}
        if cohort.writer.encode(disposed)!=cohort.writer.encode(expected) or self.observer.wait(timeout=3)!=0:
            raise ValueError('shutdown-disposal-binding-or-exit')
        for thread in self.linux_threads:
            thread.join(timeout=2)
        if self.observer_errors or any(thread.is_alive() for thread in self.linux_threads):
            raise ValueError('shutdown-readers-unsettled')
        self.verify_windows_sizes()
        self.fixture_disposed=True


class ShutdownRun(previous.UnknownRun):
    def __init__(self,mode,fault):
        super().__init__(mode)
        self.fault=fault

    def prepare(self):
        self.case=ShutdownCase(self.mode)
        self.case.fault=self.fault
        self.case.prepare_linux()

    def summary(self):
        selected=super().summary()
        observed=self.case is not None and self.case.unknown_verified
        return selected|{'injectedFault':self.fault,
            'terminalReason':self.case.unknown_report['leaseReason'] if observed else 'unconfirmed',
            'terminalSequence':self.case.unknown_report['terminalSequence'] if observed else None,
            'terminalProtocolFaultObserved':observed and self.fault!='none'}
