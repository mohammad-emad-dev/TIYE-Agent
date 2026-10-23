"""Bind a new composed fixture to immutable Windows guardian/accounting code."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
CHARGED = SOURCE.parent / 'charged-wsl'
WATCHDOG = SOURCE.parent / 'resource-watchdog'
sys.path.append(str(WATCHDOG))
spec = importlib.util.spec_from_file_location('observed_partition_binding', CHARGED / 'composition.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)
LeaseBudget, SLICES, policy, sha = frozen.LeaseBudget, frozen.SLICES, frozen.policy, frozen.sha
MODES, DEADLINE, OBSERVE = frozen.MODES, frozen.DEADLINE, frozen.OBSERVE


def sources():
    paths = list(SOURCE.glob('*.py'))
    paths += [SOURCE.parent / name for name in (
        'startup-observer/observer.py', 'native-inventory/linux.py', 'observed-u0/extension.py',
        'limited-observer/build.py', 'limited-observer/extension.py', 'limited-observer/mount.py',
        'limited-observer/case.py', 'retention-broker/broker.py', 'scheduled-wsl/bindings.py',
        'scheduled-wsl/adapter.py', 'scheduled-wsl/runtime.py', 'deadline-recovery/coordinator.py',
        'supervised-broker/build.py', 'supervised-broker/extension.py',
        'unknown-keeper/build.py', 'unknown-keeper/holding.py', 'unknown-keeper/probe.py',
        'scheduled-unknown/build.py', 'scheduled-unknown/observer.py', 'scheduled-unknown/case.py',
        'prebound-recovery/build.py', 'prebound-recovery/observer.py',
        'enrollment-interruption/build.py', 'enrollment-interruption/reconcile.py',
        'enrollment-interruption/fault_probe.py', 'shutdown-evidence/lease.py',
        'supervised-shutdown/build.py', 'supervised-shutdown/shutdown.py', 'supervised-shutdown/case.py',
        'uncertain-shutdown/build.py', 'uncertain-shutdown/custody.py', 'uncertain-shutdown/probe.py',
        'uncertain-shutdown/case.py', 'prebound-recovery/case.py', 'supervised-broker/case.py', 'custody-recovery/build.py', 'custody-recovery/inspector.py',
        'custody-recovery/probe.py', 'custody-recovery/case.py')]
    return frozen.sources() | {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def fingerprint():
    return hashlib.sha256(json.dumps(sources(), sort_keys=True).encode()).hexdigest()
