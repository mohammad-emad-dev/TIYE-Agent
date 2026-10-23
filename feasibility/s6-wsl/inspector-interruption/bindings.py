"""Canonical imports bind the sealed schedule and collector to the new source set."""
import importlib.util
from pathlib import Path
import sys

import composition
ROOT, sources = composition.ROOT, composition.sources
sys.path.append(str(composition.CHARGED))
import cohort

if Path(cohort.__file__).resolve() != composition.CHARGED / 'cohort.py' or cohort.composition is not composition:
    raise RuntimeError('observed-collector-binding')
path = composition.SOURCE.parent / 'deadline-recovery/coordinator.py'
spec = importlib.util.spec_from_file_location('observed_deadline_coordinator', path)
deadlines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deadlines)
sys.path.append(str(composition.SOURCE.parent / 'scheduled-wsl'))
import adapter
import runtime
if (Path(adapter.__file__).resolve() != composition.SOURCE.parent / 'scheduled-wsl/adapter.py'
        or Path(runtime.__file__).resolve() != composition.SOURCE.parent / 'scheduled-wsl/runtime.py'):
    raise RuntimeError('observed-schedule-adapter-binding')
