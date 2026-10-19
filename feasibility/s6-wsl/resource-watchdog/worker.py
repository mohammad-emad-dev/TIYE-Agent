"""Fixed synthetic worker; intentional stalls exercise the independent guardian."""
import asyncio
import contextlib
import os
from pathlib import Path
import sys
import time
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import composition
from control import ControlRecords, PublicationPending, parameters
from deadlines import PhaseClock
from launcher import SyntheticRun
from resources import BudgetCapture, MetadataFiles, writer
import windows


class WorkerRun(SyntheticRun):
    def __init__(self, mode, controls):
        # Immutable predecessor has no budget injection. Revisit this explicit
        # state initialization when replacing that frozen feasibility API.
        self.scenario = 'valid' if mode == 'valid' else 'timeout'
        self.mode, self.controls = mode, controls
        self.clock = PhaseClock()
        self.clock.enter('host-start')
        self.budget = controls.budget
        self.capture = BudgetCapture(self.budget)
        try:
            self.files = MetadataFiles(self.capture, self.budget)
        except (OSError, ValueError):
            self.capture.close()
            raise
        self.children, self.spawns, self.pumps = {}, {}, []
        self.fault = None
        self.fault_event, self.response = asyncio.Event(), asyncio.Event()
        self.signals, self.diagnostic_discarded, self.work_revoked = [], 0, False

    async def start(self):
        self.controls.write('intent.json', {'uncertain': True, 'automaticDeletion': False,
                            'captureRoot': str(self.capture.storage.path), 'mode': self.mode})
        await super().start()
        self.controls.write('ready.json', {'mode': self.mode,
            'root': windows.identity(os.getpid(), self.controls.nonce),
            'protocol': windows.identity(self.children['protocol'].pid, self.controls.nonce)})
        if self.mode in ('stall', 'guardian-loss'):
            time.sleep(95)
        elif self.mode == 'owner-exit':
            await self.wait_release()
            os._exit(17)

    async def wait_release(self):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            try:
                record = self.controls.read('release.json')
            except (FileNotFoundError, PublicationPending):
                await asyncio.sleep(0.01)
                continue
            if record != {'nonce': self.controls.nonce, 'composition': composition.fingerprint(),
                          'action': 'exit-owner'}:
                raise ValueError('release-action')
            return
        raise TimeoutError('release-not-received')


async def execute(mode, controls):
    run = WorkerRun(mode, controls)
    report = await run.run()
    controls.write('result.json', {'mode': mode, 'report': report,
                                 'chargedBytesBeforeResult': run.budget.snapshot()})


def main():
    mode, directory, nonce, binding = sys.argv[1:]
    parameters(mode, nonce, binding)
    budget = composition.LeaseBudget('worker')
    with contextlib.ExitStack() as handles:
        root = Path(directory)
        writer.store.pin_ancestors(handles, root.parent)
        handle = writer.store.pin_directory(handles, root)
        owner = writer.winacl.current_sid()
        writer.winacl.verify_directory(handle, owner)
        storage = SimpleNamespace(path=root, handle=handle, owner=owner)
        asyncio.run(execute(mode, ControlRecords(storage, budget, nonce)))


if __name__ == '__main__':
    main()
