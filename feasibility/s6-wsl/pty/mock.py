"""Bounded raw TTY mock, with real SIGINT/SIGWINCH observation."""
import hashlib
import os
import select
import signal
import sys
import termios
import time
import tty
from pathlib import Path

nonce = sys.argv[-1]
def emit(kind, value=''):
    sys.stdout.write('TIYE_' + kind + ' ' + nonce + (' ' + value if value else '') + '\r\n')
    sys.stdout.flush()
def size():
    dimensions = os.get_terminal_size(0)
    emit('SIZE', str(dimensions.columns) + ' ' + str(dimensions.lines))
interrupt = False
resized = False
def on_interrupt(*args):
    global interrupt
    interrupt = True
def on_resize(*args):
    global resized
    resized = True
signal.signal(signal.SIGINT, on_interrupt)
signal.signal(signal.SIGWINCH, on_resize)
original = termios.tcgetattr(0)
deadline = time.monotonic() + 30
buffer = b''
ordinal = 0
exit_code = 2
try:
    tty.setraw(0)
    settings = termios.tcgetattr(0)
    settings[3] |= termios.ISIG
    termios.tcsetattr(0, termios.TCSANOW, settings)
    settings = termios.tcgetattr(0)
    sys.stdout.write('\x1b[?2004h'); sys.stdout.flush()
    emit('READY', ''.join('1' if os.isatty(fd) else '0' for fd in [0, 1, 2]))
    fields = Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()
    emit('PID', str(os.getpid()) + ' ' + fields[19] + ' ' + str(os.getuid()))
    emit('MODE', 'echo=' + str(int(bool(settings[3] & termios.ECHO))) + ' isig=' + str(int(bool(settings[3] & termios.ISIG))))
    size()
    while time.monotonic() < deadline:
        if interrupt:
            interrupt = False
            emit('SIGINT')
        if resized:
            resized = False
            size()
        if not select.select([0], [], [], 0.05)[0]:
            continue
        data = os.read(0, 4096)
        if not data:
            break
        buffer += data
        if len(buffer) > 16384:
            raise RuntimeError('Input limit')
        while True:
            start = buffer.find(b'\x1b[200~')
            if start < 0:
                buffer = buffer[-5:]
                break
            end = buffer.find(b'\x1b[201~', start + 6)
            if end < 0:
                buffer = buffer[start:]
                break
            payload = buffer[start + 6:end]
            buffer = buffer[end + 6:]
            if payload == ('STOP ' + nonce).encode():
                emit('STOP')
                exit_code = 0
                break
            ordinal += 1
            text = payload.decode('utf-8', errors='strict')
            emit('ACK', str(ordinal) + ' ' + str(len(payload)) + ' ' + hashlib.sha256(payload).hexdigest())
            for line in text.replace('\r', '\n').split('\n'):
                sys.stdout.write('\x1b[32mVISIBLE ' + line + '\x1b[0m\r\n')
            sys.stdout.flush()
        if exit_code == 0:
            break
finally:
    sys.stdout.write('\x1b[?2004l'); sys.stdout.flush()
    termios.tcsetattr(0, termios.TCSANOW, original)
raise SystemExit(exit_code)
