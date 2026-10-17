"""Public synthetic test peer, never a native/provider substitute."""
import json
import os
import sys
import time


def emit(value):
    raw = json.dumps(value, ensure_ascii=False).encode('utf-8') + b'\n'
    # Split every UTF-8 sequence across actual writes.
    for byte in raw:
        os.write(1, bytes([byte]))


def main():
    mode = sys.argv[1]
    request = json.loads(sys.stdin.buffer.readline())
    if request.get('method') != 'initialize' or request.get('id') != 1:
        return 21
    result = {'codexHome': '/fixture', 'platformFamily': 'unix',
              'platformOs': 'linux', 'userAgent': 'synthetic عربي 日本語 🙂'}
    if mode == 'stdout-flood':
        os.write(1, b'x' * 20000)
        time.sleep(10)
        return 0
    if mode == 'truncated':
        os.write(1, json.dumps({'id': 1, 'result': result}).encode())
        return 0
    emit({'id': 2 if mode in ['foreign', 'foreign-flood'] else 1, 'result': result})
    if mode == 'foreign-flood':
        for unused in range(16):
            os.write(1, b'x' * 4096)
        return 0
    if mode == 'foreign':
        return 0
    second = sys.stdin.buffer.readline()
    if second != b'{"method":"initialized"}\n':
        return 22
    os.write(2, b'initialized-notification-observed\n')
    if mode == 'late-duplicate':
        emit({'id': 1, 'result': result})
    elif mode == 'stderr-flood':
        for unused in range(256):
            os.write(2, b'z' * 4096)
    elif mode == 'hang':
        time.sleep(10)
    # Wait for EOF so normal shutdown is independently observed.
    sys.stdin.buffer.read()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
