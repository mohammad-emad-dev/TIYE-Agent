"""Lost acknowledgements and ended inspectors never reopen the occupied slot."""
import asyncio
import importlib.util
import os
from pathlib import Path
import queue
import subprocess
import threading

from bindings import composition,cohort


def sealed(name,relative):
    spec=importlib.util.spec_from_file_location(name,composition.SOURCE.parent/relative)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


previous=sealed('custody_recovery_uncertain_case','uncertain-shutdown/case.py')
recovery=sealed('custody_recovery_prebound_case','prebound-recovery/case.py')


class InspectorCase(previous.UncertainCase):
    recovery_pipe=recovery.RecoveryCase.recovery_pipe
    recovery_message=recovery.RecoveryCase.recovery_message
    recovery_write=recovery.RecoveryCase.recovery_write

    def __init__(self,mode):
        super().__init__(mode)
        self.recovery,self.recovery_threads=None,[]
        self.recovery_messages,self.recovery_errors=queue.Queue(maxsize=3),[]
        self.inspection_verified=False
        self.wrapper_diagnostics=bytearray()

    def recovery_pipe(self,name,pipe):
        if name!='stderr' or self.interruption!='inspector-loss':
            return recovery.RecoveryCase.recovery_pipe(self,name,pipe)
        try:
            while payload:=pipe.read(512):
                with self.persist_lock:
                    self.linux_files.write('observer','stderr.bin',payload)
                self.wrapper_diagnostics.extend(payload)
                if len(self.wrapper_diagnostics)>512:
                    raise ValueError('interrupted-inspector-wrapper-diagnostic-cap')
        except (OSError,ValueError):
            self.recovery_errors.append('interrupted-inspector-wrapper-capture')
            while pipe.read(512):
                pass

    def recover_after_observer_loss(self):
        if not self.unknown_verified or self.recovery is not None or self.fixture_disposed:
            raise RuntimeError('inspector-requires-original-bound-unknown')
        system=Path(os.environ['SystemRoot'])
        argv=[str(system/'System32/wsl.exe'),'-d','Ubuntu','--cd','/tmp','--exec',
            '/usr/bin/env','-i','PATH=/usr/bin:/bin','LC_ALL=C.UTF-8','/usr/bin/setsid','--wait',
            '/usr/bin/python3','-I','-S','-B',self.linux_root+'/linux_runtime.py','inspect_custody',self.linux_root,self.nonce]
        self.recovery=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            bufsize=0,creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot':str(system),'WINDIR':str(system),'PATH':str(system/'System32')})
        self.recovery_threads=[threading.Thread(target=self.recovery_pipe,
            args=(name,getattr(self.recovery,name)),daemon=True) for name in ('stdout','stderr')]
        for thread in self.recovery_threads:
            thread.start()
        binding={'observer':self.linux_ready['observerProcess'],'keeper':self.linux_ready['keeper'],
            'startup':self.linux_ready['startup'],'invocation':self.linux_ready['descriptor']['InvocationID'],
            'manifestSha256':self.unknown_report['manifestSha256'],'fault':self.fault,
            'receiptSha256':self.unknown_report['receiptSha256']}
        self.recovery_write(cohort.writer.encode(binding)+b'\n')
        armed=self.recovery_message('armed')
        if set(armed)!={'event','nonce','identity'}:
            raise ValueError('inspector-ready-schema')
        self.inspector_identity=armed['identity']
        request=cohort.writer.encode({'event':'qualify-inspector-interruption','nonce':self.nonce,
            'identity':self.inspector_identity,'interruption':self.interruption})+b'\n'
        if self.observer.stdin.write(request)!=len(request):
            raise OSError('inspector-enrollment-short-write')
        self.observer.stdin.flush()
        self.validate_enrollment(self.message('result'),binding)
        if self.interruption=='inspector-loss':
            if self.recovery.wait(timeout=3)==0:
                raise ValueError('interrupted-inspector-loss-not-observed')
            self.inspection_report=self.enrollment_report
            self.inspection_verified=True
            return
        self.recovery_write(b'enrolled\n')
        enrolled=self.recovery_message('armed')
        expected={'event':'armed','nonce':self.nonce,'identity':self.inspector_identity,
            'stage':'enrolled','earlyInspectionRefused':True}
        if cohort.writer.encode(enrolled)!=cohort.writer.encode(expected):
            raise ValueError('inspector-early-access-not-refused')
        self.recovery_write(b'kill\n')
        report=self.recovery_message('killed')
        validate_inspection(report,self.linux_ready,self.unknown_report,self.inspector_identity)
        self.inspection_report,self.inspection_verified=report,True
        self.observer.wait(timeout=3)

    def validate_enrollment(self,report,binding):
        validate_reconciliation(report,self.linux_ready,self.inspector_identity,self.interruption)
        self.enrollment_report=report

    def dispose_fixed_fixture(self):
        if self.recovery is None:
            raise RuntimeError('inspector-fixture-disposal-before-recovery')
        if not self.inspection_verified or self.fixture_disposed:
            raise RuntimeError('inspector-disposal-before-bound-recovery')
        if self.interruption=='inspector-loss':
            payload=b'dispose-inspector-interruption\n'
            if self.observer.stdin.write(payload)!=len(payload):
                raise OSError('interrupted-inspector-disposal-short-write')
            self.observer.stdin.flush()
            report=self.message('result')
            expected=self.inspection_report|{'stage':'fixture-disposed','fixtureDisposalVerified':True}
            if cohort.writer.encode(report)!=cohort.writer.encode(expected) or self.observer.wait(timeout=3)!=0:
                raise ValueError('interrupted-inspector-disposal-binding')
        else:
            self.recovery_write(b'dispose-supervised-fixture\n')
            report=self.recovery_message('result')
            expected=self.inspection_report|{'event':'result','keeperAlive':False,'fixtureDisposalVerified':True}
            if cohort.writer.encode(report)!=cohort.writer.encode(expected) or self.recovery.wait(timeout=3)!=0:
                raise ValueError('inspector-disposal-binding-or-exit')
        for thread in self.linux_threads+self.recovery_threads:
            thread.join(timeout=2)
        if self.interruption=='inspector-loss':
            expected=('setsid: child '+str(self.inspector_identity['pid'])+
                ' did not exit normally: No such file or directory\n').encode()
            if bytes(self.wrapper_diagnostics)!=expected:
                raise ValueError('interrupted-inspector-wrapper-diagnostic-binding')
        if self.observer_errors or self.recovery_errors or any(thread.is_alive() for thread in self.linux_threads+self.recovery_threads):
            raise ValueError('inspector-capture-unsettled')
        self.verify_windows_sizes()
        self.fixture_disposed=True

    def close_settled(self):
        if self.recovery is not None:
            if not self.fixture_disposed or self.recovery.poll() is None:
                raise RuntimeError('inspector-holder-unsettled-retain-handles')
            for name in ('stdin','stdout','stderr'):
                getattr(self.recovery,name).close()
        super().close_settled()


def validate_inspection(report,ready,original,inspector):
    expected={'event':'killed','nonce':ready['startup']['nonce'],'observer':ready['observerProcess'],'identity':inspector,
        'keeperAlive':True,'earlyInspectionRefused':True,'foreignInspectionRefused':True,'releaseRefused':True,
        'replacementRefused':True,'outcome':'unknown','copyVerified':False,'manifestSha256':original['manifestSha256'],
        'receiptSha256':original['receiptSha256'],'socketPidfdVerified':True,'inspectorPersistence':'keeper-memory-only',
        'nativeExecutionAllowed':False}
    if cohort.writer.encode(report)!=cohort.writer.encode(expected):
        raise ValueError('inspector-after-loss-binding')


def validate_reconciliation(report,ready,inspector,interruption):
    status={'event':'inspector-status','nonce':ready['startup']['nonce'],
        'keeperIdentity':ready['keeper']['identity'],'mountIdentity':ready['startup']['runtimeIdentity'],
        'identity':inspector,'slotOccupied':True,'inspectorState':'ended' if interruption=='inspector-loss' else 'live',
        'persistence':'keeper-memory-only','replacementAllowed':False,'automaticReleaseAllowed':False,
        'nativeExecutionAllowed':False}
    expected={'event':'result','nonce':ready['startup']['nonce'],'stage':'inspector-reconciled','status':status,
        'replacementRefused':True,'releaseRefused':True,'interruption':interruption}
    if cohort.writer.encode(report)!=cohort.writer.encode(expected):
        raise ValueError('interrupted-inspector-status-binding')


class InspectorRun(previous.UncertainRun):
    def __init__(self,interruption):
        if interruption not in ('unobserved-ack','inspector-loss'):
            raise ValueError('interrupted-inspector-fixed-case')
        super().__init__('receipt-blocked' if interruption=='unobserved-ack' else 'missing')
        self.interruption=interruption

    def prepare(self):
        self.case=InspectorCase(self.mode)
        self.case.fault=self.fault
        self.case.interruption=self.interruption
        self.case.prepare_linux()

    def summary(self):
        selected=super().summary()
        verified=self.case is not None and self.case.inspection_verified
        lost=verified and self.interruption=='unobserved-ack'
        if lost and not self.case.fixture_disposed:
            selected['keeperOwnership']='inspected-held'
        return selected|{'observerLossVerified':lost,'standbyInspectionVerified':lost,
            'interruption':self.interruption,'interruptionVerified':verified,
            'slotOccupied':verified,'inspectorState':('ended' if self.interruption=='inspector-loss' else 'live') if verified else 'unconfirmed',
            'enrollmentAckObserved':verified and self.interruption=='inspector-loss',
            'inspectorPersistence':'keeper-memory-only' if verified else 'unconfirmed',
            'automaticReleaseAllowed':False}

    async def recover_after_observer_loss(self):
        if self.coordinator.pending or self.witness is None or self.coordinator.summary()['outcome']!='unknown':
            raise RuntimeError('inspector-before-settled-unknown')
        await asyncio.to_thread(self.case.recover_after_observer_loss)
