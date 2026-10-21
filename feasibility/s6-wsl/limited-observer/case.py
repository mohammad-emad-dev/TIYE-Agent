"""Only checked mount transfer and persistent-copy evidence earns integration credit."""
import json
import os
from pathlib import Path
import subprocess

from bindings import adapter, runtime, cohort

READY = {'beforeMountSnapshotVerified': True, 'activeMountSnapshotVerified': True, 'leafLimitsVerified': True}
FINAL = {'designatedMountVerified': True, 'leafLimitsVerified': True,
         'heldMountAfterCleanupVerified': True, 'persistentCopyVerified': True}
STARTUP_READY = {'beforeVerified': True, 'activeVerified': True,
                 'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}
STARTUP_FINAL = {'beforeActiveAfterVerified': True, 'helpersRetained': True,
                 'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}


def verdict(record, expected):
    if (type(record) is not dict or set(record) != set(expected)
            or any(record[key] is not flag for key, flag in expected.items())):
        raise ValueError('limited-observer-incomplete-verdict')


class LimitedCase(adapter.LiveCase):
    def __init__(self, mode):
        super().__init__(mode)
        self.mount_verified = False

    def ready(self):
        super().ready()
        verdict(self.linux_ready['startupObservation'], STARTUP_READY)
        verdict(self.linux_ready['limitObservation'], READY)

    def validate_linux(self, report):
        super().validate_linux({key: value for key, value in report.items()
                                if key not in {'startupObservation', 'limitObservation', 'retention'}})
        verdict(report['startupObservation'], STARTUP_FINAL)
        verdict(report['limitObservation'], FINAL)
        retention = report['retention']
        if (type(retention) is not dict or set(retention) != {'path', 'manifestSha256', 'verified', 'automaticDeletion'}
                or retention['verified'] is not True or retention['automaticDeletion'] is not False
                or type(retention['path']) is not str or not retention['path'].startswith('/tmp/tiye-limited-retained-')
                or type(retention['manifestSha256']) is not str or len(retention['manifestSha256']) != 64
                or any(char not in '0123456789abcdef' for char in retention['manifestSha256'])):
            raise ValueError('limited-private-retention-record')
        self.verify_persistent_copy(retention)
        self.mount_verified = True

    def verify_persistent_copy(self, retention):
        if self.observer.poll() != 0:
            raise ValueError('retention-reopen-before-observer-exit')
        system = Path(os.environ['SystemRoot'])
        argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
                '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
                '-I', '-S', '-B', self.linux_root + '/linux_runtime.py', 'verify_retained',
                self.linux_root, self.nonce]
        # Fixed verifier output only; this is not an arbitrary-RPC capture path.
        checked = subprocess.run(argv, input=json.dumps(retention).encode() + b'\n', capture_output=True,
            timeout=5, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        for name in ('stdout', 'stderr'):
            payload = getattr(checked, name)
            for offset in range(0, len(payload), cohort.writer.CHUNK):
                self.linux_files.write('observer', name + '.bin', payload[offset:offset + cohort.writer.CHUNK])
        if checked.returncode != 0 or checked.stdout != b'RETAINED-OK\n' or checked.stderr:
            raise ValueError('retention-after-observer-exit-unverified')


class LimitedRun(runtime.ScheduledRun):
    def prepare(self):
        self.case = LimitedCase(self.mode)
        self.case.prepare_linux()

    def summary(self):
        selected = super().summary()
        checked = self.case.mount_verified if self.case else False
        return selected | {'filesystemLimitsVerified': checked, 'retainedSnapshotVerified': checked,
                           'initializeResponseVerified': checked, 'initializedPeerReceiptEstablished': False,
                           'candidateExecuted': False, 'nativeAdmissionGranted': False}
