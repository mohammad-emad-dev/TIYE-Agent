"""Only the frozen Python worker can become the service command."""
import os
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import profile
import service
import common
import lease


def pipe_command(folder, nonce, mode):
    if (os.getuid() != 1000 or mode not in profile.MODES
            or not service.HEX32_RE.fullmatch(nonce) or folder != SOURCE):
        raise ValueError('mock-only-source-bound-entry')
    unit = 'tiye-service-' + nonce + '.service'
    before = service.query(unit)
    if (before.get('timedOut') or before['returnCode'] != 0
            or before['properties'].get('LoadState') != 'not-found'):
        raise ValueError('unit-not-explicitly-absent')
    for name in ('home', 'codex-home', 'tmp'):
        (folder / name).mkdir(mode=0o700)
    argv = ['/usr/bin/systemd-run', '--user', '--quiet', '--wait', '--pipe',
        '--expand-environment=no', '--unit=' + unit, '--service-type=exec']
    properties = {'ExitType': 'main', 'KillMode': 'control-group',
        'TimeoutStopSec': str(profile.SERVICE_STOP_SECONDS) + 's',
        'RuntimeMaxSec': str(profile.SERVICE_RUNTIME_SECONDS) + 's',
        'SendSIGKILL': 'yes', 'Restart': 'no', 'Delegate': 'no', 'UMask': '0077',
        'LimitCORE': '0', 'WorkingDirectory': str(folder)}
    argv.extend('--property=' + key + '=' + value for key, value in properties.items())
    return argv + ['--', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8',
        'HOME=' + str(folder / 'home'), 'CODEX_HOME=' + str(folder / 'codex-home'),
        'TMPDIR=' + str(folder / 'tmp'), '/usr/bin/python3', '-I', '-S', '-B', '-u',
        str(folder / 'worker.py'), 'main', str(folder), nonce, mode]


if __name__ == '__main__':
    folder, nonce, mode = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    os.umask(0o077)
    deadline = time.monotonic() + 5
    while not (folder / 'lease.json').exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    sequence, received, observed = lease._sample(folder / 'lease.json', nonce)
    if observed - received > 1.0:
        raise ValueError('initial-lease-expired')
    argv = pipe_command(folder, nonce, mode)
    common.save(folder / 'service-command.json', {'nonce': nonce, 'argv': argv,
        'profile': profile.manifest(), 'busEnvironmentKeys': sorted(service.BUS_ENV)})
    os.execve(argv[0], argv, service.BUS_ENV)
