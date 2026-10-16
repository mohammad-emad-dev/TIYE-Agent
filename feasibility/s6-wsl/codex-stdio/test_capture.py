"""Behavior gates against recorded real subprocess output; no new child launch."""
import json
import unittest
from pathlib import Path
from peer import APPROVAL, COMPLETED, DENIAL, MODES, START

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/s4-codex-stdio'


def load(mode):
    result = json.loads((OUT / (mode + '.json')).read_text(encoding='utf-8'))
    raw = {n: (OUT / (mode + '.' + n + '.bin')).read_bytes() for n in ('stdout', 'stderr')}
    return result, raw


def packets(raw):
    return [json.loads(line) for line in raw.splitlines()]


class CaptureTests(unittest.TestCase):
    def test_every_case_closes_local_connection_reaps_child_and_preserves_limits(self):
        for mode in MODES:
            with self.subTest(mode=mode):
                result, raw = load(mode)
                self.assertEqual(result['mode'], mode)
                self.assertTrue(result['directChildReaped'])
                self.assertIsNotNone(result['returnCode'])
                self.assertTrue(result['ioTasksSettled'])
                self.assertFalse(result['transportOpen'])
                self.assertEqual(result['cleanupErrors'], [])
                self.assertIsNone(result['taskSuccess'])
                for name, data in raw.items():
                    self.assertEqual(len(data), result['retainedBytes'][name])
                    self.assertLessEqual(len(data), result['limits'][name])
                    self.assertGreaterEqual(result['observedBytes'][name], len(data))

    def test_roundtrip_peer_confirms_unicode_and_exact_denial_before_completion(self):
        result, raw = load('roundtrip')
        self.assertEqual(packets(raw['stdout']), [
            {'method': 'fixture/echo', 'params': START}, APPROVAL,
            {'method': 'fixture/replyObserved', 'params': {'reply': DENIAL}}, COMPLETED])
        self.assertEqual(raw['stderr'], b'public synthetic denial received\n')
        self.assertEqual([w['kind'] for w in result['writes']], ['public-start', 'synthetic-denial'])
        self.assertTrue(all(w['state'] == 'locally-drained' for w in result['writes']))
        self.assertEqual([e['reply'] for e in result['events'] if e['event'] == 'reply-planned'], [DENIAL])
        self.assertEqual(result['returnCode'], 0)
        self.assertIsNone(result['fault'])
        self.assertEqual(result['outcome'], 'protocol-only-complete')
        self.assertEqual(result['protocolStatus'], 'protocol-completed')
        self.assertGreaterEqual(result['readCalls']['stdout'], (len(raw['stdout']) + 6) // 7)

    def test_eof_with_pending_approval_sends_nothing_and_refuses_late_reply(self):
        result, raw = load('eof-pending')
        self.assertEqual(packets(raw['stdout']), [APPROVAL])
        self.assertEqual(result['writes'], [])
        self.assertIn({'event': 'post-eof-reply-refused', 'reason': 'connection-closed'}, result['events'])
        self.assertEqual(result['returnCode'], 0)
        self.assertEqual(result['outcome'], 'needs-attention')

    def test_unterminated_completion_is_truncation_despite_zero_exit(self):
        result, raw = load('truncated')
        self.assertEqual(json.loads(raw['stdout']), COMPLETED)
        self.assertFalse(raw['stdout'].endswith(b'\n'))
        self.assertEqual(result['returnCode'], 0)
        self.assertEqual(result['fault'], 'truncated-record')
        self.assertEqual(result['events'], [{'source': 'stdout-eof', 'event': 'stream-failed', 'reason': 'truncated-record'}])
        self.assertEqual(result['outcome'], 'needs-attention')

    def test_nonzero_exit_overrides_protocol_completion_for_harness_outcome(self):
        result, raw = load('badexit')
        self.assertEqual(packets(raw['stdout']), [COMPLETED])
        self.assertEqual(result['protocolStatus'], 'protocol-completed')
        self.assertEqual(result['returnCode'], 23)
        self.assertEqual(result['fault'], 'nonzero-peer-exit')
        self.assertEqual(result['outcome'], 'needs-attention')

    def test_closed_input_observes_write_error_and_never_retries(self):
        result, raw = load('broken-stdin')
        self.assertEqual(packets(raw['stdout']), [{'method': 'fixture/inputClosed', 'params': {}}])
        self.assertEqual(result['fault'], 'write-failed')
        self.assertEqual(len(result['writes']), 1)
        attempt = result['writes'][0]
        self.assertEqual(attempt['byteCount'], 65536)
        self.assertEqual(attempt['state'], 'uncertain-write')
        self.assertIn(attempt['errorType'], ['BrokenPipeError', 'ConnectionResetError', 'OSError'])
        self.assertTrue(result['killRequested'])
        self.assertEqual(result['outcome'], 'needs-attention')

    def test_floods_retain_only_prefix_and_record_observed_overflow(self):
        for name, byte in [('stdout', b'x'), ('stderr', b'e')]:
            with self.subTest(stream=name):
                result, raw = load(name + '-flood')
                limit = result['limits'][name]
                self.assertEqual(raw[name], byte * limit)
                self.assertGreater(result['observedBytes'][name], limit)
                self.assertEqual(result['fault'], name + '-budget-exceeded')
                self.assertEqual(result['outcome'], 'needs-attention')

    def test_deadline_terminates_waiting_peer_without_sending_approval(self):
        result, raw = load('hang')
        self.assertEqual(packets(raw['stdout']), [APPROVAL])
        self.assertEqual(result['fault'], 'activity-deadline')
        self.assertTrue(result['killRequested'])
        self.assertNotEqual(result['returnCode'], 0)
        self.assertEqual(result['writes'], [])
        self.assertEqual(result['outcome'], 'needs-attention')


if __name__ == '__main__':
    unittest.main()
