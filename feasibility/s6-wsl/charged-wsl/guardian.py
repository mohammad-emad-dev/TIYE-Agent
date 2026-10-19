"""Reuse the measured guardian with this fixed composition, without editing it."""
import importlib.util
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import composition

spec = importlib.util.spec_from_file_location('frozen_windows_guardian', composition.WATCHDOG / 'guardian.py')
guardian = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guardian)
if guardian.composition is not composition:
    raise RuntimeError('guardian-composition-not-bound')

if __name__ == '__main__':
    raise SystemExit(guardian.supervise(*sys.argv[1:]))
