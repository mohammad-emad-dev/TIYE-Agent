"""Refresh a Linux lease only upon receipt of the Windows owner's heartbeat."""
import json
import os
import selectors
import sys
import time
from pathlib import Path

folder, nonce = Path(sys.argv[1]), sys.argv[2]
os.umask(0o077)
selector = selectors.DefaultSelector()
selector.register(0, selectors.EVENT_READ)
pending = bytearray()
sequence = 0
deadline = time.monotonic() + 95
while time.monotonic() < deadline:
    if not selector.select(1):
        continue
    chunk = os.read(0, 4096)
    if not chunk:
        if pending:
            raise ValueError('truncated-heartbeat')
        break
    pending.extend(chunk)
    if len(pending) > 4096:
        raise ValueError('heartbeat-budget')
    while b'\n' in pending:
        line, _, remainder = pending.partition(b'\n')
        pending = bytearray(remainder)
        packet = json.loads(line)
        if (set(packet) != {'nonce', 'sequence'} or packet['nonce'] != nonce
                or type(packet['sequence']) is not int or packet['sequence'] != sequence + 1):
            raise ValueError('heartbeat-identity-or-sequence')
        sequence = packet['sequence']
        lease = {'nonce': nonce, 'sequence': sequence, 'received': time.monotonic()}
        temporary = folder / 'lease.tmp'
        temporary.write_text(json.dumps(lease), encoding='utf-8')
        temporary.replace(folder / 'lease.json')
selector.close()
