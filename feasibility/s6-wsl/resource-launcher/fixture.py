"""Fixed synthetic children: no file writes, provider requests or descendants."""
import os
import sys
import time


if __name__ == '__main__':
    role, scenario = sys.argv[1:]
    if role not in ('protocol', 'observer') or scenario not in ('valid', 'overflow', 'timeout'):
        raise SystemExit(2)
    if role == 'observer':
        for _ in range(17 if scenario == 'overflow' else 1):
            os.write(1, b'd' * 16384)
        os.write(2, b'observer done\n')
    elif scenario == 'timeout':
        # The controller must revoke work and reap us through EOF or a signal.
        time.sleep(95)
    else:
        if sys.stdin.buffer.readline(64) != b'initialize\n':
            raise SystemExit(3)
        os.write(1, b'initialized\n')
        os.write(2, b'protocol done\n')
        sys.stdin.buffer.read()
