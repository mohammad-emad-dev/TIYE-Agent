"""Malformed lease input revokes work and yields diagnostic evidence, never success."""


def lease_loop(nonce):
    pending=bytearray()
    sequence,last=0,time.monotonic()
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(0,selectors.EVENT_READ)
            while True:
                observed=time.monotonic()
                if observed-last>=1:
                    return 'expired',sequence,last,observed
                if not selector.select(min(0.1,last+1-observed)):
                    continue
                block=os.read(0,4096)
                if not block:
                    return ('fault-truncated' if pending else 'eof'),sequence,last,time.monotonic()
                pending.extend(block)
                if len(pending)>4096:
                    return 'fault-oversize',sequence,last,time.monotonic()
                while b'\n' in pending:
                    line,_,rest=pending.partition(b'\n')
                    try:
                        accepted=heartbeat(line,nonce,sequence)
                    except ValueError:
                        return 'fault-heartbeat',sequence,last,time.monotonic()
                    sequence,pending,last=accepted,bytearray(rest),time.monotonic()
    except OSError:
        return 'fault-read',sequence,last,time.monotonic()


def baseline_namespace_worker(root,nonce):
    global lease_loop
    lease_loop=BASELINE_LEASE
    BASELINE_NAMESPACE(root,nonce)
