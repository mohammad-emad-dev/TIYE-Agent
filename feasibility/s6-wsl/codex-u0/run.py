"""Offline by default. Native capture requires a separate reviewed admission file."""
import argparse
import asyncio
import base64
import binascii
import hashlib
import json
import os
import platform
import time
import uuid
from pathlib import Path

from transport import ProtocolFault, finite_float, observe, reject_constant, unique_object

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
PRIVATE = ROOT / '.git/tiye-u0'
EXPECTED_BINARY = '3e2584f3f3829a43a0495011a1cecb2facbe64a2403e2b682351fd9c2983f970'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def sources():
    return {p.name: digest(p.read_bytes()) for p in sorted(SOURCE.glob('*.py'))}


def protocol_observed(report):
    observation = report.get('observation', {})
    if not isinstance(observation, dict):
        return False
    writes = observation.get('writes')
    if not isinstance(writes, list) or any(not isinstance(item, dict) for item in writes):
        return False
    return (isinstance(observation, dict) and observation.get('fault') is None
            and observation.get('handshakeAccepted') is True
            and observation.get('handshakeFault') is None
            and observation.get('binaryUnchanged') is True
            and observation.get('directChildReaped') is True
            and observation.get('cleanupErrors') == []
            and observation.get('readerEof') == {'stdout': True, 'stderr': True}
            and type(observation.get('returnCode')) is int and observation['returnCode'] == 0
            and len(writes) == 2
            and all(w.get('state') == 'locally-drained' for w in writes))


def candidate():
    raw = (ROOT / 'output/s4-codex-candidate/installation.json').read_bytes()
    installed = json.loads(raw)
    if installed['state'] != 'linux-version-help-completed':
        raise ValueError('candidate-incomplete')
    result = {key: installed['linux'][key] for key in ['binary', 'binarySha256']}
    if result['binarySha256'] != EXPECTED_BINARY:
        raise ValueError('candidate-baseline-mismatch')
    result['installationSha256'] = digest(raw)
    return result


def admit(path, current):
    record = json.loads(path.read_text(encoding='utf-8'))
    required = ['launcherReviewed', 'ambientAccessReviewed', 'capturePrivacyReviewed']
    if any(record.get(key) is not True for key in required):
        raise ValueError('native-admission-incomplete')
    if record.get('scope') != 'U0-no-auth-requests' or record.get('sourceSha256') != current:
        raise ValueError('native-admission-source-or-scope-mismatch')
    return record


class WorkerOutput:
    def __init__(self, nonce):
        self.nonce = nonce
        self.buffer = bytearray()
        self.ready = False
        self.result = None
        self.started = time.monotonic()

    def feed(self, chunk):
        self.buffer.extend(chunk)
        if len(self.buffer) > 8 * 1048576:
            raise ProtocolFault('worker-record-budget')
        while b'\n' in self.buffer:
            raw, _, rest = self.buffer.partition(b'\n')
            self.buffer = bytearray(rest)
            item = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object,
                              parse_float=finite_float, parse_constant=reject_constant)
            if not isinstance(item, dict):
                raise ProtocolFault('worker-record-not-object')
            if item.get('nonce') != self.nonce:
                raise ProtocolFault('worker-nonce-mismatch')
            if item.get('event') == 'ready' and not self.ready and self.result is None:
                self.ready = True
            elif item.get('event') == 'result' and self.ready and self.result is None:
                if not isinstance(item.get('observation'), dict):
                    raise ProtocolFault('worker-observation-missing')
                if not isinstance(item.get('rawBase64'), dict) or set(item['rawBase64']) != {'stdout', 'stderr'}:
                    raise ProtocolFault('worker-streams-invalid')
                if any(type(value) is not str for value in item['rawBase64'].values()):
                    raise ProtocolFault('worker-stream-encoding-invalid')
                self.result = item
            else:
                raise ProtocolFault('unexpected-worker-record')

    def eof(self):
        if self.buffer or self.result is None:
            raise ProtocolFault('worker-truncated-or-incomplete')

    def tick(self):
        if not self.ready and time.monotonic() - self.started > 30:
            raise ProtocolFault('worker-startup-deadline')


def local_signal(proc, kind):
    try:
        (proc.terminate if kind == 'term' else proc.kill)()
        return {'kind': kind, 'result': 'sent-to-owned-windows-launcher'}
    except ProcessLookupError:
        return {'kind': kind, 'result': 'already-exited'}


async def capture(admission_path):
    if os.name != 'nt':
        raise ValueError('native-windows-host-required')
    snapshot = {p.name: p.read_bytes() for p in sorted(SOURCE.glob('*.py'))}
    current = {name: digest(raw) for name, raw in snapshot.items()}
    admission = admit(admission_path, current)
    target = candidate()
    PRIVATE.mkdir(exist_ok=True)
    # Exclusive persistent admission blocks concurrent and later uncertain runs.
    with (PRIVATE / 'native-launch.lock').open('x', encoding='utf-8') as lock:
        lock.write('One U0 attempt; manual evidence-based recovery required before another.\n')
        lock.flush()
        os.fsync(lock.fileno())
    nonce = uuid.uuid4().hex
    out = PRIVATE / nonce
    out.mkdir(mode=0o700)
    target.update(nonce=nonce, transportSource=snapshot['transport.py'].decode('utf-8'))
    system = Path(os.environ['SystemRoot'])
    executable = system / 'System32/wsl.exe'
    if not executable.is_file() or not executable.is_absolute():
        raise ValueError('absolute-wsl-executable-unavailable')
    env = {'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32'),
           'TEMP': str(out), 'TMP': str(out)}
    command = [str(executable), '-d', 'Ubuntu', '--cd', '/tmp', '--exec', '/usr/bin/env', '-i',
               'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-I', '-S', '-B', '-u', '-c',
               snapshot['linux.py'].decode('utf-8')]
    frozen = {'sourceSha256': current, 'candidate': target, 'admission': admission,
              'hostVersion': platform.platform(), 'hostEnvironment': env, 'argv': command}
    with (out / 'input.json').open('x', encoding='utf-8') as stream:
        json.dump(frozen, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    parser = WorkerOutput(nonce)
    result, raw = await observe(command, {
        'env': env, 'cwd': str(ROOT), 'seconds': 90, 'spawnSeconds': 30, 'workSeconds': 75,
        'limits': {'stdout': 8 * 1048576, 'stderr': 1048576},
        'initial': json.dumps(target).encode('utf-8'), 'closeInitial': True,
        'ready': lambda: parser.result is not None, 'tick': parser.tick,
        'feed': parser.feed, 'eof': parser.eof, 'signal': local_signal})
    for name, value in raw.items():
        (out / ('worker-' + name + '.bin')).write_bytes(value)
    report = {'host': result, 'worker': parser.result, 'sourcesUnchanged': sources() == current,
              'linuxTreeCleanup': 'unverified', 'routeQualified': False, 'phase1': 'HOLD',
              'persistentLaunchBlock': True}
    (out / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    if parser.result is not None:
        try:
            decoded = decode_native(parser.result['rawBase64'])
        except (ValueError, binascii.Error) as error:
            result['fault'] = 'native-stream-invalid:' + type(error).__name__
            (out / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        else:
            for name, value in decoded.items():
                (out / ('native-' + name + '.bin')).write_bytes(value)
    print(json.dumps({'privateCapture': str(out), 'hostFault': result['fault'],
                      'protocolObserved': protocol_observed(parser.result or {}),
                      'linuxTreeCleanup': 'unverified', 'persistentLaunchBlock': True}))
    return 0 if (result['fault'] is None and report['sourcesUnchanged']
                 and protocol_observed(parser.result or {})) else 1


def decode_native(streams):
    result = {name: base64.b64decode(encoded, validate=True) for name, encoded in streams.items()}
    if any(len(value) > (4194304 if name == 'stdout' else 1048576) for name, value in result.items()):
        raise ValueError('native-stream-budget')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--admission', type=Path)
    args = parser.parse_args()
    if not args.capture:
        candidate()
        for path in SOURCE.glob('*.py'):
            compile(path.read_text(encoding='utf-8'), str(path), 'exec')
        print(json.dumps({'state': 'offline-source-check', 'nativeLaunched': False,
                          'sourceSha256': sources()}))
        return 0
    if args.admission is None:
        parser.error('--capture requires a separately reviewed --admission file')
    return asyncio.run(capture(args.admission))


if __name__ == '__main__':
    raise SystemExit(main())
