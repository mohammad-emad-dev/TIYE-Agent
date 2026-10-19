"""Fixed Windows/Ubuntu fixture adapters; independent guardian remains unchanged."""
import contextlib
import time

from bindings import cohort, composition


class LiveCase(cohort.WSLCase):
    def __init__(self, mode):
        super().__init__(mode)
        self.ownership = contextlib.ExitStack()
        self.held = []
        self.linux_ready = None
        self.closed = False

    def ready(self):
        windows_ready = self.wait_ready()
        for name in ('root', 'protocol'):
            handle = cohort.windows.hold(windows_ready[name], self.nonce)
            self.held.append(handle)
            self.ownership.callback(cohort.windows.close, handle)
        self.linux_ready = self.message('ready')
        if self.linux_ready['startup']['nonce'] != self.nonce:
            raise ValueError('linux-readiness-binding')

    def inject(self):
        if len(self.held) != 2 or self.linux_ready is None:
            raise RuntimeError('loss-before-independent-readiness')
        if self.mode == 'guardian-loss':
            guardian = cohort.windows.open_process(self.guardian.pid)
            self.ownership.callback(cohort.windows.close, guardian)
            cohort.windows.kill(guardian)
        else:
            action = 'stall' if self.mode == 'stall' else 'exit-owner'
            self.controls.write('release.json', {'action': action})
        if self.observer.stdin.write(b'observe\n') != 8:
            raise OSError('short-observation-command-no-retry')
        self.observer.stdin.flush()

    def observe(self):
        linux = self.message('result')
        if self.mode == 'stall' and time.monotonic() - self.guardian_started >= composition.DEADLINE:
            raise ValueError('lease-result-after-windows-fallback')
        guardian = self.collect_guardian()
        if self.observer.wait(timeout=3) != 0:
            raise ValueError('linux-observer-exit')
        for thread in self.linux_threads:
            thread.join(timeout=2)
        if self.observer_errors or any(thread.is_alive() for thread in self.linux_threads):
            raise ValueError('linux-capture-unsettled')
        if not all(cohort.windows.signaled(handle, 2000) for handle in self.held):
            raise ValueError('held-windows-process-live')
        self.validate_linux(linux)
        selected = self.selected_witness(guardian, linux)
        self.files.write('controller', 'outcome.json', cohort.writer.encode({
            'selected': selected, 'linux': linux, 'linuxReady': self.linux_ready, 'guardian': guardian}))
        self.verify_windows_sizes()
        self.close_settled()
        return selected

    def selected_witness(self, guardian, linux):
        return {'mode': self.mode, 'verified': True, 'windowsHeldProcessesSignaled': True,
                'windowsJobEmpty': guardian['windowsJobEmpty'] if guardian else None,
                'linuxPidfdsSignaled': True, 'linuxCgroupEmpty': True, 'linuxSentinelSurvived': True,
                'leaseExpiredBeforeWindowsDeadline': True if self.mode == 'stall' else None,
                'leaseReason': linux['leaseReason'], 'workerEvidenceUncertain': True,
                'nativeExecutionAllowed': False}

    def close_settled(self):
        """Caller must first settle every adapter task; rescue earns no credit."""
        if self.closed:
            return
        self.close_observer()
        self.close()
        self.ownership.close()
        self.closed = True
