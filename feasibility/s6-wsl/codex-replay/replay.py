"""Offline single-turn client policy prototype. No transport, auth or execution."""
import hashlib
import json
import zipfile


class ReplayError(ValueError):
    pass


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def decode_packet(raw):
    if len(raw) > 65536:
        raise ReplayError('packet-too-large')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ReplayError('duplicate-json-key')
            result[key] = value
        return result
    def invalid_constant(value):
        raise ReplayError('non-json-number')
    try:
        packet = json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid_constant)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ReplayError('invalid-json') from error
    if not isinstance(packet, dict):
        raise ReplayError('object-required')
    return packet


def request_key(value):
    if type(value) is str and value:
        return ('string', value)
    if type(value) is int and -(2**63) <= value < 2**63:
        return ('integer', value)
    raise ReplayError('invalid-request-id')


class ReplaySession:
    approval_files = {
        'item/commandExecution/requestApproval': 'CommandExecutionRequestApprovalParams.json',
        'item/fileChange/requestApproval': 'FileChangeRequestApprovalParams.json'
    }

    def __init__(self, schema_archive, thread_id='thread-owned', turn_id='turn-owned'):
        with zipfile.ZipFile(schema_archive) as archive:
            self.schemas = {name: json.loads(archive.read(name)) for name in archive.namelist()}
        self.thread_id, self.turn_id = thread_id, turn_id
        self.status = 'running'
        self.task_success = None
        self.terminal_packet = None
        self.approvals = {}
        self.resolved_ids = set()
        self.responses = {}

    def required(self, schema_name, value):
        # Only required-field checks for selected envelopes; not JSON Schema validation.
        if not isinstance(value, dict) or any(k not in value for k in self.schemas[schema_name].get('required', [])):
            raise ReplayError('missing-required-fields')

    def owned(self, params, turn_key='turnId'):
        return params.get('threadId') == self.thread_id and params.get(turn_key) == self.turn_id

    def expect_response(self, ident, method):
        if method not in ['turn/start', 'turn/interrupt']:
            raise ReplayError('unmodeled-client-request')
        key = request_key(ident)
        if key in self.responses:
            raise ReplayError('reused-client-request-id')
        self.responses[key] = {'method': method, 'state': 'pending'}

    def receive(self, packet):
        if not isinstance(packet, dict):
            raise ReplayError('object-required')
        if 'method' not in packet:
            return self.response(packet)
        method = packet['method']
        if not isinstance(method, str) or not method or 'result' in packet or 'error' in packet:
            raise ReplayError('ambiguous-message-envelope')
        if method in self.approval_files:
            return self.approval(packet)
        if method in ['turn/completed', 'serverRequest/resolved']:
            if 'id' in packet:
                raise ReplayError('notification-has-id')
            params = packet.get('params')
            if method == 'serverRequest/resolved':
                self.required('v2/ServerRequestResolvedNotification.json', params)
                key = request_key(params['requestId'])
                if params['threadId'] != self.thread_id:
                    return {'event': 'ignored-resolution'}
                if key not in self.approvals:
                    self.resolved_ids.add(key)
                    return {'event': 'unmatched-resolution-recorded'}
                record = self.approvals[key]
                if record['state'] == 'resolved':
                    return {'event': 'duplicate-resolution'}
                record['state'] = 'resolved'
                return {'event': 'approval-resolved'}
            self.required('v2/TurnCompletedNotification.json', params)
            turn = params['turn']
            if not isinstance(turn, dict) or not all(k in turn for k in ['id', 'items', 'status']):
                raise ReplayError('malformed-turn')
            if not isinstance(turn['items'], list) or not isinstance(turn['id'], str):
                raise ReplayError('malformed-turn')
            states = self.schemas['v2/TurnCompletedNotification.json']['definitions']['TurnStatus']['enum']
            if turn['status'] not in states:
                raise ReplayError('unknown-turn-status')
            if params['threadId'] != self.thread_id or turn['id'] != self.turn_id:
                return {'event': 'ignored-foreign-turn'}
            if turn['status'] == 'inProgress':
                return {'event': 'nonterminal-status'}
            stamp = fingerprint(packet)
            if self.terminal_packet is not None:
                if self.terminal_packet == stamp:
                    return {'event': 'duplicate-terminal'}
                self.status = 'needs-attention'
                return {'event': 'conflicting-terminal'}
            self.terminal_packet = stamp
            self.status = {'completed': 'protocol-completed', 'failed': 'failed', 'interrupted': 'interrupted'}[turn['status']]
            return {'event': self.status, 'taskSuccess': self.task_success}
        return {'event': 'unmodeled-method'}

    def response(self, packet):
        key = request_key(packet.get('id'))
        if ('result' in packet) == ('error' in packet):
            raise ReplayError('ambiguous-response')
        error = packet.get('error')
        if 'error' in packet and (not isinstance(error, dict) or type(error.get('code')) is not int or not isinstance(error.get('message'), str)):
            raise ReplayError('malformed-error')
        if key not in self.responses:
            return {'event': 'ignored-response'}
        record = self.responses[key]
        if record['state'] != 'pending':
            if record['fingerprint'] == fingerprint(packet):
                return {'event': 'duplicate-response'}
            self.status = 'needs-attention'
            return {'event': 'conflicting-response'}
        record['state'] = 'request-failed' if 'error' in packet else 'request-acknowledged'
        record['fingerprint'] = fingerprint(packet)
        return {'event': record['state'], 'method': record['method']}

    def approval(self, packet):
        key = request_key(packet.get('id'))
        params = packet.get('params')
        self.required(self.approval_files[packet['method']], params)
        if not all(isinstance(params[k], str) and params[k] for k in ['threadId', 'turnId', 'itemId']) or type(params['startedAtMs']) is not int:
            raise ReplayError('malformed-approval-context')
        if not self.owned(params):
            return {'event': 'ignored-foreign-approval'}
        if key in self.resolved_ids:
            return {'event': 'already-resolved-approval-refused'}
        if self.status != 'running':
            return {'event': 'late-approval-refused'}
        stamp = fingerprint(packet)
        if key in self.approvals:
            if self.approvals[key]['fingerprint'] != stamp:
                self.status = 'needs-attention'
                return {'event': 'conflicting-approval-id'}
            return {'event': 'duplicate-approval'}
        self.approvals[key] = {'packet': json.loads(json.dumps(packet)), 'fingerprint': stamp, 'state': 'pending'}
        return {'event': 'approval-pending', 'fingerprint': stamp}

    def decide(self, ident, decision, expected_fingerprint):
        key = request_key(ident)
        record = self.approvals.get(key)
        if self.status != 'running' or record is None or record['state'] != 'pending':
            raise ReplayError('approval-not-pending')
        if expected_fingerprint != record['fingerprint']:
            raise ReplayError('operation-changed')
        command = record['packet']['method'] == 'item/commandExecution/requestApproval'
        if decision == 'acceptForSession':
            return {'event': 'wider-grant-refused', 'scope': 'session', 'reply': None}
        if isinstance(decision, dict) and command:
            if set(decision) == {'acceptWithExecpolicyAmendment'}:
                return {'event': 'wider-grant-refused', 'scope': 'execpolicy', 'reply': None}
            if set(decision) == {'applyNetworkPolicyAmendment'}:
                return {'event': 'wider-grant-refused', 'scope': 'network-policy', 'reply': None}
        if type(decision) is not str or decision not in ['accept', 'decline', 'cancel']:
            raise ReplayError('unsupported-decision')
        record['state'] = 'replied'
        return {'event': 'reply-planned', 'scope': 'operation' if decision == 'accept' else 'denial',
                'reply': {'id': ident, 'result': {'decision': decision}}}
