"""Separate Windows job supervisor; no WSL or provider-specific behavior."""
import argparse
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winjob import ChildJob


def save(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
    temporary.replace(path)


def supervise(config):
    seconds = config['seconds']
    if type(seconds) not in [int, float] or not math.isfinite(seconds) or not 0 < seconds <= 120:
        raise ValueError('invalid-watchdog-deadline')
    started = time.monotonic()
    deadline = started + seconds
    report = {'schema': 'tiye-windows-job-watchdog-v1', 'nonce': config['nonce'],
              'deadlineSeconds': seconds, 'rootExitSeen': False,
              'windowsJobEmpty': False, 'linuxCleanup': 'unverified'}
    with ChildJob(config['argv'], config['cwd']) as child:
        report['rootPid'] = child.pid
        save(Path(config['ready']), {'nonce': config['nonce'], 'pid': child.pid})
        child.resume()
        while True:
            active = child.active_count()
            if child.wait(0):
                report.update(rootExitSeen=True, rootExitCode=child.exit_code())
            if active == 0:
                report['stopReason'] = 'job-empty'
                report['stopDecisionElapsedSeconds'] = time.monotonic() - started
                break
            if time.monotonic() >= deadline:
                decision = time.monotonic() - started
                report.update(stopReason='deadline', activeProcessesObservedBeforeStop=active,
                              stopDecisionElapsedSeconds=decision,
                              stopDecisionLatenessSeconds=max(0, decision - seconds))
                child.terminate()
                report['terminationRequestReturnedSeconds'] = time.monotonic() - started
                break
            time.sleep(min(0.02, max(0, deadline - time.monotonic())))
        # Separate bounded cleanup observation, not extra task execution time.
        cleanup_started = time.monotonic()
        cleanup_deadline = cleanup_started + 2
        while child.active_count() and time.monotonic() < cleanup_deadline:
            time.sleep(0.01)
        # Job accounting can empty before a terminating process handle is signaled.
        root_signaled = child.wait(max(0, cleanup_deadline - time.monotonic()))
        report.update(windowsJobEmpty=child.active_count() == 0,
                      rootHandleSignaled=root_signaled,
                      finalRootExitCode=child.exit_code(),
                      cleanupObservationSeconds=time.monotonic() - cleanup_started)
    report['elapsedSeconds'] = time.monotonic() - started
    save(Path(config['report']), report)
    if not report['windowsJobEmpty'] or not report['rootHandleSignaled']:
        return 1
    if report['stopReason'] == 'deadline':
        return 124
    return report['finalRootExitCode'] if report['finalRootExitCode'] is not None else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    args = parser.parse_args()
    return supervise(json.loads(args.config.read_text(encoding='utf-8')))


if __name__ == '__main__':
    raise SystemExit(main())
