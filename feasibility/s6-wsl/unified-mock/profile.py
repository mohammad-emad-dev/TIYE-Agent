"""Frozen mock profile; no native executable is admitted."""
WINDOWS_WATCHDOG_SECONDS = 90
WINDOWS_PROTOCOL_SECONDS = 75
SPAWN_SECONDS = 30
INITIALIZE_SECONDS = 15
CLEANUP_PHASE_SECONDS = 5
SERVICE_RUNTIME_SECONDS = 60
SERVICE_STOP_SECONDS = 5
OBSERVATION_SECONDS = 15
MODES = ('valid', 'foreign', 'invalid-raw')


def manifest():
    return {'windowsWatchdogSeconds': WINDOWS_WATCHDOG_SECONDS,
        'windowsProtocolSeconds': WINDOWS_PROTOCOL_SECONDS, 'spawnSeconds': SPAWN_SECONDS,
        'initializeSeconds': INITIALIZE_SECONDS, 'cleanupPhaseSeconds': CLEANUP_PHASE_SECONDS,
        'serviceRuntimeSeconds': SERVICE_RUNTIME_SECONDS, 'serviceStopSeconds': SERVICE_STOP_SECONDS,
        'observationSeconds': OBSERVATION_SECONDS, 'leaseSeconds': 1,
        'retainedStdoutBytes': 4194304, 'retainedStderrBytes': 1048576,
        'mockOnly': True, 'nativeAdmissionGranted': False}
