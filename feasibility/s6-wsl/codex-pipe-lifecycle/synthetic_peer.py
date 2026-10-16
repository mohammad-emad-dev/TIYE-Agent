"""Fixed local peers; input is never evaluated or executed."""
import json
import os
import sys
import time

MODES = ('eof-pending-live', 'eof-completed-live', 'blocked-writer')
PROBE = {'fixture': 'probe-after-stdout-eof'}
APPROVAL = {'id': 7, 'method': 'item/commandExecution/requestApproval', 'params': {
    'threadId': 'thread-owned', 'turnId': 'turn-owned', 'itemId': 'synthetic-item',
    'startedAtMs': 1000, 'command': None}}
COMPLETED = {'method': 'turn/completed', 'params': {'threadId': 'thread-owned',
    'turn': {'id': 'turn-owned', 'items': [], 'status': 'completed'}}}


def wire(value):
    return json.dumps(value, separators=(',', ':')).encode('utf-8') + b'\n'


def emit(fd, value):
    raw = wire(value)
    while raw:
        count = os.write(fd, raw)
        if count <= 0:
            raise RuntimeError('write-no-progress')
        raw = raw[count:]


def main(mode):
    if mode not in MODES:
        raise ValueError('unknown-fixture-mode')
    if mode != 'blocked-writer':
        emit(1, APPROVAL if mode == 'eof-pending-live' else COMPLETED)
        os.close(1)
        probe = json.loads(sys.stdin.buffer.readline(4096))
        if probe != PROBE:
            return 41
        emit(2, {'event': 'probe-observed', 'probe': probe})
        time.sleep(10)
        return 0
    # stdin stays open and deliberately unread. Both output channels continue.
    emit(1, {'method': 'fixture/ready', 'params': {}})
    for seq in range(200):
        emit(1, {'method': 'fixture/pulse', 'params': {'seq': seq}})
        emit(2, {'event': 'pulse', 'seq': seq})
        time.sleep(0.05)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
