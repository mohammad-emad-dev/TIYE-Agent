"""Synthetic behavior checks with real framing and frozen replay objects."""
import json
import unittest
from pathlib import Path
from framing import JsonlStream, OfflineConnection, ReplayError

ARCHIVE = Path(__file__).resolve().parents[3] / 'output/s4-codex-schema/schemas.zip'


def wire(packet):
    return json.dumps(packet, ensure_ascii=False, separators=(',', ':')).encode('utf-8') + b'\n'


def approval():
    return {'id': 7, 'method': 'item/commandExecution/requestApproval', 'params': {
        'threadId': 'thread-owned', 'turnId': 'turn-owned', 'itemId': 'item-1',
        'startedAtMs': 1000, 'command': 'echo public-fixture'}}


def completed():
    return {'method': 'turn/completed', 'params': {'threadId': 'thread-owned',
        'turn': {'id': 'turn-owned', 'items': [], 'status': 'completed'}}}


class FramingTests(unittest.TestCase):
    def test_every_byte_split_preserves_unicode_and_coalesced_records(self):
        packets = [{'text': 'مرحبا 日本 😀'}, {'id': 9, 'result': {}}]
        raw = wire(packets[0]).replace(b'\n', b'\r\n') + wire(packets[1])
        expected = [{'event': 'packet', 'packet': p} for p in packets]
        for split in range(len(raw) + 1):
            with self.subTest(split=split):
                stream = JsonlStream()
                self.assertEqual(stream.feed(raw[:split]) + stream.feed(raw[split:]), expected)
                self.assertEqual(stream.eof(), {'event': 'stream-closed'})
        stream = JsonlStream()
        self.assertEqual([e for b in raw for e in stream.feed(bytes([b]))], expected)

    def test_invalid_records_quarantine_suffix_and_block_further_input(self):
        bad = [b'\xff', b'\xef\xbb\xbf{}', b'{}\x00', b'', b' ', b'[]',
               b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}',
               b'{"x":1e400}', b'{"x":"\\ud800"}', '{}'.encode('utf-16'),
               b'{"x":\n1}', b'{"x":', b'{"x":"\xc0\xaf"}']
        for raw in bad:
            with self.subTest(raw=raw):
                stream = JsonlStream()
                events = stream.feed(b'{}\n' + raw + b'\n{}\n')
                self.assertEqual(events[0], {'event': 'packet', 'packet': {}})
                self.assertEqual(events[1]['event'], 'stream-failed')
                self.assertEqual(len(events), 2)
                self.assertEqual(len(stream.buffer), 0)
                with self.assertRaises(ReplayError):
                    stream.feed(b'{}\n')
                with self.assertRaises(ReplayError):
                    stream.eof()

    def test_line_limit_counts_bytes_and_cr_across_chunks(self):
        for raw, accepted in [(b'{}  \n', True), (b'{} \r\n', True),
                              (b'{}  \r\n', False), (b'{"x":"\xc3\xa9"}\n', False)]:
            with self.subTest(raw=raw):
                stream = JsonlStream(max_line=4)
                events = stream.feed(raw[:2]) + stream.feed(raw[2:])
                self.assertEqual(events[-1]['event'], 'packet' if accepted else 'stream-failed')
        stream = JsonlStream(max_line=4)
        self.assertEqual(stream.feed(b'1234'), [])
        self.assertEqual(stream.feed(b'5')[0]['reason'], 'line-too-large')

    def test_chunk_limit_rejects_whole_chunk_without_accepting_prefix(self):
        stream = JsonlStream(max_chunk=6)
        self.assertEqual(len(stream.feed(b'{}\n{}\n')), 2)
        self.assertEqual(stream.feed(b'{}\n{}\n '), [{'event': 'stream-failed', 'reason': 'chunk-too-large'}])
        stream = JsonlStream(max_chunk=6)
        self.assertEqual(stream.feed(b'{'), [])
        self.assertEqual(stream.feed(b'}\n{}\n  '), [{'event': 'stream-failed', 'reason': 'chunk-too-large'}])
        self.assertEqual(len(stream.buffer), 0)

    def test_default_byte_limits_accept_boundary_and_refuse_one_extra_byte(self):
        stream = JsonlStream()
        self.assertEqual(stream.feed(b'{}' + b' ' * 65534 + b'\n'), [{'event': 'packet', 'packet': {}}])
        self.assertEqual(stream.feed(b'{}' + b' ' * 65535 + b'\n')[0]['reason'], 'line-too-large')
        stream = JsonlStream()
        self.assertEqual(len(stream.feed((b'{}' + b' ' * 65533 + b'\n') * 4)), 4)
        self.assertEqual(stream.feed(b' ' * 262145)[0]['reason'], 'chunk-too-large')

    def test_frame_budget_preserves_prefix_then_quarantines(self):
        stream = JsonlStream(max_frames=2)
        events = stream.feed(b'{}\n{}\n{}\n')
        self.assertEqual([e['event'] for e in events], ['packet', 'packet', 'stream-failed'])
        self.assertEqual(events[-1]['reason'], 'frame-budget-exceeded')
        stream = JsonlStream(max_frames=2)
        for _ in range(3):
            self.assertEqual(len(stream.feed(b'{}\n{}\n')), 2)

    def test_eof_never_parses_unterminated_or_partial_utf8_record(self):
        for tail in [b'{}', b'\xc3', b'\r', b' ']:
            with self.subTest(tail=tail):
                stream = JsonlStream()
                self.assertEqual(stream.feed(tail), [])
                self.assertEqual(stream.eof()['reason'], 'truncated-record')

    def test_disconnect_revokes_pending_reply_and_does_not_reopen(self):
        connection = OfflineConnection(ARCHIVE)
        receipt = connection.feed(wire(approval()))[0]
        self.assertEqual(connection.disconnect()['event'], 'stream-closed')
        self.assertEqual(connection.snapshot(), {'transportOpen': False,
            'protocolStatus': 'needs-attention', 'taskSuccess': None})
        with self.assertRaises(ReplayError):
            connection.decide(7, 'accept', receipt['fingerprint'])
        with self.assertRaises(ReplayError):
            connection.feed(wire(completed()))
        with self.assertRaises(ReplayError):
            connection.disconnect()

    def test_malformed_protocol_after_approval_blocks_reply(self):
        for malformed, reason in [(b'\xff\n', 'invalid-record'),
                                  (wire({'method': None}), 'invalid-protocol-message')]:
            with self.subTest(malformed=malformed):
                connection = OfflineConnection(ARCHIVE)
                events = connection.feed(wire(approval()) + malformed + wire(completed()))
                self.assertEqual([e['event'] for e in events], ['approval-pending', 'stream-failed'])
                self.assertEqual(events[-1]['reason'], reason)
                self.assertEqual(connection.snapshot()['protocolStatus'], 'needs-attention')
                with self.assertRaises(ReplayError):
                    connection.decide(7, 'decline', events[0]['fingerprint'])

    def test_completion_remains_protocol_only_and_truncation_overrides_it(self):
        for tail in [b'', b'{']:
            with self.subTest(tail=tail):
                connection = OfflineConnection(ARCHIVE)
                self.assertEqual(connection.feed(wire(completed()) + tail)[0]['event'], 'protocol-completed')
                connection.disconnect()
                self.assertEqual(connection.snapshot()['protocolStatus'], 'needs-attention' if tail else 'protocol-completed')
                self.assertIsNone(connection.snapshot()['taskSuccess'])

    def test_open_connection_keeps_single_use_reply_planning(self):
        connection = OfflineConnection(ARCHIVE)
        receipt = connection.feed(wire(approval()))[0]
        reply = connection.decide(7, 'decline', receipt['fingerprint'])
        self.assertEqual(reply['reply'], {'id': 7, 'result': {'decision': 'decline'}})
        with self.assertRaises(ReplayError):
            connection.decide(7, 'decline', receipt['fingerprint'])


if __name__ == '__main__':
    unittest.main()
