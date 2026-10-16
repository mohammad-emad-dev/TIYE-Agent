import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from run import WorkerOutput, admit, local_signal, protocol_observed
from transport import Handshake, ProtocolFault, observe, wire

SOURCE = Path(__file__).resolve().parent
RESPONSE = {'id': 1, 'result': {'codexHome': '/fixture', 'platformFamily': 'unix',
                              'platformOs': 'linux', 'userAgent': 'عربي🙂'}}


class ProtocolTests(unittest.TestCase):
    def test_fragmented_unicode_then_eof_revokes_further_writes(self):
        parser = Handshake('/fixture')
        for byte in wire(RESPONSE):
            parser.feed(bytes([byte]))
        self.assertTrue(parser.reply_allowed())
        parser.eof()
        self.assertFalse(parser.reply_allowed())
        self.assertIsNone(parser.fault)

    def test_invalid_or_conflicting_wire_never_allows_notification(self):
        variants = [b'{"id":true,"result":{}}\n', b'{"id":1,"id":1,"result":{}}\n',
                    b'{"id":1,"error":{}}\n', b'{"id":1,"result":NaN}\n',
                    b'{"id":1,"result":1e999}\n', b'\xff\n',
                    wire(RESPONSE) + wire(RESPONSE)]
        for raw in variants:
            with self.subTest(raw=raw):
                parser = Handshake('/fixture')
                with self.assertRaises(ProtocolFault):
                    parser.feed(raw)
                self.assertFalse(parser.reply_allowed())

    def test_oversized_unterminated_record_is_rejected_without_retaining_it(self):
        parser = Handshake('/fixture', line_limit=32)
        parser.feed(b'x' * 32)
        with self.assertRaisesRegex(ProtocolFault, 'line-budget'):
            parser.feed(b'x')
        self.assertEqual(parser.buffer, b'')

    def test_truncated_valid_json_is_not_a_handshake(self):
        parser = Handshake('/fixture')
        parser.feed(wire(RESPONSE)[:-1])
        with self.assertRaises(ProtocolFault):
            parser.eof()
        self.assertFalse(parser.accepted)

    def test_changed_source_or_missing_review_blocks_native_admission(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'admission.json'
            record = {'scope': 'U0-no-auth-requests', 'sourceSha256': {'x.py': 'a'},
                      'launcherReviewed': True, 'ambientAccessReviewed': True,
                      'capturePrivacyReviewed': True}
            path.write_text(json.dumps(record), encoding='utf-8')
            self.assertEqual(admit(path, {'x.py': 'a'}), record)
            with self.assertRaises(ValueError):
                admit(path, {'x.py': 'b'})
            record['ambientAccessReviewed'] = False
            path.write_text(json.dumps(record), encoding='utf-8')
            with self.assertRaises(ValueError):
                admit(path, {'x.py': 'a'})

    def test_wrong_worker_nonce_or_duplicate_result_is_refused(self):
        parser = WorkerOutput('owned')
        with self.assertRaises(ProtocolFault):
            parser.feed(b'{"event":"ready","nonce":"foreign"}\n')
        parser = WorkerOutput('owned')
        parser.feed(b'{"event":"ready","nonce":"owned"}\n')
        raw = b'{"event":"result","nonce":"owned","observation":{},"rawBase64":{"stdout":"","stderr":""}}\n'
        parser.feed(raw)
        with self.assertRaises(ProtocolFault):
            parser.feed(raw)

    def test_worker_receipt_alone_or_native_failure_does_not_pass_protocol(self):
        self.assertFalse(protocol_observed({'event': 'result', 'observation': {}}))
        observation = {'fault': None, 'handshakeAccepted': True, 'handshakeFault': None,
                       'binaryUnchanged': True, 'directChildReaped': True, 'returnCode': 0,
                       'cleanupErrors': [], 'readerEof': {'stdout': True, 'stderr': True},
                       'writes': [{'state': 'locally-drained'}] * 2}
        self.assertTrue(protocol_observed({'observation': observation}))
        for key, value in [('fault', 'line-budget'), ('binaryUnchanged', False),
                           ('directChildReaped', False), ('handshakeFault', 'unexpected-packet'),
                           ('writes', None), ('readerEof', {'stdout': False, 'stderr': True})]:
            with self.subTest(key=key):
                self.assertFalse(protocol_observed({'observation': {**observation, key: value}}))


class ProcessTests(unittest.IsolatedAsyncioTestCase):
    async def capture(self, mode, limits=None):
        parser = Handshake('/fixture')
        context = {'cwd': str(SOURCE), 'env': dict(os.environ), 'seconds': 3,
                   'spawnSeconds': 1, 'workSeconds': 1, 'cleanupWaitSeconds': 0.15,
                   'limits': limits or {'stdout': 4096, 'stderr': 4096},
                   'initial': wire({'id': 1, 'method': 'initialize'}),
                   'second': wire({'method': 'initialized'}), 'ready': lambda: parser.accepted,
                   'allowed': parser.reply_allowed, 'feed': parser.feed, 'eof': parser.eof,
                   'signal': local_signal}
        result, raw = await observe([sys.executable, '-I', '-B', '-u', str(SOURCE / 'peer.py'), mode], context)
        return result, raw

    async def test_real_peer_observes_only_initialize_and_initialized_then_exits(self):
        result, raw = await self.capture('valid')
        self.assertIsNone(result['fault'])
        self.assertEqual(result['returnCode'], 0)
        self.assertTrue(result['directChildReaped'])
        self.assertEqual([w['state'] for w in result['writes']], ['locally-drained'] * 2)
        self.assertIn(b'initialized-notification-observed', raw['stderr'])
        self.assertTrue(all(result['readerEof'].values()))

    async def test_late_duplicate_after_notification_is_still_a_failure(self):
        result, raw = await self.capture('late-duplicate')
        self.assertIn(b'initialized-notification-observed', raw['stderr'])
        self.assertEqual(result['fault'], 'unexpected-packet')
        self.assertTrue(result['directChildReaped'])

    async def test_protocol_failure_keeps_draining_so_flooding_peer_can_exit(self):
        result, raw = await self.capture('foreign-flood', {'stdout': 8192, 'stderr': 512})
        self.assertEqual(result['fault'], 'uncorrelated-or-error-response')
        self.assertEqual(result['returnCode'], 0)
        self.assertEqual(result['signals'], [])
        self.assertGreater(result['discardedBytes']['stdout'], 50000)
        self.assertLessEqual(len(raw['stdout']), 8192)

    async def test_foreign_and_truncated_responses_do_not_trigger_second_write(self):
        for mode in ['foreign', 'truncated']:
            with self.subTest(mode=mode):
                result, raw = await self.capture(mode)
                self.assertIsNotNone(result['fault'])
                self.assertEqual(len(result['writes']), 1)
                self.assertNotIn(b'initialized-notification-observed', raw['stderr'])
                self.assertTrue(result['directChildReaped'])

    async def test_output_overflow_preserves_bounded_prefix_and_reaps_child(self):
        for mode in ['stdout-flood', 'stderr-flood']:
            with self.subTest(mode=mode):
                result, raw = await self.capture(mode, {'stdout': 512, 'stderr': 512})
                self.assertIsNotNone(result['fault'])
                self.assertTrue(all(len(value) <= 512 for value in raw.values()))
                self.assertGreater(sum(result['discardedBytes'].values()), 0)
                self.assertTrue(result['directChildReaped'])

    async def test_live_child_after_handshake_requires_recorded_escalation(self):
        result, raw = await self.capture('hang')
        self.assertIn(b'initialized-notification-observed', raw['stderr'])
        self.assertTrue(result['signals'])
        self.assertTrue(result['directChildReaped'])
        self.assertLess(result['elapsedSeconds'], 3)


if __name__ == '__main__':
    unittest.main()
