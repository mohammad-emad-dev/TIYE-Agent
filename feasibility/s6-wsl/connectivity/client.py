"""Direct or interop-pipe MCP client; stdin secrets are never emitted."""
import http.client
import json
import subprocess
import sys


def main():
    config = json.load(sys.stdin)
    report = {'route': config['route'], 'state': 'running', 'steps': []}
    sessions = {}
    counter = 0
    def request(method, member=None, body=None, session=None, token=None):
        headers = {'accept': 'application/json, text/event-stream', 'mcp-protocol-version': '2025-03-26'}
        if token is not None or member is not None:
            headers['authorization'] = 'Bearer ' + (token if token is not None else config['tokens'][member])
        if session is not None:
            headers['mcp-session-id'] = session
        payload = json.dumps(body) if body is not None else ''
        if body is not None:
            headers['content-type'] = 'application/json'
        if config['route'] == 'ubuntu-interop-pipe':
            message = {'port': config['port'], 'method': method, 'headers': headers, 'body': payload}
            result = subprocess.run([config['linuxNodePath'], config['relayWindowsPath']],
                                    input=json.dumps(message).encode(), capture_output=True, timeout=7)
            if result.returncode or result.stderr or len(result.stdout) > 131072:
                raise RuntimeError('Relay unavailable or invalid output')
            response = json.loads(result.stdout)
            return response['status'], response['headers'], response['body']
        connection = http.client.HTTPConnection('127.0.0.1', config['port'], timeout=3)
        try:
            connection.request(method, '/mcp', body=payload, headers=headers)
            response = connection.getresponse()
            raw = response.read(65537)
            if len(raw) > 65536:
                raise RuntimeError('Response limit')
            return response.status, {k.lower(): v for k, v in response.getheaders()}, raw.decode('utf-8')
        finally:
            connection.close()
    def rpc(member, method, params, initialize=False):
        nonlocal counter
        counter += 1
        status, headers, body = request('POST', member, {'jsonrpc': '2.0', 'id': counter, 'method': method, 'params': params}, None if initialize else sessions[member])
        if status != 200:
            raise RuntimeError('RPC status')
        if headers.get('content-type', '').startswith('text/event-stream'):
            messages = [json.loads(line[5:].strip()) for line in body.splitlines() if line.startswith('data:')]
        else:
            messages = [json.loads(body)]
        replies = [m for m in messages if m.get('id') == counter]
        if len(replies) != 1 or 'result' not in replies[0]:
            raise RuntimeError('RPC correlation')
        if initialize:
            sessions[member] = headers['mcp-session-id']
        report['steps'].append({'member': member, 'operation': method, 'httpStatus': status, 'requestIdMatched': True})
        return replies[0]['result']
    try:
        for label, token in [('missing-token', None), ('bad-token', config['badToken'])]:
            status, _, _ = request('POST', body={}, token=token)
            report['steps'].append({'operation': label, 'httpStatus': status})
            if status != 401:
                raise RuntimeError('Auth negative control')
        for member in ['member-a', 'member-b']:
            rpc(member, 'initialize', {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'tiye-s6-local', 'version': '0.1.0'}}, initialize=True)
            status, _, _ = request('POST', member, {'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sessions[member])
            if status != 202:
                raise RuntimeError('Initialized notification')
            tools = rpc(member, 'tools/list', {})
            if sorted(t['name'] for t in tools['tools']) != ['ask_leader', 'delegate_task', 'report_result']:
                raise RuntimeError('Tool list mismatch')
            ack = rpc(member, 'tools/call', {'name': 'report_result', 'arguments': {'summary': config['nonce'], 'status': 'done'}})
            expected = 'ack report_result for ' + member + ' (feasibility only, no engine effect)'
            if ack.get('isError') or ack.get('content') != [{'type': 'text', 'text': expected}]:
                raise RuntimeError('Tool acknowledgement mismatch')
            report['steps'].append({'member': member, 'operation': 'acknowledgement', 'matched': True})
        status, _, _ = request('POST', 'member-b', {'jsonrpc': '2.0', 'id': 99, 'method': 'tools/list'}, sessions['member-a'])
        report['steps'].append({'operation': 'foreign-member-session', 'httpStatus': status})
        if status != 401:
            raise RuntimeError('Foreign session accepted')
        report['state'] = 'roundtrip-completed'
    except Exception as error:
        # Fixed class/category only: no request bodies, headers, sessions or token-bearing errors.
        report.update(state='route-incomplete', errorClass=type(error).__name__)
    finally:
        for member, session in sessions.items():
            try:
                status, _, _ = request('DELETE', member, session=session)
                report['steps'].append({'member': member, 'operation': 'delete-session', 'httpStatus': status})
                if status != 200:
                    report['state'] = 'route-incomplete'
            except Exception as error:
                report.update(state='route-incomplete', cleanupErrorClass=type(error).__name__)
    print(json.dumps(report))
    return 0 if report['state'] == 'roundtrip-completed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
