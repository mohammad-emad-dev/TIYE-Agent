"""Outside-Job witness and protected collector for fixed synthetic Windows cases."""
import contextlib
import json
import math
import subprocess
import sys
import threading
import time
import uuid

import composition
from audit import control_sizes, retained_worker
from control import ControlRecords, PublicationPending, reject_constant, unique_members
from resources import BudgetCapture, MetadataFiles, writer
import windows


class Collector:
    def __init__(self, mode):
        if mode not in composition.MODES:
            raise ValueError('fixed-mode-required')
        self.mode, self.nonce = mode, uuid.uuid4().hex
        self.budget = composition.LeaseBudget('collector')
        self.resources = contextlib.ExitStack()
        try:
            self.capture = BudgetCapture(self.budget)
            self.resources.callback(self.capture.close)
            self.files = MetadataFiles(self.capture, self.budget)
            self.resources.callback(self.files.close)
            self.control_storage = writer.store.create_store()
            self.resources.callback(self.control_storage.close)
        except (OSError, ValueError):
            self.resources.close()
            raise
        self.controls = ControlRecords(self.control_storage, self.budget, self.nonce)
        self.drain_errors = []
        self.persist_lock = threading.Lock()
        self.guardian = None
        self.sentinel = None

    def drain(self, name, pipe):
        rejected = False
        try:
            while payload := pipe.read(writer.CHUNK):
                if not rejected:
                    try:
                        with self.persist_lock:
                            self.files.write('observer', name + '.bin', payload)
                    except (OSError, ValueError):
                        self.drain_errors.append(name + '-persistence-failed')
                        rejected = True
        except OSError:
            self.drain_errors.append(name + '-reader-failed')

    def wait_ready(self):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                ready = self.controls.read('ready.json')
            except (FileNotFoundError, PublicationPending):
                if self.guardian.poll() is not None:
                    raise RuntimeError('guardian-exited-before-ready')
                time.sleep(0.01)
                continue
            if set(ready) != {'mode', 'root', 'protocol', 'nonce', 'composition'} or ready['mode'] != self.mode:
                raise ValueError('ready-schema')
            return ready
        raise TimeoutError('witness-ready-expired')

    def launch(self):
        self.files.write('controller', 'attempt.json', writer.encode({'mode': self.mode, 'nonce': self.nonce}))
        argv = [sys.executable, '-I', '-B', str(composition.SOURCE / 'guardian.py'), self.mode,
                str(self.control_storage.path), self.nonce, composition.fingerprint()]
        self.guardian = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                         stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW)
        self.threads = [threading.Thread(target=self.drain, args=(name, getattr(self.guardian, name)), daemon=True)
                        for name in ('stdout', 'stderr')]
        for thread in self.threads:
            thread.start()

    def witnesses(self, stack):
        self.sentinel = subprocess.Popen([sys.executable, '-I', '-B', '-c', 'import time; time.sleep(95)'],
                                          stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                          stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        sentinel = windows.open_process(self.sentinel.pid)
        stack.callback(windows.close, sentinel)
        ready = self.wait_ready()
        held = []
        for name in ('root', 'protocol'):
            handle = windows.hold(ready[name], self.nonce)
            held.append(handle)
            stack.callback(windows.close, handle)
        if self.mode == 'owner-exit':
            self.controls.write('release.json', {'action': 'exit-owner'})
        elif self.mode == 'guardian-loss':
            guardian_handle = windows.open_process(self.guardian.pid)
            stack.callback(windows.close, guardian_handle)
            windows.kill(guardian_handle)
        return held, sentinel

    def collect_guardian(self):
        code = self.guardian.wait(timeout=10)
        for thread in self.threads:
            thread.join(timeout=2)
        if any(thread.is_alive() for thread in self.threads) or self.drain_errors:
            raise ValueError('collector-pipe-drain-failed')
        stdout = self.capture.storage.path / 'observer/stdout.bin'
        stderr = self.capture.storage.path / 'observer/stderr.bin'
        if stderr.stat().st_size != 0:
            raise ValueError('unexpected-guardian-diagnostics')
        if self.mode == 'guardian-loss':
            if code != 77 or stdout.stat().st_size:
                raise ValueError('guardian-loss-outcome')
            return None
        if stdout.stat().st_size > 4096:
            raise ValueError('guardian-report-cap')
        report = json.loads(stdout.read_bytes(), object_pairs_hook=unique_members, parse_constant=reject_constant)
        self.validate_guardian(report, code)
        return report

    def validate_guardian(self, report, code):
        fields = {'mode', 'nonce', 'composition', 'stopReason', 'stopDecisionSeconds', 'deadlineSeconds',
                  'activeProcessesBeforeStop', 'stopRequestReturnedSeconds', 'nativeExecutionAllowed',
                  'windowsJobEmpty', 'rootHandleSignaled', 'rootExitCode',
                  'cleanupObservationSeconds', 'postCloseElapsedSeconds'}
        if type(report) is not dict or set(report) != fields:
            raise ValueError('guardian-report-schema')
        for field in ('stopDecisionSeconds', 'stopRequestReturnedSeconds',
                      'cleanupObservationSeconds', 'postCloseElapsedSeconds'):
            if type(report[field]) not in (int, float) or not math.isfinite(report[field]) or report[field] < 0:
                raise ValueError('guardian-timing-schema')
        for field in ('rootExitCode', 'deadlineSeconds', 'activeProcessesBeforeStop'):
            if type(report[field]) is not int or report[field] < 0:
                raise ValueError('guardian-integer-schema')
        expected = {'valid': ('job-empty', 0), 'stall': ('deadline', 124), 'owner-exit': ('owner-exit', 125)}
        reason, exit_code = expected[self.mode]
        if (report['nonce'] != self.nonce or report['composition'] != composition.fingerprint()
                or report['mode'] != self.mode or report['stopReason'] != reason or code != exit_code
                or report['windowsJobEmpty'] is not True or report['rootHandleSignaled'] is not True
                or report['deadlineSeconds'] != composition.DEADLINE or report['nativeExecutionAllowed'] is not False):
            raise ValueError('guardian-bound-outcome')
        if self.mode == 'stall' and not 5 <= report['stopDecisionSeconds'] < 7:
            raise ValueError('deadline-delivery-not-qualified')
        if self.mode == 'owner-exit' and report['stopDecisionSeconds'] >= composition.DEADLINE:
            raise ValueError('owner-exit-did-not-precede-deadline')
        if self.mode != 'valid' and report['activeProcessesBeforeStop'] < 1:
            raise ValueError('no-live-job-at-stop')
        if report['rootExitCode'] != {'valid': 0, 'stall': 124, 'owner-exit': 17}[self.mode]:
            raise ValueError('root-exit-outcome')
        if report['cleanupObservationSeconds'] > composition.OBSERVE + 0.2:
            raise ValueError('cleanup-observation-overrun')

    def verify_sizes(self):
        intent = self.controls.read('intent.json')
        if intent['mode'] != self.mode or intent['uncertain'] is not True or intent['automaticDeletion'] is not False:
            raise ValueError('worker-intent')
        worker_sizes = retained_worker(intent['captureRoot'])
        expected = {'intent.json', 'ready.json'}
        expected |= {'result.json'} if self.mode == 'valid' else set()
        expected |= {'release.json'} if self.mode == 'owner-exit' else set()
        control_bytes = control_sizes(self.control_storage, expected)
        worker_sizes['controller'] += sum(size for name, size in control_bytes.items() if name != 'release.json')
        collector_sizes = self.files.audit()
        collector_sizes['controller'] += control_bytes.get('release.json', 0)
        if collector_sizes != self.budget.snapshot():
            raise ValueError('collector-gross-versus-final-accounting-drift')
        if self.mode == 'valid':
            charges = self.controls.read('result.json')['chargedBytesBeforeResult']
            charges['controller'] += control_bytes['result.json']
            if charges != worker_sizes:
                raise ValueError('successful-worker-accounting-drift')
        for role, sizes in (('collector', collector_sizes), ('worker', worker_sizes)):
            if any(size > composition.SLICES[role][owner] for owner, size in sizes.items()):
                raise ValueError('role-final-size-exceeded')
        composition.policy.audit_metadata_sizes({owner: collector_sizes[owner] + worker_sizes[owner]
                                                 for owner in composition.policy.ALLOCATIONS})

    def execute(self):
        try:
            with contextlib.ExitStack() as stack:
                self.launch()
                if self.mode == 'valid':
                    held, sentinel = [], None
                else:
                    held, sentinel = self.witnesses(stack)
                report = self.collect_guardian()
                if not all(windows.signaled(handle, 2000) for handle in held):
                    raise ValueError('held-process-still-live')
                if sentinel is not None and windows.signaled(sentinel):
                    raise ValueError('unrelated-sentinel-stopped')
                selected = self.selected(report)
                self.files.write('controller', 'outcome.json', writer.encode(selected | {'guardian': report}))
                self.verify_sizes()
                return selected
        finally:
            self.close()

    def selected(self, report):
        if self.mode == 'valid':
            worker_report = self.controls.read('result.json')['report']
            if (worker_report['fault'] is not None or worker_report['storageCompleted'] is not True
                    or worker_report['directChildrenReapedAndPipesDrained'] is not True
                    or worker_report['nativeExecutionAllowed'] is not False
                    or worker_report['processTreeQualified'] is not False):
                raise ValueError('worker-storage-outcome')
        return {'mode': self.mode, 'verified': True, 'guardianReported': report is not None,
                'windowsJobEmpty': report['windowsJobEmpty'] if report else None,
                'heldRootAndProtocolSignaled': True if self.mode != 'valid' else None,
                'unrelatedSentinelSurvived': True if self.mode != 'valid' else None,
                'workerStorageCompleted': self.mode == 'valid',
                'workerEvidenceUncertain': self.mode != 'valid', 'nativeExecutionAllowed': False}

    def close(self):
        # Rescue remains outside measured guardian outcomes and cannot earn credit.
        for child in (self.guardian, self.sentinel):
            if child is not None and child.poll() is None:
                child.kill()
                child.wait(timeout=5)
        if self.guardian is not None:
            for thread in self.threads:
                thread.join(timeout=2)
            if any(thread.is_alive() for thread in self.threads):
                raise RuntimeError('collector-readers-unsettled-handles-retained')
            self.guardian.stdout.close()
            self.guardian.stderr.close()
        self.resources.close()
