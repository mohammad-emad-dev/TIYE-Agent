"""Independent fixed-deadline Job owner. No file I/O while the Job is live."""
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import composition
from control import parameters
from winjob import ChildJob


def decide(child, deadline):
    while True:
        active = child.active_count()
        if not active:
            return 'job-empty', active, time.monotonic()
        if child.wait(0):
            decision = time.monotonic()
            child.terminate(125)
            return 'owner-exit', active, decision
        if time.monotonic() >= deadline:
            decision = time.monotonic()
            child.terminate(124)
            return 'deadline', active, decision
        time.sleep(min(0.01, max(0, deadline - time.monotonic())))


def observe(child):
    started = time.monotonic()
    deadline = started + composition.OBSERVE
    while child.active_count() and time.monotonic() < deadline:
        time.sleep(0.01)
    root_signaled = child.wait(max(0, deadline - time.monotonic()))
    return {'windowsJobEmpty': child.active_count() == 0, 'rootHandleSignaled': root_signaled,
            'rootExitCode': child.exit_code(), 'cleanupObservationSeconds': time.monotonic() - started}


def supervise(mode, directory, nonce, binding):
    parameters(mode, nonce, binding)
    argv = [sys.executable, '-I', '-B', str(composition.SOURCE / 'worker.py'),
            mode, directory, nonce, binding]
    started = time.monotonic()
    with ChildJob(argv, str(composition.SOURCE)) as child:
        child.resume()
        reason, active, decision = decide(child, started + composition.DEADLINE)
        request_returned = time.monotonic() - started
        report = observe(child)
    report.update(mode=mode, nonce=nonce, composition=binding, stopReason=reason,
                  stopDecisionSeconds=decision - started, deadlineSeconds=composition.DEADLINE,
                  stopRequestReturnedSeconds=request_returned,
                  activeProcessesBeforeStop=active,
                  postCloseElapsedSeconds=time.monotonic() - started,
                  nativeExecutionAllowed=False)
    # A blocked consumer cannot delay the decision loop: the Job is already closed.
    print(json.dumps(report, allow_nan=False), flush=True)
    if not report['windowsJobEmpty'] or not report['rootHandleSignaled']:
        return 1
    return {'job-empty': 0, 'deadline': 124, 'owner-exit': 125}[reason]


if __name__ == '__main__':
    raise SystemExit(supervise(*sys.argv[1:]))
