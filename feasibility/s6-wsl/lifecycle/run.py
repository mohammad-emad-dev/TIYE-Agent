"""Own Windows launcher handles; inspect/recover only the recorded Linux fixtures."""
import hashlib
import json
import queue
import subprocess
import threading
import time
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUTPUT = ROOT / 'output/s6-lifecycle'
WSL = ['wsl.exe', '-d', 'Ubuntu', '--cd', '/tmp', '--exec', '/usr/bin/env', '-i',
       'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL=C.UTF-8',
       '/usr/bin/python3', '-u', '-c']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    OUTPUT.mkdir(exist_ok=False)
    code = (SOURCE / 'linux.py').read_text(encoding='utf-8')
    sources = [SOURCE / name for name in ['run.py', 'linux.py', 'protocol.json']]
    report = {'schema': 'tiye-s6-lifecycle-v1', 'state': 'running', 'cases': [],
              'sourceHashes': {p.relative_to(ROOT).as_posix(): digest(p) for p in sources},
              'fullS6Qualified': False, 'productionEligible': False, 'duplicateLaunches': 0}
    def save():
        (OUTPUT / 'evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    deadline = time.monotonic() + 120
    def budget(limit):
        value = min(limit, deadline - time.monotonic())
        if value <= 0:
            raise RuntimeError('Cohort deadline exceeded')
        return value
    def observe(case, label, mode, config):
        started = time.monotonic()
        command = WSL + [code, mode, config['nonce']]
        entry = {'label': label, 'mode': mode}
        try:
            result = subprocess.run(command, input=(json.dumps(config) + '\n').encode(), capture_output=True, timeout=budget(12))
            entry.update(exitCode=result.returncode, timedOut=False)
            stdout, stderr = result.stdout, result.stderr
        except subprocess.TimeoutExpired as error:
            entry.update(exitCode=None, timedOut=True)
            stdout, stderr = error.stdout or b'', error.stderr or b''
        entry['elapsedMs'] = (time.monotonic() - started) * 1000
        for stream, raw in [('stdout', stdout), ('stderr', stderr)]:
            path = OUTPUT / (case['scenario'] + '-' + label + '.' + stream + '.bin')
            path.write_bytes(raw)
            entry[stream] = {'artifact': path.name, 'bytes': len(raw), 'sha256': digest(path)}
        case['observations'].append(entry)
        save()
        if entry['exitCode'] != 0 or stderr:
            raise RuntimeError(label + ' unverified; no retry')
        entry['result'] = json.loads(stdout)
        save()
        return entry['result']
    save()
    try:
        for scenario in ['graceful', 'launcher-exit']:
            nonce = uuid.uuid4().hex
            case = {'scenario': scenario, 'nonce': nonce, 'observations': []}
            report['cases'].append(case)
            output_lines, error_lines = [], []
            ready_queue = queue.Queue()
            child = subprocess.Popen(WSL + [code, 'supervisor', nonce], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            case['ownedWindowsLauncherPid'] = child.pid
            def read(stream, lines, parse):
                for raw in iter(stream.readline, b''):
                    lines.append(raw)
                    if parse:
                        try:
                            message = json.loads(raw)
                            if message.get('event') == 'ready':
                                ready_queue.put(message)
                        except (ValueError, UnicodeError):
                            pass
            threads = []
            for stream, lines, parse in [(child.stdout, output_lines, True), (child.stderr, error_lines, False)]:
                thread = threading.Thread(target=read, args=(stream, lines, parse), daemon=True)
                thread.start(); threads.append(thread)
            config = None
            try:
                child.stdin.write((json.dumps({'scenario': scenario, 'nonce': nonce}) + '\n').encode())
                child.stdin.flush()
                ready = ready_queue.get(timeout=budget(8))
                case['ready'] = ready
                config = {'root': ready['root'], 'nonce': nonce, 'registrySha256': ready['registrySha256']}
                first = observe(case, 'live-first', 'inspect', config)
                time.sleep(0.25)
                second = observe(case, 'live-second', 'inspect', config)
                if any(s['status'] != 'verified-live' for s in second['states']):
                    raise RuntimeError('Live identities unverified')
                if not all(second['heartbeats'][role]['counter'] > first['heartbeats'][role]['counter'] for role in ['root', 'child']):
                    raise RuntimeError('Heartbeats did not grow')
                if scenario == 'graceful':
                    child.stdin.write((json.dumps({'action': 'stop', 'nonce': nonce}) + '\n').encode())
                    child.stdin.flush()
                    child.wait(timeout=budget(6))
                    case['launcherAction'] = 'nonce-bound stdin stop'
                    if child.returncode != 0:
                        raise RuntimeError('Graceful launcher exit failed')
                else:
                    negative = observe(case, 'negative-identity', 'negative', config)
                    if negative['decision'] != 'paused-unverified' or negative['signals']:
                        raise RuntimeError('Identity mismatch did not refuse cleanly')
                    live = observe(case, 'after-negative', 'inspect', config)
                    if any(s['status'] != 'verified-live' for s in live['states']):
                        raise RuntimeError('Negative control affected live fixture')
                    child.terminate()
                    child.wait(timeout=budget(5))
                    case['launcherAction'] = 'terminate owned Windows wsl.exe Popen handle'
                    observe(case, 'after-launcher-exit', 'inspect', config)
                    observe(case, 'recovery', 'recover', config)
                case['ownedLauncherExitCode'] = child.returncode
                final = observe(case, 'final', 'wait-gone', config)
                time.sleep(0.25)
                stable = observe(case, 'stable', 'inspect', config)
                if any(s['status'] != 'gone' for s in stable['states']):
                    raise RuntimeError('Original identities not proven absent')
                if stable['heartbeats'] != final['heartbeats'] or stable['ageSeconds'] >= 30:
                    raise RuntimeError('Heartbeat stability or pre-expiry bound failed')
                case['completed'] = True
            finally:
                if child.poll() is None:
                    child.terminate(); child.wait(timeout=5)
                    case['emergencyOwnedLauncherTermination'] = True
                child.stdin.close()
                for thread in threads:
                    thread.join(timeout=2)
                for stream, lines in [('stdout', output_lines), ('stderr', error_lines)]:
                    path = OUTPUT / (scenario + '-launcher.' + stream + '.bin')
                    path.write_bytes(b''.join(lines))
                    case['launcher-' + stream] = {'artifact': path.name, 'bytes': path.stat().st_size, 'sha256': digest(path)}
                case['launcherStreamsJoined'] = all(not t.is_alive() for t in threads)
                save()
        report['state'] = 'bounded-lifecycle-observations-completed'
    except (RuntimeError, OSError, ValueError, queue.Empty, subprocess.SubprocessError) as error:
        report.update(state='incomplete', failureCategory=type(error).__name__, failure=str(error))
    report['sourceHashesUnchangedAfterRun'] = all(digest(ROOT / p) == h for p, h in report['sourceHashes'].items())
    save()
    print(json.dumps({k: v for k, v in report.items() if k != 'cases'}, indent=2))
    for case in report['cases']:
        print(json.dumps({'scenario': case['scenario'], 'completed': case.get('completed', False),
                          'observations': [{'label': o['label'], 'result': o.get('result')} for o in case['observations']]}, indent=2))
    return 0 if report['state'] == 'bounded-lifecycle-observations-completed' and report['sourceHashesUnchangedAfterRun'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
