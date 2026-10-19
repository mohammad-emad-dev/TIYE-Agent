"""Source-bound wiring into the immutable Windows guardian and accounting code."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
WATCHDOG = SOURCE.parent / 'resource-watchdog'
sys.path.append(str(WATCHDOG))
spec = importlib.util.spec_from_file_location('frozen_partition_policy', WATCHDOG / 'composition.py')
partition_policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(partition_policy)
LeaseBudget, SLICES, policy = partition_policy.LeaseBudget, partition_policy.SLICES, partition_policy.policy
MODES = {'stall', 'owner-exit', 'guardian-loss'}
DEADLINE, OBSERVE = 5, 2


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(65536):
            digest.update(chunk)
    return digest.hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py')) + list(WATCHDOG.glob('*.py'))
    paths += [SOURCE.parent / name for name in partition_policy.DEPENDENCIES]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(set(paths))}


def fingerprint():
    return hashlib.sha256(json.dumps(sources(), sort_keys=True).encode()).hexdigest()
