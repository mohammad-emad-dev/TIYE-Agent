"""Frozen Windows heartbeat owner, bound to the new composed Linux fixture."""
import importlib.util
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import composition
spec = importlib.util.spec_from_file_location('observed_windows_worker', composition.CHARGED / 'worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
if worker.composition is not composition:
    raise RuntimeError('worker-composition-binding')
if __name__ == '__main__':
    worker.main()
