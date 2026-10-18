"""Fixed synthetic ambient fixture; no arbitrary resource selector."""
COMMON = {'attempt.json', 'host-config.json', 'watchdog-config.json', 'host-ready.json',
          'watchdog-ready.json', 'watchdog-report.json', 'observer.stdout.bin',
          'observer.stderr.bin', 'watchdog.stderr.bin', 'lease.stderr.bin'}
PROTOCOL = {'protocol-result.json', 'protocol-stdout.bin', 'protocol-stderr.bin'}
PRIVATE = {'retention.json', 'private-evidence.json', 'witness.json', 'storage-audit.json', 'ambient-evidence.json'}
MODES = ('valid',)
PER_FILE = 8 * 1024 * 1024
PER_CASE = 32 * 1024 * 1024


def filenames(mode):
    if mode != 'valid':
        raise ValueError('fixed-valid-probe-only')
    return COMMON | PROTOCOL | PRIVATE


def manifest():
    return {'mode': 'valid', 'postRunFileBudget': PER_FILE, 'postRunCaseBudget': PER_CASE,
            'filenames': sorted(filenames('valid')), 'uid': 1000, 'syntheticResourcesOnly': True,
            'resources': ['read0600', 'write0600', 'read000', 'unix0600', 'tcp-loopback'],
            'externalNetworkTested': False, 'credentialsTested': False,
            'automaticDeletion': False, 'nativeExecutionAllowed': False}
