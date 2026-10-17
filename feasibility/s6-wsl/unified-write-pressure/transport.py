"""Bounded process observation for U0; no provider access or auth logic."""
import asyncio
import json
import math
import subprocess
import time


class ProtocolFault(ValueError):
    pass


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProtocolFault('duplicate-key')
        result[key] = value
    return result


def finite_float(value):
    number = float(value)
    if not math.isfinite(number):
        raise ProtocolFault('nonfinite-number')
    return number


def reject_constant(value):
    raise ProtocolFault('nonfinite-number')


class Handshake:
    def __init__(self, home, line_limit=262144):
        self.home = home
        self.limit = line_limit
        self.buffer = bytearray()
        self.accepted = False
        self.closed = False
        self.fault = None

    def fail(self, reason):
        self.fault = reason
        self.closed = True
        self.buffer.clear()
        raise ProtocolFault(reason)

    def packet(self, raw):
        try:
            value = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object,
                               parse_float=finite_float, parse_constant=reject_constant)
            # Reject decoded lone surrogates, including those hidden in JSON escapes.
            json.dumps(value, ensure_ascii=False).encode('utf-8')
        except (ValueError, UnicodeError, RecursionError) as error:
            self.fail('invalid-json:' + type(error).__name__)
        if self.accepted or not isinstance(value, dict):
            self.fail('unexpected-packet')
        if set(value) != {'id', 'result'} or type(value['id']) is not int or value['id'] != 1:
            self.fail('uncorrelated-or-error-response')
        result = value['result']
        fields = ['codexHome', 'platformFamily', 'platformOs', 'userAgent']
        if not isinstance(result, dict) or any(type(result.get(k)) is not str for k in fields):
            self.fail('invalid-initialize-result')
        if (result['codexHome'] != self.home or result['platformOs'] != 'linux'
                or result['platformFamily'] != 'unix' or not result['userAgent']):
            self.fail('initialize-context-mismatch')
        self.accepted = True

    def feed(self, chunk):
        if self.closed:
            self.fail('stream-already-closed')
        while chunk:
            offset = chunk.find(b'\n')
            part = chunk if offset < 0 else chunk[:offset]
            if len(self.buffer) + len(part) > self.limit:
                self.fail('line-budget')
            self.buffer.extend(part)
            if offset < 0:
                return
            record = bytes(self.buffer)
            self.buffer.clear()
            self.packet(record)
            chunk = chunk[offset + 1:]

    def eof(self):
        if self.closed:
            return
        self.closed = True
        if self.buffer or not self.accepted:
            self.fail('truncated-or-early-eof')

    def reply_allowed(self):
        return self.accepted and not self.closed and self.fault is None


def wire(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8') + b'\n'
    if len(raw) > 16384:
        raise ProtocolFault('input-budget')
    return raw


class Capture:
    """One owned direct process; callbacks supply platform identity checks."""
    def __init__(self, command, context):
        self.command, self.context = command, context
        self.raw = {key: bytearray() for key in ['stdout', 'stderr']}
        self.observed = {key: 0 for key in self.raw}
        self.result = {'fault': None, 'writes': [], 'signals': [], 'cleanupErrors': [],
                       'spawnUncertain': False, 'directChildReaped': False}
        self.failed = asyncio.Event()
        self.proc = None
        self.readers = []
        self.eof = {key: False for key in self.raw}
        self.cleanup_wait = context.get('cleanupWaitSeconds', 5)
        self.started = time.monotonic()
        self.deadline = self.started + context['seconds']

    def fail(self, reason):
        if self.result['fault'] is None:
            self.result['fault'] = reason
        self.failed.set()

    async def pump(self, name):
        try:
            while True:
                chunk = await getattr(self.proc, name).read(4096)
                if not chunk:
                    self.eof[name] = True
                    if name == 'stdout':
                        try:
                            self.context.get('eof', lambda: None)()
                        except (ValueError, UnicodeError, RecursionError) as error:
                            self.fail(str(error))
                    return
                self.observed[name] += len(chunk)
                left = self.context['limits'][name] - len(self.raw[name])
                self.raw[name].extend(chunk[:max(left, 0)])
                if len(chunk) > left:
                    self.fail(name + '-budget')
                if name == 'stdout' and not self.failed.is_set():
                    try:
                        self.context.get('feed', lambda unused: None)(chunk)
                    except (ValueError, UnicodeError, RecursionError) as error:
                        self.fail(str(error))
        except OSError as error:
            self.fail(str(error))

    async def send(self, payload):
        self.context['beforeSend']()
        item = {'bytes': len(payload), 'state': 'attempted'}
        self.result['writes'].append(item)
        try:
            self.proc.stdin.write(payload)
            item['bufferBytesAfterWrite'] = self.proc.stdin.transport.get_write_buffer_size()
            item['highWater'] = self.proc.stdin.transport.get_write_buffer_limits()[1]
            await self.proc.stdin.drain()
            item['bufferBytesAfterDrain'] = self.proc.stdin.transport.get_write_buffer_size()
            item['state'] = 'locally-drained'
        except (OSError, ConnectionError):
            item['state'] = 'uncertain-write'
            raise ProtocolFault('write-failed')
        except asyncio.CancelledError:
            item['state'] = 'uncertain-write-cancelled'
            raise

    async def activity(self):
        await self.send(self.context['initial'])
        if self.context.get('closeInitial'):
            self.proc.stdin.close()
        ready = self.context.get('ready')
        while ready and not ready():
            self.context.get('tick', lambda: None)()
            if self.failed.is_set() or self.readers[0].done():
                raise ProtocolFault('response-not-available')
            await asyncio.sleep(0.005)
        if self.failed.is_set():
            raise ProtocolFault('stream-failed-before-notification')
        if self.context.get('second') is not None:
            if not self.context['allowed']():
                raise ProtocolFault('notification-revoked')
            await self.send(self.context['second'])
        if self.context.get('pressurePayload') is not None:
            await self.send_pressure(self.context['pressurePayload'])
            raise ProtocolFault('pressure-drained-before-intervention')
        while True:
            self.context['tick']()
            if self.readers[0].done():
                raise ProtocolFault('transport-ended')
            await asyncio.sleep(0.005)

    async def send_pressure(self, payload):
        self.context['pressureBegin']()
        item = {'bytes': len(payload), 'state': 'attempted'}
        self.result['writes'].append(item)
        drain_task = None
        started = asyncio.Event()

        async def drain_started():
            started.set()
            await self.proc.stdin.drain()

        try:
            pipe = self.proc.stdin.transport
            self.proc.stdin.write(payload)
            drain_task = asyncio.create_task(drain_started())
            low, high = pipe.get_write_buffer_limits()
            samples = []
            for unused in range(2):
                await asyncio.sleep(0)
                size = pipe.get_write_buffer_size()
                if not started.is_set() or drain_task.done() or size <= high:
                    if drain_task.done():
                        await drain_task
                    item['state'] = 'uncertain-write'
                    raise ProtocolFault('pressure-not-observed')
                samples.append({'bufferBytes': size, 'observedMonotonic': time.monotonic()})
            witness = {'bytes': len(payload), 'lowWater': low, 'highWater': high,
                'drainStarted': True, 'drainPending': True, 'samples': samples,
                'plumbingOnly': True, 'nativeProtocolFrame': False}
            self.result['pressureWitness'] = witness
            self.context['pressureReady'](witness)
            await drain_task
            item['state'] = 'locally-drained'
        except (OSError, ConnectionError):
            item['state'] = 'uncertain-write'
            raise ProtocolFault('write-failed')
        except asyncio.CancelledError:
            item['state'] = 'uncertain-write-cancelled'
            raise
        finally:
            self.result['pressureOutcomeMonotonic'] = time.monotonic()
            if drain_task is not None:
                if not drain_task.done():
                    drain_task.cancel()
                await asyncio.gather(drain_task, return_exceptions=True)

    async def watch_control(self):
        while True:
            self.context.get('tick', lambda: None)()
            if self.readers[0].done():
                raise ProtocolFault('transport-ended')
            await asyncio.sleep(0.005)

    async def work(self):
        action = asyncio.create_task(self.activity())
        failed = asyncio.create_task(self.failed.wait())
        watcher = asyncio.create_task(self.watch_control())
        try:
            done, _ = await asyncio.wait([action, failed, watcher],
                timeout=min(self.context['workSeconds'], self.remaining(3 * self.cleanup_wait)),
                return_when=asyncio.FIRST_COMPLETED)
            if not done:
                self.fail('work-deadline')
            elif action in done:
                action.result()
            elif watcher in done:
                self.result['controlObservedMonotonic'] = time.monotonic()
                watcher.result()
        except (OSError, ProtocolFault) as error:
            self.fail(str(error))
        finally:
            for task in [action, failed, watcher]:
                if not task.done():
                    task.cancel()
            await asyncio.gather(action, failed, watcher, return_exceptions=True)

    def remaining(self, reserve=0):
        return max(0, self.deadline - time.monotonic() - reserve)

    async def wait_exit(self):
        try:
            await asyncio.wait_for(asyncio.shield(self.waiter), min(self.cleanup_wait, self.remaining()))
            return True
        except asyncio.TimeoutError:
            return False

    async def cleanup(self):
        try:
            if self.context.get('pressurePayload') is not None:
                self.result['stdinPendingBytesBeforeAbort'] = self.proc.stdin.transport.get_write_buffer_size()
                self.proc.stdin.transport.abort()
                self.result['stdinAbortRequested'] = True
            await self.context['beforeCleanup']()
        except (OSError, ValueError, subprocess.TimeoutExpired, asyncio.TimeoutError) as error:
            self.result['cleanupErrors'].append('before-cleanup:' + type(error).__name__)
            self.fail('before-cleanup-failed')
        finally:
            await self.cleanup_process()

    async def cleanup_process(self):
        self.proc.stdin.close()
        for kind in ['eof', 'term', 'kill']:
            if self.remaining() <= 0:
                self.fail('cleanup-deadline')
                break
            if kind != 'eof' and self.proc.returncode is None:
                try:
                    outcome = self.context['signal'](self.proc, kind)
                    self.result['signals'].append(outcome)
                except (OSError, ValueError) as error:
                    self.result['cleanupErrors'].append(type(error).__name__)
            if await self.wait_exit():
                break
        await asyncio.wait(self.readers, timeout=min(0.1, self.remaining()))
        self.result['directChildReaped'] = self.proc.returncode is not None
        self.result['returnCode'] = self.proc.returncode
        self.result['readerEof'] = dict(self.eof)
        if self.proc.returncode is None:
            self.fail('direct-child-cleanup-unverified')
        elif self.proc.returncode != 0:
            self.fail('nonzero-exit')

    async def finish(self):
        for task in self.readers:
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.readers, return_exceptions=True)
        if self.proc is not None:
            # asyncio exposes no public StreamReader close; fixed CPython tooling only.
            for stream in [self.proc.stdout, self.proc.stderr]:
                try:
                    stream._transport.close()
                except (OSError, RuntimeError, AttributeError) as error:
                    self.result['cleanupErrors'].append('pipe-close:' + type(error).__name__)
                    self.fail('local-pipe-cleanup-failed')
            try:
                self.proc.stdin.close()
                await asyncio.wait_for(self.proc.stdin.wait_closed(),
                    min(self.cleanup_wait, self.remaining()))
            except (BrokenPipeError, ConnectionResetError) as error:
                uncertain = self.result['writes'] and self.result['writes'][-1]['state'] in {
                    'uncertain-write', 'uncertain-write-cancelled'}
                pipe = self.proc.stdin.transport
                if (self.context.get('pressurePayload') is not None and uncertain
                        and self.proc.returncode is not None and all(self.eof.values())
                        and pipe.is_closing() and pipe.get_write_buffer_size() == 0):
                    # Peer failure is the measured write outcome; retain it separately
                    # after independently accounting for closure and child exit.
                    self.result['stdinClosePeerError'] = type(error).__name__
                    self.result['stdinClosedAfterPeerError'] = True
                else:
                    self.result['cleanupErrors'].append('stdin-close:' + type(error).__name__)
                    self.fail('local-pipe-cleanup-failed')
            except (OSError, RuntimeError, AttributeError, asyncio.TimeoutError) as error:
                self.result['cleanupErrors'].append('stdin-close:' + type(error).__name__)
                self.fail('local-pipe-cleanup-failed')
            if not self.waiter.done():
                self.waiter.cancel()
            await asyncio.gather(self.waiter, return_exceptions=True)
        self.result.update(elapsedSeconds=time.monotonic() - self.started,
            observedBytes=self.observed, retainedBytes={k: len(v) for k, v in self.raw.items()},
            discardedBytes={k: self.observed[k] - len(v) for k, v in self.raw.items()})

    async def run(self):
        spawn = asyncio.create_task(asyncio.create_subprocess_exec(*self.command,
            cwd=self.context['cwd'], env=self.context['env'], limit=4096,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE))
        try:
            try:
                self.proc = await asyncio.wait_for(asyncio.shield(spawn),
                    min(self.context['spawnSeconds'], self.remaining(3 * self.cleanup_wait)))
            except asyncio.TimeoutError:
                self.result['spawnUncertain'] = True
                self.fail('spawn-timeout')
                spawn.cancel()
                await asyncio.gather(spawn, return_exceptions=True)
                return self.result, self.raw
            self.waiter = asyncio.create_task(self.proc.wait())
            self.readers = [asyncio.create_task(self.pump(n)) for n in self.raw]
            try:
                self.context.get('spawned', lambda unused: None)(self.proc.pid)
                await self.work()
            finally:
                await self.cleanup()
        except (OSError, ValueError) as error:
            self.fail(type(error).__name__ + ':' + str(error))
        finally:
            await self.finish()
        return self.result, {key: bytes(value) for key, value in self.raw.items()}


async def observe(command, context):
    return await Capture(command, context).run()
