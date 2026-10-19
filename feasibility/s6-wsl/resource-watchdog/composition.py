"""Fixed synthetic composition and disjoint cross-process byte allocations."""
import hashlib
import json
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
FROZEN = SOURCE.parent / 'resource-launcher'
WINDOWS = SOURCE.parent / 'consolidated-launcher'
sys.path[:0] = [str(FROZEN), str(WINDOWS), str(SOURCE.parent / 'native-preflight')]
import policy

MODES = {'valid', 'stall', 'owner-exit', 'guardian-loss'}
SLICES = {'collector': {'controller': 131072, 'stream': 32768, 'observer': 65536},
          'worker': {'controller': 393216, 'stream': 98304, 'observer': 196608}}
DEADLINE = 5
OBSERVE = 2
DEPENDENCIES = ('resource-launcher/launcher.py', 'resource-launcher/resources.py',
                'resource-launcher/deadlines.py', 'resource-launcher/fixture.py',
                'native-preflight/policy.py', 'stream-writer/writer.py',
                'private-capture-store/store.py', 'private-capture-store/winacl.py',
                'consolidated-launcher/winjob.py', 'consolidated-launcher/windows.py')


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(65536):
            digest.update(block)
    return digest.hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py')) + [SOURCE.parent / name for name in DEPENDENCIES]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def fingerprint():
    return hashlib.sha256(json.dumps(sources(), sort_keys=True).encode()).hexdigest()


class LeaseBudget:
    """Precharge the inaccessible complement; no transfers, refunds or restarts."""
    def __init__(self, role):
        if role not in SLICES:
            raise ValueError('fixed-budget-role-required')
        self.role = role
        self.ledger = policy.MetadataBudget()
        self.complement = {owner: cap - SLICES[role][owner] for owner, cap in policy.ALLOCATIONS.items()}
        for owner, size in self.complement.items():
            self.ledger.charge(owner, size)

    def charge(self, owner, size):
        self.ledger.charge(owner, size)

    def snapshot(self):
        return {owner: size - self.complement[owner] for owner, size in self.ledger.snapshot().items()}
