"""One-shot public environment/briefing fixture with explicit WSL argv."""
import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s6-environment'
PREFIX = ['wsl.exe', '-d', 'Ubuntu', '--cd', '/tmp', '--exec']
BASE = ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'LC_ALL=C.UTF-8', 'GIT_CONFIG_NOSYSTEM=1', 'GIT_CONFIG_GLOBAL=/dev/null']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_command(values, allowed, code):
    if set(values) - set(allowed):
        raise ValueError('unknown-key')
    if any(not isinstance(value, str) or '\x00' in value for value in values.values()):
        raise ValueError('invalid-value')
    return PREFIX + ['/usr/bin/env', '-i', *BASE, *[key + '=' + value for key, value in values.items()],
                     '/usr/bin/python3', '-c', code]


def main():
    protocol = json.loads((SOURCE / 'protocol.json').read_text(encoding='utf-8'))
    OUTPUT.mkdir(exist_ok=False)
    sources = [SOURCE / name for name in ['run.py', 'mock.py', 'protocol.json']]
    report = {'schema': 'tiye-s6-environment-v1', 'state': 'running', 'cases': [], 'negativeCases': [],
              'sourceHashes': {p.relative_to(ROOT).as_posix(): digest(p) for p in sources},
              'fullS6Qualified': False, 'productionEligible': False, 'nativeLaunchRetries': 0}
    def save():
        (OUTPUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    deadline = time.monotonic() + protocol['totalDeadlineSeconds']
    host_env = {key: os.environ[key] for key in ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'] if key in os.environ}
    host_env.update(TIYE_NOT_FOR_CHILD=protocol['decoy'], WSLENV='TIYE_NOT_FOR_CHILD')
    task_id = 's6-public-' + uuid.uuid4().hex
    payload = {'taskId': task_id, 'briefing': protocol['briefing'], 'allowedKeys': protocol['allowedKeys']}
    code = (SOURCE / 'mock.py').read_text(encoding='utf-8')
    def query(label, command, body):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('Overall deadline exceeded')
        entry = {'label': label, 'command': command}
        started = time.monotonic()
        try:
            result = subprocess.run(command, input=json.dumps(body).encode('utf-8'), env=host_env,
                                    capture_output=True, timeout=min(protocol['queryTimeoutSeconds'], remaining))
            entry.update(exitCode=result.returncode, timedOut=False)
            stdout, stderr = result.stdout, result.stderr
        except subprocess.TimeoutExpired as error:
            entry.update(exitCode=None, timedOut=True)
            stdout, stderr = error.stdout or b'', error.stderr or b''
        entry['elapsedMs'] = (time.monotonic() - started) * 1000
        for stream, raw in [('stdout', stdout), ('stderr', stderr)]:
            path = OUTPUT / (label + '.' + stream + '.bin')
            path.write_bytes(raw)
            entry[stream] = {'artifact': path.name, 'bytes': len(raw), 'sha256': digest(path)}
        report['cases'].append(entry)
        save()
        if entry['exitCode'] != 0 or stderr:
            raise RuntimeError(label + ' failed; no retry')
        observation = json.loads(stdout)
        entry['observation'] = observation
        return observation
    save()
    try:
        for label, values, expected in [('unknown-key', {'TIYE_UNAPPROVED': 'public'}, 'unknown-key'),
                                        ('nul-value', {'TIYE_SENTINEL': 'public\x00suffix'}, 'invalid-value')]:
            try:
                build_command(values, protocol['allowedKeys'], code)
            except ValueError as error:
                report['negativeCases'].append({'case': label, 'category': str(error), 'nativeLaunches': 0})
                if str(error) != expected:
                    raise RuntimeError('Wrong rejection category')
            else:
                raise RuntimeError('Invalid environment accepted')
        control = "import json,os,sys; expected=json.load(sys.stdin)['decoy']; print(json.dumps({'decoyImported':os.environ.get('TIYE_NOT_FOR_CHILD')==expected}))"
        observed = query('decoy-import-control', PREFIX + ['/usr/bin/python3', '-c', control], {'decoy': protocol['decoy']})
        if not observed['decoyImported']:
            raise RuntimeError('Decoy import control unconfirmed')
        expected_brief = {'sha256': hashlib.sha256(protocol['briefing'].encode('utf-8')).hexdigest(),
                          'bytes': len(protocol['briefing'].encode('utf-8')), 'lines': len(protocol['briefing'].splitlines()), 'taskId': task_id}
        for label, values in [('explicit-allowlist', protocol['values']), ('baseline', {})]:
            observation = query(label, build_command(values, protocol['allowedKeys'], code), payload)
            if not observation['uidNonzero'] or observation['selected'] != values or observation['briefing'] != expected_brief or observation['decoyPresent']:
                raise RuntimeError(label + ' target mismatch')
            descendant = observation['descendant']
            if observation['descendantExitCode'] != 0 or descendant['selected'] != values or descendant['briefing'] != expected_brief or descendant['decoyPresent']:
                raise RuntimeError(label + ' descendant mismatch')
            expected_idents = {}
            if values:
                for role in ['AUTHOR', 'COMMITTER']:
                    timestamp = int(datetime.fromisoformat(values['GIT_' + role + '_DATE']).timestamp())
                    expected_idents['GIT_' + role + '_IDENT'] = values['GIT_' + role + '_NAME'] + ' <' + values['GIT_' + role + '_EMAIL'] + '> ' + str(timestamp) + ' +0000'
            if observation['gitIdents'] != expected_idents:
                raise RuntimeError(label + ' Git identity mismatch')
            save()
        report['state'] = 'bounded-propagation-completed'
    except (RuntimeError, OSError, ValueError, UnicodeError) as error:
        report.update(state='incomplete', failureCategory=type(error).__name__, failure=str(error))
    report['sourceHashesUnchangedAfterRun'] = all(digest(ROOT / name) == h for name, h in report['sourceHashes'].items())
    save()
    print(json.dumps({k: v for k, v in report.items() if k != 'cases'}, indent=2))
    print(json.dumps([{'label': c['label'], 'exitCode': c['exitCode'], 'observation': c.get('observation')} for c in report['cases']], indent=2))
    return 0 if report['state'] == 'bounded-propagation-completed' and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
