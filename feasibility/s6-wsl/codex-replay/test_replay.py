"""Behavior checks at the synthetic protocol-packet boundary; no provider mocks."""
import copy
import json
import unittest
from pathlib import Path
from replay import ReplayError, ReplaySession, decode_packet

ARCHIVE = Path(__file__).resolve().parents[3] / 'output/s4-codex-schema/schemas.zip'


def completion(status='completed', thread='thread-owned', turn='turn-owned'):
    return {'method': 'turn/completed', 'params': {'threadId': thread,
            'turn': {'id': turn, 'items': [], 'status': status}}}


def approval(ident=7, method='item/commandExecution/requestApproval', **overrides):
    params = {'threadId': 'thread-owned', 'turnId': 'turn-owned', 'itemId': 'item-a', 'startedAtMs': 1000}
    if method == 'item/commandExecution/requestApproval':
        params.update(command='echo public-fixture', approvalId=None)
    params.update(overrides)
    return {'id': ident, 'method': method, 'params': params}


class ReplayTests(unittest.TestCase):
    def session(self):
        return ReplaySession(ARCHIVE)

    def test_completion_requires_owned_thread_and_turn(self):
        session = self.session()
        for thread, turn in [('foreign', 'turn-owned'), ('thread-owned', 'stale')]:
            with self.subTest(thread=thread, turn=turn):
                self.assertEqual(session.receive(completion(thread=thread, turn=turn))['event'], 'ignored-foreign-turn')
                self.assertEqual(session.status, 'running')
        self.assertEqual(session.receive(completion())['event'], 'protocol-completed')
        self.assertIsNone(session.task_success)

    def test_failed_interrupted_and_nonterminal_are_not_task_success(self):
        for status, state in [('failed', 'failed'), ('interrupted', 'interrupted'), ('inProgress', 'running')]:
            with self.subTest(status=status):
                session = self.session()
                packet = completion(status)
                if status == 'failed':
                    packet['params']['turn']['error'] = {'message': 'synthetic provider failure'}
                session.receive(packet)
                self.assertEqual(session.status, state)
                self.assertIsNone(session.task_success)

    def test_duplicate_terminal_is_idempotent_but_conflict_pauses(self):
        session = self.session()
        packet = completion()
        session.receive(packet)
        self.assertEqual(session.receive(copy.deepcopy(packet))['event'], 'duplicate-terminal')
        self.assertEqual(session.receive(completion('failed'))['event'], 'conflicting-terminal')
        self.assertEqual(session.status, 'needs-attention')

    def test_response_ids_remain_typed_and_ack_does_not_complete_turn(self):
        session = self.session()
        session.expect_response(1, 'turn/interrupt')
        session.expect_response('1', 'turn/start')
        self.assertEqual(session.receive({'id': 99, 'result': {}})['event'], 'ignored-response')
        self.assertEqual(session.receive({'id': '1', 'result': {}})['event'], 'request-acknowledged')
        self.assertEqual(session.receive({'id': 1, 'error': {'code': -1, 'message': 'synthetic error'}})['event'], 'request-failed')
        self.assertEqual(session.status, 'running')
        self.assertIsNone(session.task_success)

    def test_conflicting_response_pauses_instead_of_overwriting(self):
        session = self.session()
        session.expect_response(1, 'turn/interrupt')
        reply = {'id': 1, 'result': {}}
        session.receive(reply)
        self.assertEqual(session.receive(reply)['event'], 'duplicate-response')
        self.assertEqual(session.receive({'id': 1, 'error': {'code': -1, 'message': 'conflict'}})['event'], 'conflicting-response')
        self.assertEqual(session.status, 'needs-attention')

    def test_operation_replies_are_single_use_for_each_callback(self):
        for method in ReplaySession.approval_files:
            for decision in ['accept', 'decline', 'cancel']:
                with self.subTest(method=method, decision=decision):
                    session = self.session()
                    incoming = approval(method=method)
                    receipt = session.receive(incoming)
                    result = session.decide(7, decision, receipt['fingerprint'])
                    self.assertEqual(result['reply'], {'id': 7, 'result': {'decision': decision}})
                    with self.assertRaises(ReplayError):
                        session.decide(7, decision, receipt['fingerprint'])
                    self.assertIsNone(session.task_success)

    def test_wider_grants_are_distinct_and_never_produce_reply(self):
        decisions = [('acceptForSession', 'session'),
                     ({'acceptWithExecpolicyAmendment': {'execpolicy_amendment': ['echo']}}, 'execpolicy'),
                     ({'applyNetworkPolicyAmendment': {'network_policy_amendment': {'host': 'fixture.invalid', 'action': 'allow'}}}, 'network-policy')]
        for decision, scope in decisions:
            with self.subTest(scope=scope):
                session = self.session()
                receipt = session.receive(approval())
                refused = session.decide(7, decision, receipt['fingerprint'])
                self.assertEqual(refused, {'event': 'wider-grant-refused', 'scope': scope, 'reply': None})
                # Refusing a wider grant does not consume a later explicit denial.
                self.assertEqual(session.decide(7, 'decline', receipt['fingerprint'])['reply']['result'], {'decision': 'decline'})
        session = self.session()
        receipt = session.receive(approval(method='item/fileChange/requestApproval'))
        self.assertIsNone(session.decide(7, 'acceptForSession', receipt['fingerprint'])['reply'])

    def test_callback_identity_not_item_id_binds_approval(self):
        session = self.session()
        first = session.receive(approval(ident=7, approvalId='callback-a'))
        second = session.receive(approval(ident='7', approvalId='callback-b'))
        with self.assertRaises(ReplayError):
            session.decide('7', 'accept', first['fingerprint'])
        self.assertEqual(session.decide('7', 'decline', second['fingerprint'])['reply']['id'], '7')
        self.assertEqual(session.decide(7, 'decline', first['fingerprint'])['reply']['id'], 7)

    def test_duplicate_approval_has_no_new_authority_and_changed_operation_pauses(self):
        session = self.session()
        packet = approval()
        receipt = session.receive(packet)
        self.assertEqual(session.receive(packet)['event'], 'duplicate-approval')
        changed = approval(command='different operation')
        self.assertEqual(session.receive(changed)['event'], 'conflicting-approval-id')
        with self.assertRaises(ReplayError):
            session.decide(7, 'accept', receipt['fingerprint'])

    def test_resolution_is_correlated_and_blocks_late_reply(self):
        session = self.session()
        receipt = session.receive(approval())
        for thread, ident, expected in [('foreign', 7, 'ignored-resolution'), ('thread-owned', '7', 'unmatched-resolution-recorded'), ('thread-owned', 99, 'unmatched-resolution-recorded')]:
            packet = {'method': 'serverRequest/resolved', 'params': {'threadId': thread, 'requestId': ident}}
            self.assertEqual(session.receive(packet)['event'], expected)
        self.assertEqual(session.receive(approval(ident=99))['event'], 'already-resolved-approval-refused')
        resolved = {'method': 'serverRequest/resolved', 'params': {'threadId': 'thread-owned', 'requestId': 7}}
        self.assertEqual(session.receive(resolved)['event'], 'approval-resolved')
        self.assertEqual(session.receive(resolved)['event'], 'duplicate-resolution')
        with self.assertRaises(ReplayError):
            session.decide(7, 'accept', receipt['fingerprint'])

    def test_terminal_blocks_pending_and_new_approval_replies(self):
        session = self.session()
        receipt = session.receive(approval())
        session.receive(completion('interrupted'))
        self.assertEqual(session.receive(approval(ident=8))['event'], 'late-approval-refused')
        with self.assertRaises(ReplayError):
            session.decide(7, 'accept', receipt['fingerprint'])

    def test_foreign_and_nullable_command_approvals_do_not_invent_preview(self):
        session = self.session()
        self.assertEqual(session.receive(approval(threadId='foreign'))['event'], 'ignored-foreign-approval')
        receipt = session.receive(approval(command=None))
        self.assertEqual(session.decide(7, 'decline', receipt['fingerprint'])['reply']['result']['decision'], 'decline')

    def test_malformed_packets_never_create_authority(self):
        packets = [approval(ident=True), approval(startedAtMs=True), {'id': 1, 'result': {}, 'error': {}},
                   {'id': 1, 'error': {'code': True, 'message': 'bad'}}, completion('unknown'),
                   {'method': [], 'params': {}}, {'method': None, 'id': 1, 'result': {}},
                   {**approval(), 'result': {}}]
        missing = approval()
        del missing['params']['itemId']
        packets.append(missing)
        for packet in packets:
            with self.subTest(packet=packet):
                session = self.session()
                with self.assertRaises(ReplayError):
                    session.receive(packet)
                self.assertEqual(session.status, 'running')
                with self.assertRaises(ReplayError):
                    session.decide(1, 'accept', 'not-authority')

    def test_bad_json_duplicate_keys_and_oversize_are_refused(self):
        for raw in [b'{', b'[]', b'{"id":1,"id":2}', b'{"x":NaN}', b' ' * 65537]:
            with self.subTest(raw_length=len(raw)):
                with self.assertRaises(ReplayError):
                    decode_packet(raw)
        packet = approval()
        self.assertEqual(decode_packet(json.dumps(packet).encode()), packet)


if __name__ == '__main__':
    unittest.main()
