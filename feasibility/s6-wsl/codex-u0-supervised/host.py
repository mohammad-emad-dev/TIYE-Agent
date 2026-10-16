"""Synthetic host using the frozen U0 envelope parser and bounded pipe transport."""
import asyncio
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from support import SOURCE, Handshake, arguments, clean, environment, fixture, observe, u0, witness


def protocol_observed(envelope):
    if envelope is None or not clean(envelope['observation'], 2):
        return False
    observation = envelope['observation']
    if (observation.get('synthetic') is not True or observation.get('handshakeAccepted') is not True
            or observation.get('handshakeFault') is not None or observation.get('initializedWitness') is not True
            or 'binaryUnchanged' in observation):
        return False
    raw = u0.decode_native(envelope['rawBase64'])
    parser = Handshake('/fixture')
    parser.feed(raw['stdout'])
    parser.eof()
    return parser.accepted and b'initialized-notification-observed\n' in raw['stderr']


def tick(parser, mode, folder):
    parser.tick()
    if parser.ready and (folder / 'peer.json').exists():
        if mode == 'blocked':
            # Intentionally block the event loop; only the outer watchdog can act.
            time.sleep(12)
        elif mode == 'root-exits' and (folder / 'release').exists():
            os._exit(7)


async def run(mode, folder, nonce):
    witness(folder, 'host', nonce)
    parser = u0.WorkerOutput(nonce)
    observation, raw = await observe([sys.executable, '-I', '-S', '-B', '-u',
        str(SOURCE / 'worker.py'), mode, str(folder), nonce], {
        'cwd': str(folder), 'env': environment(folder), 'seconds': 8,
        'spawnSeconds': 2, 'workSeconds': 3, 'cleanupWaitSeconds': 0.2,
        'limits': {'stdout': 1048576, 'stderr': 16384},
        'initial': json.dumps({'nonce': nonce}).encode('ascii'), 'closeInitial': True,
        'ready': lambda: parser.result is not None,
        'tick': lambda: tick(parser, mode, folder),
        'feed': parser.feed, 'eof': parser.eof, 'signal': u0.local_signal})
    for name, stream in raw.items():
        (folder / ('host-' + name + '.bin')).write_bytes(stream)
    validation_fault = None
    try:
        success = clean(observation, 1) and protocol_observed(parser.result)
    except (ValueError, UnicodeError, RecursionError, KeyError) as error:
        success = False
        validation_fault = type(error).__name__ + ':' + str(error)
    fixture.witness(folder, 'host-result', {'mode': mode, 'nonce': nonce, 'synthetic': True,
        'host': observation, 'worker': parser.result, 'syntheticProtocolObserved': success,
        'protocolValidationFault': validation_fault, 'nativeAdmissionGranted': False})
    return 0 if success else 1


if __name__ == '__main__':
    raise SystemExit(asyncio.run(run(*arguments({'valid', 'foreign', 'invalid-raw', 'blocked', 'root-exits'}))))
