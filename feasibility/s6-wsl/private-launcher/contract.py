"""Bounded synthetic Windows artifact contract; historical sources remain sealed."""
COMMON = {'attempt.json', 'host-config.json', 'watchdog-config.json', 'host-ready.json',
          'watchdog-ready.json', 'watchdog-report.json', 'observer.stdout.bin',
          'observer.stderr.bin', 'watchdog.stderr.bin', 'lease.stderr.bin'}
PROTOCOL = {'protocol-result.json', 'protocol-stdout.bin', 'protocol-stderr.bin'}
STOP = {'stop-request.json', 'stop-response.bin', 'stop-result.json'}
PRIVATE = {'retention.json', 'private-evidence.json', 'witness.json', 'storage-audit.json'}
MODES = ('valid', 'stop-pending', 'owner-loss')
PER_FILE = 8 * 1024 * 1024
PER_CASE = 32 * 1024 * 1024


def filenames(mode):
    if mode not in MODES:
        raise ValueError('mock-case-not-allowed')
    return COMMON | PRIVATE | (PROTOCOL if mode != 'owner-loss' else set()) | (STOP if mode == 'stop-pending' else set())


def manifest():
    return {'modes': list(MODES), 'filenames': {mode: sorted(filenames(mode)) for mode in MODES},
            'postRunFileBudget': PER_FILE, 'postRunCaseBudget': PER_CASE,
            'liveDiskQuota': False, 'automaticDeletion': False, 'nativeExecutionAllowed': False}
