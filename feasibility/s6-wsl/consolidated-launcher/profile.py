"""Frozen mock profile; no native executable is admitted."""
WINDOWS_WATCHDOG_SECONDS = 90
WINDOWS_PROTOCOL_SECONDS = 75
SPAWN_SECONDS = 30
INITIALIZE_SECONDS = 15
CLEANUP_PHASE_SECONDS = 5
SERVICE_RUNTIME_SECONDS = 60
SERVICE_STOP_SECONDS = 5
OBSERVATION_SECONDS = 15
PRESSURE_BYTES = 8 * 1024 * 1024
BASELINE = ('valid', 'foreign', 'invalid-raw')
STOPS = ('stop-pending', 'pressure-stop')
OWNERS = ('owner-loss', 'pressure-owner-loss')
LOSSES = ('owner-loss', 'transport-loss', 'pressure-owner-loss', 'pressure-transport-loss')
PRESSURE = ('pressure-stop', 'pressure-owner-loss', 'pressure-transport-loss')
MODES = BASELINE + ('stop-pending', 'owner-loss', 'transport-loss') + PRESSURE
BUNDLE_FILES = ('service.py', 'common.py', 'profile.py', 'worker.py', 'protocol_peer.py',
    'lease.py', 'bridge.py', 'entry.py', 'observer.py', 'stop.py')


def manifest():
    return {'windowsWatchdogSeconds': WINDOWS_WATCHDOG_SECONDS,
        'windowsProtocolSeconds': WINDOWS_PROTOCOL_SECONDS, 'spawnSeconds': SPAWN_SECONDS,
        'initializeSeconds': INITIALIZE_SECONDS, 'cleanupPhaseSeconds': CLEANUP_PHASE_SECONDS,
        'serviceRuntimeSeconds': SERVICE_RUNTIME_SECONDS, 'serviceStopSeconds': SERVICE_STOP_SECONDS,
        'observationSeconds': OBSERVATION_SECONDS, 'leaseSeconds': 1,
        'retainedStdoutBytes': 4194304, 'retainedStderrBytes': 1048576,
        'pressureBytes': PRESSURE_BYTES, 'pressureIsNativeProtocol': False, 'scenarios': list(MODES),
        'mockOnly': True, 'nativeAdmissionGranted': False}
