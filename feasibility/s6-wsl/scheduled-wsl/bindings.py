"""Load sealed components by exact path; do not change their source bindings."""
import importlib.util
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
CHARGED = SOURCE.parent / 'charged-wsl'
sys.path.append(str(CHARGED))
import composition
import cohort

if (composition.SOURCE != CHARGED or Path(cohort.__file__).resolve() != CHARGED / 'cohort.py'
        or cohort.composition is not composition):
    raise RuntimeError('charged-runtime-module-binding')

COORDINATOR = SOURCE.parent / 'deadline-recovery/coordinator.py'
spec = importlib.util.spec_from_file_location('scheduled_deadline_coordinator', COORDINATOR)
deadlines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deadlines)


def sources():
    paths = list(SOURCE.glob('*.py')) + [COORDINATOR, deadlines.POLICY_PATH]
    return composition.sources() | {
        path.relative_to(ROOT).as_posix(): composition.sha(path) for path in sorted(paths)}
