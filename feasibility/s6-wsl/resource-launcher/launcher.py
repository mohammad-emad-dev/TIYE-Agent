"""Synthetic direct children only; no WSL, process-tree or native admission."""
import asyncio
import os
import sys
import time

from deadlines import PhaseClock
from resources import BudgetCapture, MetadataFiles, SOURCE, policy, writer

SCENARIOS = {'valid', 'overflow', 'timeout'}


class SyntheticRun:
    def __init__(self, scenario):
        if scenario not in SCENARIOS:
            raise ValueError('synthetic-scenario-required')
        self.scenario = scenario
        self.clock = PhaseClock()
        self.clock.enter('host-start')
        self.budget = policy.MetadataBudget()
        self.capture = BudgetCapture(self.budget)
        try:
            self.files = MetadataFiles(self.capture, self.budget)
        except (OSError, ValueError):
            self.capture.close()
            raise
        self.children = {}
        self.spawns = {}
        self.pumps = []
        self.fault = None
        self.fault_event = asyncio.Event()
        self.response = asyncio.Event()
        self.signals = []
        self.diagnostic_discarded = 0
        self.work_revoked = False

    def fail(self, reason):
        if self.fault is None:
            self.fault = reason
        self.fault_event.set()
        self.work_revoked = True
        self.capture._fault(reason)

    async def spawn(self, role):
        if (self.work_revoked or role not in ('protocol', 'observer')
                or self.clock.schedule.remaining(time.monotonic()) <= 0):
            raise ValueError('spawn-revoked-expired-or-unknown-role')
        env = {name: os.environ[name] for name in ('SystemRoot', 'WINDIR') if name in os.environ}
        child = await asyncio.create_subprocess_exec(
            sys.executable, '-I', '-B', '-u', str(SOURCE / 'fixture.py'), role, self.scenario,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, env=env, limit=16384)
        self.children[role] = child
        for name in ('stdout', 'stderr'):
            self.pumps.append(asyncio.create_task(self.pump(role, name)))
        return child

    async def pump(self, role, name):
        try:
            while True:
                payload = await getattr(self.children[role], name).read(writer.CHUNK)
                if not payload:
                    if role == 'protocol':
                        self.capture.eof(name)
                    return
                if role == 'observer':
                    self.persist_diagnostic(name, payload)
                else:
                    self.capture.feed(name, payload)
                    if self.capture.stop.is_set():
                        self.fail('raw-capture-fault')
                    if name == 'stdout':
                        self.response.set()
        except (OSError, ValueError):
            self.fail('pipe-or-persistence-fault')

    def persist_diagnostic(self, name, payload):
        if self.fault:
            self.diagnostic_discarded += len(payload)
            return
        try:
            self.files.write('observer', name + '.bin', payload)
        except (OSError, ValueError):
            self.fail('diagnostic-persistence-fault')
            # A failed write may have persisted a prefix; do not label it discarded.

    async def start(self):
        if self.clock.schedule.remaining(time.monotonic()) <= 0:
            raise TimeoutError('host-start-expired')
        self.files.write('controller', 'attempt.json', writer.encode({'scenario': self.scenario}))
        self.spawns['observer'] = asyncio.create_task(self.spawn('observer'))
        _, pending = await self.clock.wait(set(self.spawns.values()))
        if pending:
            raise TimeoutError('host-start-expired')
        self.spawns['observer'].result()
        if self.fault:
            return
        if self.clock.enter('child-start') <= 0:
            raise TimeoutError('child-start-expired')
        self.spawns['protocol'] = asyncio.create_task(self.spawn('protocol'))
        _, pending = await self.clock.wait({self.spawns['protocol']})
        if pending:
            raise TimeoutError('child-start-expired')
        self.spawns['protocol'].result()

    async def initialize(self):
        if self.fault:
            return
        if self.clock.enter('initialize') <= 0:
            raise TimeoutError('initialize-expired')
        child = self.children['protocol']
        child.stdin.write(b'initialize\n')
        drain = asyncio.create_task(child.stdin.drain())
        response = asyncio.create_task(self.response.wait())
        fault = asyncio.create_task(self.fault_event.wait())
        try:
            pending = {drain, response, fault}
            while not self.fault:
                done, pending = await self.clock.wait(pending, first=True)
                if not done:
                    self.fail('initialize-expired')
                    return
                if drain in done:
                    drain.result()
                if drain.done() and response.done():
                    return
        finally:
            for task in (drain, response, fault):
                if not task.done():
                    task.cancel()

    async def settle(self):
        pending = {task for task in self.spawns.values() if not task.done()}
        if pending:
            await self.clock.wait(pending)
        for task in self.spawns.values():
            if task.done():
                try:
                    task.result()
                except (OSError, ValueError):
                    self.fail('spawn-failed')
        waits = {asyncio.create_task(child.wait()) for child in self.children.values()}
        _, pending = await self.clock.wait(waits | set(self.pumps))
        for task in pending & waits:
            task.cancel()

    async def cleanup(self):
        self.work_revoked = True
        for phase in ('eof', 'term', 'kill'):
            remaining = self.clock.enter(phase)
            if remaining > 0:
                for role, child in self.children.items():
                    if self.clock.schedule.remaining(time.monotonic()) <= 0:
                        break
                    if phase == 'eof':
                        child.stdin.close()
                    elif child.returncode is None:
                        try:
                            getattr(child, 'terminate' if phase == 'term' else 'kill')()
                            self.signals.append({'role': role, 'phase': phase})
                        except ProcessLookupError:
                            pass
                await self.settle()
            if all(task.done() for task in self.spawns.values()) and all(
                    child.returncode is not None for child in self.children.values()) and all(
                    task.done() for task in self.pumps):
                break
        self.clock.enter('observe')
        if any(not task.done() for task in self.pumps):
            self.fail('unsettled-child-or-pipe')
        _, pending = await self.clock.wait(set(self.pumps))
        for task in pending:
            task.cancel()
        return not pending and all(task.done() for task in self.spawns.values()) and all(
            child.returncode is not None for child in self.children.values())

    async def run(self):
        reaped = False
        try:
            try:
                await self.start()
                await self.initialize()
            except (OSError, ValueError, TimeoutError):
                self.fail('startup-or-work-fault')
            finally:
                reaped = await self.cleanup()
            if not reaped:
                self.fail('unsettled-child-or-pipe')
            if any(child.returncode != 0 for child in self.children.values()) and not self.fault:
                self.fail('nonzero-child')
            if not self.fault:
                self.capture.finish()
            state = self.result(reaped)
            self.files.write('controller', 'outcome.json', writer.encode(state))
            sizes = self.files.audit()
            return state | {'finalMetadataBytes': sizes, 'chargedMetadataBytes': self.budget.snapshot()}
        finally:
            try:
                self.files.close()
            finally:
                self.capture.close()

    def result(self, reaped):
        return {'scenario': self.scenario, 'fault': self.fault,
                'directChildrenReapedAndPipesDrained': reaped,
                'storageCompleted': self.capture.completed,
                'diagnosticDiscardedBytes': self.diagnostic_discarded,
                'signals': self.signals, 'phases': self.clock.events,
                'workRevoked': self.work_revoked,
                'elapsedSeconds': time.monotonic() - self.clock.schedule.origin,
                'nativeExecutionAllowed': False, 'processTreeQualified': False}
