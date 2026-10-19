"""Real Windows files/pipes; injected write/fsync faults are not real disk exhaustion."""
import errno
import json
import os
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch

import writer

OBSERVATIONS = []
PRIVATE_CASES = []


def feed_bytes(capture, name, count, unit):
    block = (unit * (writer.CHUNK // len(unit) + 1))[:writer.CHUNK]
    while count:
        size = min(count, len(block))
        capture.feed(name, block[:size])
        count -= size


class WriterTests(unittest.TestCase):
    def make_capture(self):
        capture = writer.StreamCapture()
        self.addCleanup(capture.close)
        return capture

    def verdict(self, name, capture):
        # The full fixture state stays inside the protected capture.
        OBSERVATIONS.append({'case': name, 'verified': True})
        PRIVATE_CASES.append({'case': name, 'path': str(capture.path), 'state': capture.snapshot()})

    def uncertain(self, capture):
        self.assertTrue(capture.stop.is_set())
        self.assertFalse(capture.completed)
        with self.assertRaises(ValueError):
            capture.finish()

    def finish(self, capture):
        for name in writer.LIMITS:
            capture.eof(name)
        capture.finish()
        self.assertTrue(capture.completed)
        self.assertFalse(capture.stop.is_set())
        self.assertLessEqual(sum(path.stat().st_size for path in capture.path.iterdir()), 6291456)

    def test_exact_caps_and_actual_protected_files(self):
        capture = self.make_capture()
        self.assertEqual(capture.verify_allocated(), {'protectedBeforeFeed': True, 'rawFilesEmpty': True})
        for name, limit in writer.LIMITS.items():
            feed_bytes(capture, name, limit, b'x\n' if name == 'stdout' else b'e')
        self.finish(capture)
        for name, limit in writer.LIMITS.items():
            self.assertEqual((capture.path / (name + '.bin')).stat().st_size, limit)
            with self.assertRaises(PermissionError):
                with (capture.path / (name + '.bin')).open('ab'):
                    pass
        self.assertEqual(set(p.name for p in capture.path.iterdir()), writer.FILES)
        with self.assertRaises(ValueError):
            capture.feed('stdout', b'late')
        self.verdict('exact-caps-protected', capture)

    def test_each_stream_overflow_globally_revokes_persistence(self):
        for name, limit in writer.LIMITS.items():
            with self.subTest(stream=name):
                capture = self.make_capture()
                feed_bytes(capture, name, limit, b'x\n' if name == 'stdout' else b'e')
                capture.feed(name, b'!')
                other = 'stderr' if name == 'stdout' else 'stdout'
                capture.feed(other, b'not-persisted')
                self.uncertain(capture)
                state = capture.snapshot()['streams']
                self.assertEqual(state[name], {'seen': limit + 1, 'retained': limit, 'discarded': 1, 'uncertain': 0, 'eof': False})
                self.assertEqual(state[other]['retained'], 0)
                self.assertEqual(state[other]['discarded'], len(b'not-persisted'))
                self.assertFalse((capture.path / 'completion.json').exists())
                self.verdict(name + '-overflow', capture)

    def test_fragmented_record_exact_lf_and_one_byte_overflow(self):
        for extra in (b'\n', b'!'):
            with self.subTest(extra=extra):
                capture = self.make_capture()
                feed_bytes(capture, 'stdout', writer.RECORD if extra == b'\n' else writer.RECORD - 3, b'a')
                capture.feed('stdout', extra if extra == b'\n' else b'abc!')
                if extra == b'\n':
                    capture.feed('stdout', b'\nnext\n')
                    self.finish(capture)
                    self.verdict('record-exact-with-lf', capture)
                else:
                    self.uncertain(capture)
                    self.assertEqual(capture.snapshot()['streams']['stdout']['retained'], writer.RECORD)
                    self.assertEqual(capture.fault, 'record-overflow')
                    self.verdict('record-overflow-fragmented', capture)

    def test_actual_short_prefix_and_injected_write_error(self):
        actual_write = os.write
        for kind in ('short', 'error'):
            with self.subTest(kind=kind):
                capture = self.make_capture()
                def faulty(fd, payload):
                    if kind == 'short':
                        return actual_write(fd, payload[:8])
                    raise OSError(errno.ENOSPC, 'injected-not-actual-exhaustion')
                with patch.object(writer.os, 'write', side_effect=faulty):
                    capture.feed('stdout', b'abcdefghijk\n')
                capture.feed('stderr', b'discard')
                self.uncertain(capture)
                kept = 8 if kind == 'short' else 0
                self.assertEqual((capture.path / 'stdout.bin').stat().st_size, kept)
                self.assertEqual(capture.snapshot()['streams']['stdout']['retained'], kept)
                self.assertEqual(capture.snapshot()['streams']['stdout']['uncertain'], 12 if kind == 'error' else 0)
                self.assertEqual(capture.hashes['stdout'].hexdigest(), writer.hashlib.sha256(b'abcdefgh'[:kept]).hexdigest())
                self.assertEqual(writer.hashlib.sha256((capture.path / 'stdout.bin').read_bytes()).hexdigest(),
                                 capture.hashes['stdout'].hexdigest())
                self.assertFalse((capture.path / 'completion.json').exists())
                self.verdict('short-write-prefix' if kind == 'short' else 'injected-write-error', capture)

    def test_fsync_failure_and_partial_completion_stay_uncertain(self):
        actual_write = os.write
        for kind in ('fsync', 'manifest', 'manifest-fsync'):
            with self.subTest(kind=kind):
                capture = self.make_capture()
                capture.feed('stdout', b'hello\n')
                capture.eof('stdout')
                capture.eof('stderr')
                operation = 'write' if kind == 'manifest' else 'fsync'
                actual_fsync = os.fsync
                calls = []
                def last_fsync(fd):
                    calls.append(fd)
                    if len(calls) == 3:
                        raise OSError('injected-completion-fsync-failure')
                    actual_fsync(fd)
                if kind == 'fsync':
                    effect = OSError('injected-fsync-failure')
                elif kind == 'manifest':
                    effect = lambda fd, data: actual_write(fd, data[:8])
                else:
                    effect = last_fsync
                with patch.object(writer.os, operation, side_effect=effect):
                    with self.assertRaises(OSError):
                        capture.finish()
                self.uncertain(capture)
                if kind == 'manifest':
                    self.assertEqual((capture.path / 'completion.json').stat().st_size, 8)
                    with self.assertRaises(json.JSONDecodeError):
                        json.loads((capture.path / 'completion.json').read_bytes())
                elif kind == 'fsync':
                    self.assertFalse((capture.path / 'completion.json').exists())
                else:
                    # A parseable file is not proof that finish succeeded.
                    self.assertEqual(json.loads((capture.path / 'completion.json').read_bytes())['scope'],
                                     'synchronous-byte-storage-only')
                    self.assertFalse(capture.completed)
                names = {'fsync': 'injected-fsync-failure', 'manifest': 'partial-manifest-quarantine',
                         'manifest-fsync': 'completion-fsync-failure'}
                self.verdict(names[kind], capture)

    def test_reader_failure_and_missing_eof_cannot_complete(self):
        capture = self.make_capture()
        capture.feed('stdout', b'prefix\n')
        capture.eof('stdout')
        with self.assertRaises(ValueError):
            capture.finish()
        capture.reader_failed('stderr')
        self.uncertain(capture)
        self.assertFalse((capture.path / 'completion.json').exists())
        self.verdict('reader-failure-missing-eof', capture)

    def test_unexpected_inventory_and_metadata_drift_refused(self):
        for kind in ('inventory', 'metadata', 'payload'):
            with self.subTest(kind=kind):
                capture = self.make_capture()
                capture.feed('stdout', b'prefix\n')
                capture.eof('stdout')
                capture.eof('stderr')
                if kind == 'inventory':
                    (capture.path / 'unexpected').write_bytes(b'owned-synthetic')
                else:
                    fd = capture.fds['retention.json' if kind == 'metadata' else 'stdout.bin']
                    os.lseek(fd, 0, os.SEEK_SET)
                    os.write(fd, b'!')
                with self.assertRaises(ValueError):
                    capture.finish()
                self.uncertain(capture)
                self.assertFalse((capture.path / 'completion.json').exists())
                names = {'inventory': 'unexpected-inventory', 'metadata': 'metadata-drift', 'payload': 'payload-drift'}
                self.verdict(names[kind], capture)

    def test_finite_child_two_pipes_are_drained_after_overflow(self):
        capture = self.make_capture()
        code = "import os,threading\ndef emit(fd):\n for _ in range(80): os.write(fd,b'x\\n'*8192)\na=threading.Thread(target=emit,args=(1,));b=threading.Thread(target=emit,args=(2,));a.start();b.start();a.join();b.join()"
        child = subprocess.Popen([sys.executable, '-I', '-c', code], stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, bufsize=0)
        failures = []
        def read(name, pipe):
            try:
                while True:
                    payload = os.read(pipe.fileno(), writer.CHUNK)
                    if not payload:
                        capture.eof(name)
                        return
                    capture.feed(name, payload)
            except (OSError, ValueError) as error:
                failures.append(type(error).__name__)
                capture.reader_failed(name)
        threads = [threading.Thread(target=read, args=(name, pipe), daemon=True)
                   for name, pipe in (('stdout', child.stdout), ('stderr', child.stderr))]
        try:
            for thread in threads:
                thread.start()
            child.wait(timeout=15)
            for thread in threads:
                thread.join(timeout=5)
            self.assertFalse(any(thread.is_alive() for thread in threads))
            self.assertEqual(failures, [])
            self.assertEqual(child.returncode, 0)
            self.uncertain(capture)
            state = capture.snapshot()['streams']
            for name in writer.LIMITS:
                self.assertTrue(state[name]['eof'])
                self.assertEqual(state[name]['seen'], 80 * writer.CHUNK)
                self.assertEqual(state[name]['seen'], state[name]['retained'] + state[name]['discarded'])
            self.assertGreater(state['stderr']['discarded'], 0)
            self.verdict('finite-concurrent-pipes-drain', capture)
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()


if __name__ == '__main__':
    unittest.main()
