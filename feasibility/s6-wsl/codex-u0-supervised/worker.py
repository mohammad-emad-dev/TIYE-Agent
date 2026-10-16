"""Synthetic Windows worker; its handshake peer is never a provider substitute."""
import asyncio
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from support import SOURCE, U0, Handshake, arguments, environment, observe, u0, wait_release, wire, witness


def emit(envelope):
    print(json.dumps(envelope), flush=True)


def sleeping_tree(folder, nonce):
    command = [sys.executable, '-I', '-S', '-B', str(SOURCE / 'worker.py'),
               'sleeper', str(folder), nonce]
    child = subprocess.Popen(command, env=environment(folder), cwd=folder,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(12)
    finally:
        if child.poll() is None:
            child.kill()
        child.wait(timeout=2)


async def protocol(mode, folder, nonce):
    parser = Handshake('/fixture')
    observation, raw = await observe([sys.executable, '-I', '-S', '-B', '-u',
        str(U0 / 'peer.py'), 'valid' if mode == 'invalid-raw' else mode], {
        'cwd': str(folder), 'env': environment(folder), 'seconds': 3,
        'spawnSeconds': 1, 'workSeconds': 1, 'cleanupWaitSeconds': 0.15,
        'limits': {'stdout': 4096, 'stderr': 4096},
        'initial': wire({'id': 1, 'method': 'initialize'}),
        'second': wire({'method': 'initialized'}), 'ready': lambda: parser.accepted,
        'allowed': parser.reply_allowed, 'feed': parser.feed, 'eof': parser.eof,
        'signal': u0.local_signal})
    observation.update(synthetic=True, handshakeAccepted=parser.accepted,
        handshakeFault=parser.fault,
        initializedWitness=b'initialized-notification-observed\n' in raw['stderr'])
    encoded = {name: base64.b64encode(stream).decode('ascii') for name, stream in raw.items()}
    if mode == 'invalid-raw':
        encoded['stdout'] = '!'  # Fault injection after an otherwise valid exchange.
    emit({'event': 'result', 'nonce': nonce, 'observation': observation, 'rawBase64': encoded})


def main():
    mode, folder, nonce = arguments({'valid', 'foreign', 'invalid-raw', 'blocked', 'root-exits', 'sleeper'})
    if mode == 'sleeper':
        witness(folder, 'peer', nonce)
        time.sleep(12)
        return 0
    incoming = sys.stdin.buffer.read(1025)
    if len(incoming) > 1024 or json.loads(incoming) != {'nonce': nonce}:
        raise ValueError('synthetic-initial-nonce-mismatch')
    witness(folder, 'worker', nonce)
    emit({'event': 'ready', 'nonce': nonce})
    if mode in {'blocked', 'root-exits'}:
        sleeping_tree(folder, nonce)
    else:
        wait_release(folder)
        asyncio.run(protocol(mode, folder, nonce))
    # Exit zero means the envelope was delivered, not that its handshake passed.
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
