"""Public synthetic peer. No external commands, descendants, auth or network."""
import json
import os
import sys
import time


def wire(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8') + b'\n'


def write_all(fd, raw):
    while raw:
        count = os.write(fd, raw)
        if count <= 0:
            raise RuntimeError('short-write-without-progress')
        raw = raw[count:]


APPROVAL = {'id': 7, 'method': 'item/commandExecution/requestApproval', 'params': {
    'threadId': 'thread-owned', 'turnId': 'turn-owned', 'itemId': 'synthetic-item',
    'startedAtMs': 1000, 'command': None}}
COMPLETED = {'method': 'turn/completed', 'params': {'threadId': 'thread-owned',
    'turn': {'id': 'turn-owned', 'items': [], 'status': 'completed'}}}
START = {'fixture': 'start', 'text': 'مرحبا 日本 😀'}
DENIAL = {'id': 7, 'result': {'decision': 'decline'}}
MODES = ('roundtrip', 'eof-pending', 'truncated', 'badexit', 'broken-stdin',
         'stdout-flood', 'stderr-flood', 'hang')


def main(mode):
    if mode not in MODES:
        raise ValueError('unknown-fixture-mode')
    if mode == 'roundtrip':
        if json.loads(sys.stdin.buffer.readline(4096)) != START:
            return 31
        raw = wire({'method': 'fixture/echo', 'params': START}) + wire(APPROVAL)
        for size in [1, 2, 5, 3, 7]:
            write_all(1, raw[:size])
            raw = raw[size:]
        write_all(1, raw)
        reply = json.loads(sys.stdin.buffer.readline(4096))
        if reply != DENIAL:
            return 32
        write_all(2, b'public synthetic denial received\n')
        write_all(1, wire({'method': 'fixture/replyObserved', 'params': {'reply': reply}}) + wire(COMPLETED))
        return 0
    if mode in ('eof-pending', 'hang'):
        write_all(1, wire(APPROVAL))
        if mode == 'hang':
            time.sleep(10)
        return 0
    if mode == 'truncated':
        write_all(1, wire(COMPLETED)[:-1])
        return 0
    if mode == 'badexit':
        write_all(1, wire(COMPLETED))
        return 23
    if mode == 'broken-stdin':
        os.close(0)
        write_all(1, wire({'method': 'fixture/inputClosed', 'params': {}}))
        time.sleep(10)
        return 0
    if mode == 'stdout-flood':
        write_all(1, b'x' * 9000)
    if mode == 'stderr-flood':
        write_all(2, b'e' * 9000)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
