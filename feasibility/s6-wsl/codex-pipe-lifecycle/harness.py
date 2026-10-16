"""Pipe/process lifetime and blocked-writer observations for fixed mocks only."""
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'codex-framing'))
from framing import OfflineConnection, ReplayError
from synthetic_peer import MODES, PROBE, wire

SOURCE = Path(__file__).resolve().parent
ARCHIVE = SOURCE.parents[2] / 'output/s4-codex-schema/schemas.zip'
LIMITS = {'stdout': 8192, 'stderr': 4096}
PAYLOAD_BYTES = 1048576


class FixtureFault(Exception):
    pass


async def run_case(mode, deadline=1.5):
    if mode not in MODES:
        raise ValueError('unknown-fixture-mode')
    connection = OfflineConnection(ARCHIVE)
    proc = await asyncio.create_subprocess_exec(
        sys.executable, '-I', '-B', '-X', 'utf8', '-u', str(SOURCE / 'synthetic_peer.py'), mode,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, limit=4096)
    started = time.monotonic()
    proc.stdin.transport.set_write_buffer_limits(high=16384, low=8192)
    trigger = asyncio.Event()
    raw = {n: bytearray() for n in LIMITS}
    observed = {n: 0 for n in LIMITS}
    events, cleanup_errors, writes = [], [], []
    receipt, stdout_eof, ack_after_eof = None, False, False
    diagnostic = bytearray()
    fault, killed = None, False
    writer_state = 'waiting-for-trigger'
    writer_task = None

    def event(kind, **fields):
        events.append({'event': kind, 'elapsedSeconds': time.monotonic() - started, **fields})

    def pending_output(source):
        queued = proc.stdin.transport.get_write_buffer_size()
        if writer_state == 'drain-pending' and queued > 0:
            event('output-read-while-drain-pending', source=source, queuedBytes=queued,
                  observedBytes=observed[source], writerTaskDone=writer_task.done())

    async def writer():
        nonlocal writer_state
        await trigger.wait()
        payload = b'W' * PAYLOAD_BYTES if mode == 'blocked-writer' else wire(PROBE)
        attempt = {'kind': 'blocked-input-fault' if mode == 'blocked-writer' else 'post-eof-control-probe',
                   'byteCount': len(payload), 'state': 'attempted'}
        writes.append(attempt)
        try:
            proc.stdin.write(payload)
            writer_state = 'drain-pending'
            event('drain-entered', queuedBytes=proc.stdin.transport.get_write_buffer_size())
            await proc.stdin.drain()
            writer_state = 'locally-drained'
            attempt['state'] = writer_state
            event('drain-returned')
        except asyncio.CancelledError:
            writer_state = 'uncertain-write-cancelled'
            attempt['state'] = writer_state
            event('writer-cancelled')
            raise
        except (OSError, ConnectionError) as error:
            writer_state = 'uncertain-write-error'
            attempt.update(state=writer_state, errorType=type(error).__name__)
            raise FixtureFault('write-failed') from error

    async def pump(name, reader):
        nonlocal receipt, stdout_eof, ack_after_eof
        while True:
            chunk = await reader.read(7 if name == 'stdout' else 4096)
            if not chunk:
                if name == 'stdout':
                    stdout_eof = True
                    event('stdout-eof-observed', peerReturnCode=proc.returncode)
                    if connection.open:
                        event('policy-disconnect', source='stdout-eof', result=connection.disconnect())
                    if receipt is not None:
                        try:
                            connection.decide(7, 'decline', receipt['fingerprint'])
                        except ReplayError as error:
                            event('post-eof-reply-refused', reason=str(error))
                    if mode != 'blocked-writer':
                        trigger.set()
                return
            observed[name] += len(chunk)
            remaining = LIMITS[name] - len(raw[name])
            raw[name].extend(chunk[:remaining])
            if len(chunk) > remaining:
                raise FixtureFault(name + '-budget-exceeded')
            if name == 'stdout':
                incoming = connection.feed(chunk)
                for received in incoming:
                    event('policy-receive', result=received)
                    if received['event'] == 'approval-pending':
                        receipt = received
                    if received['event'] == 'stream-failed':
                        raise FixtureFault(received['reason'])
                    if mode == 'blocked-writer' and received['event'] == 'unmodeled-method':
                        trigger.set()
                if incoming:
                    pending_output('stdout')
            else:
                diagnostic.extend(chunk)
                while b'\n' in diagnostic:
                    line, _, tail = diagnostic.partition(b'\n')
                    diagnostic[:] = tail
                    value = json.loads(line)
                    if value == {'event': 'probe-observed', 'probe': PROBE}:
                        ack_after_eof = stdout_eof
                        event('probe-acknowledgement', afterStdoutEof=stdout_eof,
                              peerReturnCode=proc.returncode)
                pending_output('stderr')

    async def wait_peer():
        code = await proc.wait()
        event('peer-exit-observed', returnCode=code)

    tasks = []
    try:
        async def activity():
            nonlocal writer_task
            writer_task = asyncio.create_task(writer())
            tasks.extend([asyncio.create_task(pump('stdout', proc.stdout)),
                          asyncio.create_task(pump('stderr', proc.stderr)),
                          writer_task, asyncio.create_task(wait_peer())])
            await asyncio.gather(*tasks)
        await asyncio.wait_for(activity(), timeout=deadline)
    except asyncio.TimeoutError:
        fault = 'activity-deadline'
    except (FixtureFault, OSError, ValueError) as error:
        fault = str(error) if isinstance(error, FixtureFault) else type(error).__name__
    finally:
        if connection.open:
            event('policy-disconnect', source='local-abort', result=connection.disconnect())
        if proc.returncode is None:
            try:
                proc.kill()
                killed = True
                event('direct-child-kill-requested')
            except ProcessLookupError:
                pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=2)
        except asyncio.TimeoutError:
            cleanup_errors.append('direct-child-wait-timeout')
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            proc.stdin.close()
            await asyncio.wait_for(proc.stdin.wait_closed(), timeout=1)
        except (OSError, ConnectionError):
            pass
        except asyncio.TimeoutError:
            proc.stdin.transport.abort()
            cleanup_errors.append('stdin-close-timeout')
    result = {'mode': mode, 'pid': proc.pid, 'returnCode': proc.returncode,
        'deadlineSecondsAfterSpawn': deadline, 'elapsedSecondsAfterSpawn': time.monotonic() - started,
        'fault': fault, 'killRequested': killed, 'directChildReaped': proc.returncode is not None,
        'ioTasksSettled': all(t.done() for t in tasks), 'cleanupErrors': cleanup_errors,
        'observedBytes': observed, 'retainedBytes': {n: len(v) for n, v in raw.items()},
        'limits': LIMITS, 'writerState': writer_state, 'writes': writes,
        'stdoutEofObserved': stdout_eof, 'probeAcknowledgedAfterEof': ack_after_eof,
        'writeBufferLowHigh': list(proc.stdin.transport.get_write_buffer_limits()),
        'events': events, **connection.snapshot(), 'outcome': 'needs-attention'}
    return result, {n: bytes(v) for n, v in raw.items()}
