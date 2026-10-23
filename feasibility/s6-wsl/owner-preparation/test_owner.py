"""Actual Linux processes, socket credentials and delegated cgroup-v2 evidence."""
from contextlib import ExitStack
from dataclasses import replace
import hashlib
import io
import json
import os
import signal
import unittest
from unittest.mock import patch

from authority import StoppedWriters, signaled
from fixtures import Fixture, wait_empty
from owner import PreparationOwner
from request import parse_request


class OwnerTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.fixture = Fixture(self.stack)
        self.owner = self.fixture.owner((self.fixture.workers.main, self.fixture.workers.leaf))

    def stopped(self):
        self.fixture.workers.stop()
        wait_empty(self.fixture.group_fd)

    def exchange(self, payload=None, client=None, **options):
        client = self.fixture.client if client is None else client
        with client.begin(self.fixture.listener,
                          self.fixture.request() if payload is None else payload, **options) as peer:
            self.owner.serve_once(peer)
        return client.response()

    def refused(self, payload=None, client=None, **options):
        client = self.fixture.client if client is None else client
        with self.assertRaises((ValueError, OSError, TimeoutError)):
            self.exchange(payload, client, **options)
        self.assertEqual(client.response(), b'')
        self.assertEqual(list(self.fixture.destination.iterdir()), [])

    def test_stopped_writers_return_measured_bound_manifest(self):
        self.stopped()
        parsed = parse_request(self.exchange())
        self.assertEqual(parsed.binding, self.owner.binding)
        self.assertEqual(parsed.files, (('alpha.txt', 5, hashlib.sha256(b'alpha').hexdigest()),))
        self.assertEqual(list(self.fixture.destination.iterdir()), [])
        self.assertEqual((self.fixture.source / 'alpha.txt').read_bytes(), b'alpha')

    def test_live_original_writer_refused_and_nonce_burned(self):
        request = self.fixture.request()
        self.refused(request)
        self.stopped()
        self.refused(request)
        self.assertEqual(parse_request(self.exchange()).total_bytes, 5)

    def test_exited_parent_with_live_descendant_refused(self):
        self.fixture.workers.end_parent()
        self.assertTrue(signaled(self.fixture.workers.main))
        self.assertFalse(signaled(self.fixture.workers.leaf))
        self.owner = self.fixture.owner((self.fixture.workers.main,))
        self.refused()

    def test_repopulated_group_refused_despite_original_exit(self):
        self.stopped()
        replacement = self.fixture.spawn_workers()
        self.assertFalse(signaled(replacement.main))
        self.refused()

    def test_wrong_process_cannot_spend_enrolled_request(self):
        self.stopped()
        foreign = self.fixture.new_client()
        request = self.fixture.request()
        self.refused(request, foreign)
        self.assertEqual(parse_request(self.exchange(request)).total_bytes, 5)

    def test_inherited_socket_sender_refused(self):
        self.stopped()
        request = self.fixture.request()
        self.refused(request, inherit=True)
        self.assertEqual(parse_request(self.exchange(request)).total_bytes, 5)

    def test_replay_and_ledger_exhaustion_never_evict(self):
        self.stopped()
        first = self.fixture.request()
        self.exchange(first)
        self.refused(first)
        for number in range(1, 64):
            self.exchange(self.fixture.request(nonce=f'{number:032x}'))
        self.refused()
        self.refused(first)

    def test_invalid_schema_binding_and_bounds_refused(self):
        self.stopped()
        for change in ({'session': '4' * 32}, {'generation': True}, {'ownerEpoch': '4' * 32},
                {'paths': ['../escape']}, {'paths': ['alpha.txt', 'ALPHA.txt']},
                {'byteBudget': True}, {'validForSeconds': 61}, {'destination': '/tmp/other'}):
            with self.subTest(change=change):
                self.refused(self.fixture.request(**change))
        packet = self.fixture.request()
        for invalid in (b'\xff', b'{', b'[]', b'{}', b'{"event":1,"event":2}',
                        packet + b' ' * 16384):
            with self.subTest(invalid=invalid[:40]):
                self.refused(invalid)
        self.assertEqual(parse_request(self.exchange()).total_bytes, 5)

    def test_ancillary_rights_and_truncation_close_received_fds(self):
        self.stopped()
        before = len(os.listdir('/proc/self/fd'))
        for count in (1, 32):
            self.refused(rights=count)
        self.assertEqual(len(os.listdir('/proc/self/fd')), before)
        self.assertEqual(parse_request(self.exchange()).total_bytes, 5)

    def during_content_read(self, action, request=None):
        real_read = os.read
        source_inode = (self.fixture.source / 'alpha.txt').stat().st_ino
        changed = False

        def reading(descriptor, count):
            nonlocal changed
            chunk = real_read(descriptor, count)
            metadata = os.fstat(descriptor)
            if not changed and (metadata.st_dev, metadata.st_ino) == (self.owner.binding.source[0], source_inode):
                changed = True
                action()
            return chunk

        with patch('os.read', side_effect=reading):
            self.refused(request)
        self.assertTrue(changed)

    def test_worker_group_repopulated_during_read_refused(self):
        self.stopped()
        self.during_content_read(self.fixture.spawn_workers)

    def test_requester_death_during_read_returns_no_manifest(self):
        self.stopped()
        client = self.fixture.client
        real_read = os.read
        source = (self.fixture.source / 'alpha.txt').stat()
        killed = False

        def reading(descriptor, count):
            nonlocal killed
            chunk = real_read(descriptor, count)
            metadata = os.fstat(descriptor)
            if not killed and (metadata.st_dev, metadata.st_ino) == (source.st_dev, source.st_ino):
                killed = True
                signal.pidfd_send_signal(client.pin.descriptor, signal.SIGKILL)
                client.child.wait(timeout=2)
            return chunk

        with client.begin(self.fixture.listener, self.fixture.request()) as peer:
            with patch('os.read', side_effect=reading), self.assertRaises((ValueError, OSError)):
                self.owner.serve_once(peer)
        self.assertTrue(killed)

    def test_preparation_failure_burns_recognized_nonce(self):
        self.stopped()
        request = self.fixture.request(paths=['missing.txt'])
        self.refused(request)
        missing = self.fixture.source / 'missing.txt'
        missing.write_bytes(b'later')
        missing.chmod(0o600)
        self.refused(request)
        self.assertEqual(parse_request(self.exchange(self.fixture.request(paths=['missing.txt']))).total_bytes, 5)

    def test_closed_owner_and_removed_group_refuse(self):
        self.stopped()
        vanishing = self.fixture.group / 'vanishing'
        vanishing.mkdir()
        descriptor = self.fixture.directory(vanishing)
        stopped = StoppedWriters(self.stack, descriptor, (self.fixture.workers.main,))
        self.owner = PreparationOwner(self.fixture.source_fd, self.fixture.destination_fd,
                                      replace(self.owner.context, writers=stopped))
        self.stack.callback(self.owner.close)
        vanishing.rmdir()
        self.refused()
        self.owner.close()
        self.refused()

    def test_non_kernel_stop_evidence_refused(self):
        with self.assertRaises(ValueError):
            StoppedWriters(self.stack, self.fixture.source_fd, (self.fixture.workers.main,))
        regular = os.open(self.fixture.source / 'alpha.txt', os.O_RDONLY)
        self.stack.callback(os.close, regular)
        with self.assertRaises(ValueError):
            StoppedWriters(self.stack, self.fixture.group_fd, (regular,))

    def test_socket_receive_deadline_refuses_without_reply(self):
        self.stopped()
        client = self.fixture.client
        client.control.send(json.dumps({'address': self.fixture.listener.getsockname().decode('ascii'),
                                       'payload': ''}).encode())
        self.assertEqual(client.control.recv(32), b'connected')
        with self.fixture.listener.accept()[0] as peer, self.assertRaises(TimeoutError):
            self.owner.serve_once(peer)
        # Client remains controlled by its enrolled process; no send command was issued.


def run():
    log = io.StringIO()
    result = unittest.TextTestRunner(stream=log, verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(OwnerTests))
    if not result.wasSuccessful() or result.testsRun != 15:
        raise RuntimeError(log.getvalue())
    return {'scope': 'synthetic-live-owner-preparation-tests-v1', 'tests': result.testsRun,
            'successful': True, 'exportExecutionAllowed': False,
            'nativeExecutionAllowed': False, 'commands': []}
