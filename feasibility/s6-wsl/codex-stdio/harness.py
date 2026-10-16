"""Native direct-child pipe fixture; intentionally no generic CLI launcher."""
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'codex-framing'))
from framing import OfflineConnection, ReplayError
from peer import MODES, START, wire

SOURCE = Path(__file__).resolve().parent
ARCHIVE = SOURCE.parents[2] / 'output/s4-codex-schema/schemas.zip'
LIMITS = {'stdout': 8192, 'stderr': 4096}


class FixtureFault(Exception):
    pass


async def run_case(mode, deadline=1.5):
    if mode not in MODES:
        raise ValueError('unknown-fixture-mode')
    connection = OfflineConnection(ARCHIVE)
    raw = {name: bytearray() for name in LIMITS}
    observed = {name: 0 for name in LIMITS}
    reads = {name: 0 for name in LIMITS}
    events, writes, cleanup_errors = [], [], []
    receipt = None
    proc = await asyncio.create_subprocess_exec(
        sys.executable, '-I', '-B', '-X', 'utf8', '-u', str(SOURCE / 'peer.py'), mode,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, limit=4096)
    started = time.monotonic()
    fault, killed = None, False

    async def send(payload, kind, close_after=False):
        # A successful drain is only local flow-control progress, not peer acceptance.
        record = {'kind': kind, 'byteCount': len(payload), 'state': 'attempted'}
        writes.append(record)
        try:
            proc.stdin.write(payload)
            await proc.stdin.drain()
            if close_after:
                proc.stdin.close()
                await proc.stdin.wait_closed()
            record['state'] = 'locally-drained'
        except (OSError, ConnectionError) as error:
            record.update(state='uncertain-write', errorType=type(error).__name__)
            raise FixtureFault('write-failed') from error
        except asyncio.CancelledError:
            record['state'] = 'uncertain-write-cancelled'
            raise

    async def pump(name, reader):
        nonlocal receipt
        while True:
            chunk = await reader.read(7 if name == 'stdout' else 4096)
            if not chunk:
                if name == 'stdout' and connection.open:
                    terminal = connection.disconnect()
                    events.append({'source': 'stdout-eof', **terminal})
                    if terminal['event'] == 'stream-failed':
                        raise FixtureFault(terminal['reason'])
                    if receipt is not None:
                        try:
                            connection.decide(7, 'decline', receipt['fingerprint'])
                        except ReplayError as error:
                            events.append({'event': 'post-eof-reply-refused', 'reason': str(error)})
                return
            reads[name] += 1
            observed[name] += len(chunk)
            remaining = LIMITS[name] - len(raw[name])
            raw[name].extend(chunk[:remaining])
            if len(chunk) > remaining:
                raise FixtureFault(name + '-budget-exceeded')
            if name == 'stderr':
                continue
            incoming = connection.feed(chunk)
            events.extend(incoming)
            for event in incoming:
                if event['event'] == 'stream-failed':
                    raise FixtureFault(event['reason'])
                if event['event'] == 'approval-pending':
                    receipt = event
                    if mode == 'roundtrip':
                        if any(w['kind'] == 'synthetic-denial' for w in writes):
                            raise FixtureFault('unexpected-extra-approval')
                        reply = connection.decide(7, 'decline', receipt['fingerprint'])
                        events.append(reply)
                        await send(wire(reply['reply']), 'synthetic-denial')
                if mode == 'broken-stdin' and event['event'] == 'unmodeled-method':
                    # Peer has closed its input before emitting the only barrier record.
                    await send(b'x' * 65536, 'closed-input-fault-injection', close_after=True)
                    raise FixtureFault('write-failure-not-observed')

    tasks = []
    try:
        async def activity():
            if mode == 'roundtrip':
                await send(wire(START), 'public-start')
            tasks.extend([asyncio.create_task(pump('stdout', proc.stdout)),
                          asyncio.create_task(pump('stderr', proc.stderr)),
                          asyncio.create_task(proc.wait())])
            await asyncio.gather(*tasks)
        await asyncio.wait_for(activity(), timeout=deadline)
    except asyncio.TimeoutError:
        fault = 'activity-deadline'
    except (FixtureFault, OSError) as error:
        fault = str(error) if isinstance(error, FixtureFault) else type(error).__name__
    finally:
        if fault and connection.open:
            events.append({'source': 'local-abort', **connection.disconnect()})
        if proc.returncode is None:
            try:
                proc.kill()
                killed = True
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
            pass  # Expected when peer closed stdin; send records write uncertainty.
        except asyncio.TimeoutError:
            proc.stdin.transport.abort()
            cleanup_errors.append('stdin-close-timeout')
    if proc.returncode not in (None, 0) and fault is None:
        fault = 'nonzero-peer-exit'
    result = {'mode': mode, 'pid': proc.pid, 'returnCode': proc.returncode,
              'deadlineSecondsAfterSpawn': deadline, 'elapsedSecondsAfterSpawn': time.monotonic() - started,
              'fault': fault, 'killRequested': killed, 'directChildReaped': proc.returncode is not None,
              'ioTasksSettled': all(task.done() for task in tasks), 'cleanupErrors': cleanup_errors,
              'observedBytes': observed, 'retainedBytes': {n: len(v) for n, v in raw.items()},
              'readCalls': reads, 'limits': LIMITS, 'events': events, 'writes': writes,
              **connection.snapshot()}
    result['outcome'] = 'needs-attention' if fault or cleanup_errors or result['protocolStatus'] != 'protocol-completed' else 'protocol-only-complete'
    return result, {n: bytes(v) for n, v in raw.items()}
