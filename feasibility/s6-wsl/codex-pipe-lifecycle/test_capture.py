"""Verify saved native observations without launching peers again."""
import json
import unittest
from pathlib import Path
from synthetic_peer import APPROVAL, COMPLETED, MODES, PROBE, wire

OUT = Path(__file__).resolve().parents[3] / 'output/s4-codex-pipe-lifecycle'


def load(mode):
    result = json.loads((OUT / (mode + '.json')).read_text(encoding='utf-8'))
    raw = {n: (OUT / (mode + '.' + n + '.bin')).read_bytes() for n in ['stdout', 'stderr']}
    return result, raw


class CaptureTests(unittest.TestCase):
    def test_all_adversarial_peers_reach_deadline_and_direct_child_cleanup(self):
        for mode in MODES:
            with self.subTest(mode=mode):
                result, raw = load(mode)
                self.assertEqual(result['mode'], mode)
                self.assertEqual(result['fault'], 'activity-deadline')
                self.assertTrue(result['killRequested'])
                self.assertTrue(result['directChildReaped'])
                self.assertNotIn(result['returnCode'], [None, 0])
                self.assertTrue(result['ioTasksSettled'])
                self.assertEqual(result['cleanupErrors'], [])
                self.assertFalse(result['transportOpen'])
                self.assertIsNone(result['taskSuccess'])
                for name, data in raw.items():
                    self.assertEqual(len(data), result['retainedBytes'][name])
                    self.assertEqual(result['observedBytes'][name], len(data))
                    self.assertLessEqual(len(data), result['limits'][name])

    def test_eof_precedes_probe_ack_and_does_not_imply_process_exit(self):
        for mode, packet in [('eof-pending-live', APPROVAL), ('eof-completed-live', COMPLETED)]:
            with self.subTest(mode=mode):
                result, raw = load(mode)
                self.assertEqual(raw['stdout'], wire(packet))
                self.assertEqual(raw['stderr'], wire({'event': 'probe-observed', 'probe': PROBE}))
                self.assertTrue(result['stdoutEofObserved'])
                self.assertTrue(result['probeAcknowledgedAfterEof'])
                kinds = [e['event'] for e in result['events']]
                eof_index = kinds.index('stdout-eof-observed')
                drain_index = kinds.index('drain-entered')
                ack_index = kinds.index('probe-acknowledgement')
                kill_index = kinds.index('direct-child-kill-requested')
                self.assertLess(eof_index, drain_index)
                self.assertLess(drain_index, ack_index)
                self.assertLess(ack_index, kill_index)
                self.assertIsNone(result['events'][eof_index]['peerReturnCode'])
                self.assertIsNone(result['events'][ack_index]['peerReturnCode'])
                self.assertTrue(result['events'][ack_index]['afterStdoutEof'])
                self.assertEqual(result['writes'], [{'kind': 'post-eof-control-probe',
                    'byteCount': len(wire(PROBE)), 'state': 'locally-drained'}])
                self.assertLess(len(wire(PROBE)), 4096)
                self.assertNotIn('peer-exit-observed', kinds)

    def test_pending_approval_is_refused_after_eof_before_control_probe(self):
        result, _ = load('eof-pending-live')
        kinds = [e['event'] for e in result['events']]
        refused_index = kinds.index('post-eof-reply-refused')
        self.assertLess(kinds.index('policy-disconnect'), refused_index)
        self.assertLess(refused_index, kinds.index('drain-entered'))
        self.assertEqual(result['events'][refused_index]['reason'], 'connection-closed')
        self.assertEqual(result['protocolStatus'], 'needs-attention')
        self.assertFalse(any(e.get('result', {}).get('event') == 'reply-planned' for e in result['events']))

    def test_completed_protocol_does_not_clear_live_peer_deadline(self):
        result, _ = load('eof-completed-live')
        self.assertEqual(result['protocolStatus'], 'protocol-completed')
        self.assertEqual(result['fault'], 'activity-deadline')
        self.assertTrue(any(e.get('result', {}).get('event') == 'protocol-completed' for e in result['events']))
        self.assertEqual(result['outcome'], 'needs-attention')

    def test_blocked_writer_does_not_stop_either_output_reader(self):
        result, raw = load('blocked-writer')
        stdout_packets = [json.loads(line) for line in raw['stdout'].split(b'\n')[:-1]]
        stderr_packets = [json.loads(line) for line in raw['stderr'].split(b'\n')[:-1]]
        expected_stdout = wire({'method': 'fixture/ready', 'params': {}}) + b''.join(
            wire({'method': 'fixture/pulse', 'params': {'seq': n}}) for n in range(200))
        expected_stderr = b''.join(wire({'event': 'pulse', 'seq': n}) for n in range(200))
        self.assertTrue(expected_stdout.startswith(raw['stdout']))
        self.assertTrue(expected_stderr.startswith(raw['stderr']))
        self.assertEqual(stdout_packets[0], {'method': 'fixture/ready', 'params': {}})
        self.assertGreaterEqual(len(stdout_packets), 4)
        self.assertGreaterEqual(len(stderr_packets), 3)
        self.assertEqual([p['params']['seq'] for p in stdout_packets[1:]], list(range(len(stdout_packets) - 1)))
        self.assertEqual(stderr_packets, [{'event': 'pulse', 'seq': n} for n in range(len(stderr_packets))])
        pending = [e for e in result['events'] if e['event'] == 'output-read-while-drain-pending']
        entered = next(e for e in result['events'] if e['event'] == 'drain-entered')
        self.assertGreater(entered['queuedBytes'], 16384)
        for source in ['stdout', 'stderr']:
            observations = [e for e in pending if e['source'] == source]
            self.assertGreaterEqual(len(observations), 2)
            self.assertTrue(all(not e['writerTaskDone'] and e['queuedBytes'] > 0 for e in observations))
            self.assertTrue(all(e['elapsedSeconds'] >= entered['elapsedSeconds'] for e in observations))
            self.assertEqual([e['observedBytes'] for e in observations], sorted(set(e['observedBytes'] for e in observations)))
        self.assertEqual(result['writeBufferLowHigh'], [8192, 16384])

    def test_blocked_write_is_cancelled_once_without_retry_or_acceptance_claim(self):
        result, _ = load('blocked-writer')
        self.assertEqual(result['writes'], [{'kind': 'blocked-input-fault',
            'byteCount': 1048576, 'state': 'uncertain-write-cancelled'}])
        self.assertEqual(result['writerState'], 'uncertain-write-cancelled')
        kinds = [e['event'] for e in result['events']]
        self.assertNotIn('drain-returned', kinds)
        self.assertEqual(kinds.count('writer-cancelled'), 1)
        self.assertLess(kinds.index('writer-cancelled'), kinds.index('direct-child-kill-requested'))
        self.assertFalse(result['stdoutEofObserved'])
        self.assertFalse(result['probeAcknowledgedAfterEof'])
        self.assertTrue(any(e['event'] == 'policy-disconnect' and e['source'] == 'local-abort' for e in result['events']))


if __name__ == '__main__':
    unittest.main()
