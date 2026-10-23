"""Pre-pinned inspection survives observer loss without acquiring release authority."""
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
        request=cohort.writer.encode({'event':'enroll-custody-inspector','nonce':self.nonce,
            'identity':self.inspector_identity})+b'\n'
        if self.observer.stdin.write(request)!=len(request):
            raise OSError('inspector-enrollment-short-write')
        self.observer.stdin.flush()
        self.validate_enrollment(self.message('result'),binding)
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
        document={'scope':'live-only-custody-inspector','nonce':self.nonce,'identity':self.inspector_identity,
            'keeperIdentity':binding['keeper']['identity'],'mountIdentity':binding['startup']['runtimeIdentity'],
            'persistence':'keeper-memory-only','automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
        if cohort.writer.encode(report)!=cohort.writer.encode({'event':'result','nonce':self.nonce,
                'stage':'inspector-enrolled','document':document}):
            raise ValueError('inspector-enrollment-binding')

    def dispose_fixed_fixture(self):
        if self.recovery is None:
            raise RuntimeError('inspector-fixture-disposal-before-recovery')
        if not self.inspection_verified or self.fixture_disposed:
            raise RuntimeError('inspector-disposal-before-bound-recovery')
        self.recovery_write(b'dispose-supervised-fixture\n')
        report=self.recovery_message('result')
        expected=self.inspection_report|{'event':'result','keeperAlive':False,'fixtureDisposalVerified':True}
        if cohort.writer.encode(report)!=cohort.writer.encode(expected) or self.recovery.wait(timeout=3)!=0:
            raise ValueError('inspector-disposal-binding-or-exit')
        for thread in self.linux_threads+self.recovery_threads:
            thread.join(timeout=2)
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


class InspectorRun(previous.UncertainRun):
    def prepare(self):
        self.case=InspectorCase(self.mode)
        self.case.fault=self.fault
        self.case.prepare_linux()

    def summary(self):
        selected=super().summary()
        verified=self.case is not None and self.case.inspection_verified
        if verified and not self.case.fixture_disposed:
            selected['keeperOwnership']='inspected-held'
        return selected|{'observerLossVerified':verified,'standbyInspectionVerified':verified,
            'inspectorPersistence':'keeper-memory-only' if verified else 'unconfirmed',
            'automaticReleaseAllowed':False}

    async def recover_after_observer_loss(self):
        if self.coordinator.pending or self.witness is None or self.coordinator.summary()['outcome']!='unknown':
            raise RuntimeError('inspector-before-settled-unknown')
        await asyncio.to_thread(self.case.recover_after_observer_loss)
