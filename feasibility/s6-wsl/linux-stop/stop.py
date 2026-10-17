import signal
import time


def stop_owned(owner) -> dict:
    started = time.monotonic()
    root_before = owner.report()
    term_deadline = started + 0.25
    stop_deadline = started + 2.0
    term_signals = 0
    kill_signals = 0
    observed_empty = False

    while True:
        now = time.monotonic()
        if now >= stop_deadline:
            owner.sweep()
            observed_empty = owner.empty()
            break

        owner.sweep()
        if time.monotonic() >= term_deadline:
            kill_signals += owner.send_once(signal.SIGKILL)
        else:
            term_signals += owner.send_once(signal.SIGTERM)

        if owner.empty():
            observed_empty = True
            break

        remaining = stop_deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.01, remaining))

    after = owner.report()
    return {
        "rootBefore": root_before,
        "after": after,
        "termSignals": term_signals,
        "killSignals": kill_signals,
        "observedEmpty": observed_empty,
        "elapsedSeconds": time.monotonic() - started,
    }
