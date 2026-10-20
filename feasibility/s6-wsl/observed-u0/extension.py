"""Applied inside the sealed synthetic Linux runtime; never launches Codex."""
INIT = {'id': 1, 'method': 'initialize', 'params': {'clientInfo': {
    'name': 'tiye_feasibility', 'title': 'TIYE feasibility', 'version': '0.0.1'},
    'capabilities': {'experimentalApi': False}}}
FIXTURE = r'''
import json,os,sys
from pathlib import Path
root,target=sys.argv[1:]
base=Path(root)/'codex-home/tmp/arg0'
base.mkdir(parents=True,mode=0o700)
os.chmod(base.parent,0o700)
session=base/'codex-arg0protocol'
session.mkdir(mode=0o700)
for name in ('apply_patch','applypatch','codex-linux-sandbox','codex-execve-wrapper'):
    os.symlink(target,session/name)
fd=os.open(session/'.lock',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
os.close(fd)
request=json.loads(sys.stdin.buffer.readline(16385).decode('utf-8'))
expected={'id':1,'method':'initialize','params':{'clientInfo':{'name':'tiye_feasibility',
'title':'TIYE feasibility','version':'0.0.1'},'capabilities':{'experimentalApi':False}}}
if request!=expected: raise ValueError('fixed-fixture-initialize')
reply={'id':1,'result':{'codexHome':os.environ['CODEX_HOME'],'platformFamily':'unix',
'platformOs':'linux','userAgent':'tiye-fixed-synthetic-fixture'}}
os.write(1,json.dumps(reply).encode()+b'\n')
notification=json.loads(sys.stdin.buffer.readline(16385).decode('utf-8'))
if notification!={'method':'initialized'}: raise ValueError('fixed-fixture-initialized')
# Keep the exact helper footprint for independent observation until owned cleanup.
sys.stdin.buffer.read(1)
'''


def validate_init_reply(payload, home):
    response = decode(payload.decode('utf-8', errors='strict'))
    expected = {'codexHome': home, 'platformFamily': 'unix', 'platformOs': 'linux',
                'userAgent': 'tiye-fixed-synthetic-fixture'}
    if (type(response) is not dict or set(response) != {'id', 'result'}
            or type(response['id']) is not int or response['id'] != 1 or response['result'] != expected):
        raise ValueError('initialize-reply-not-exact-fixture')


def initialize_fixture(child, home):
    outbound = encode(INIT) + b'\n'
    if len(outbound) > 16384 or child.stdin.write(outbound) != len(outbound):
        raise OSError('initialize-write-uncertain-no-retry')
    pending = bytearray()
    end = time.monotonic() + 2
    with selectors.DefaultSelector() as selector:
        selector.register(child.stdout, selectors.EVENT_READ)
        while b'\n' not in pending:
            allowance = end - time.monotonic()
            if allowance <= 0 or not selector.select(allowance):
                raise TimeoutError('initialize-response-timeout')
            block = os.read(child.stdout.fileno(), 4096)
            if not block or len(pending) + len(block) > 4096:
                raise ValueError('initialize-eof-or-record-cap')
            pending.extend(block)
    if not pending.endswith(b'\n') or pending.count(b'\n') != 1:
        raise ValueError('initialize-response-extra-record')
    validate_init_reply(bytes(pending[:-1]), home)
    outbound = encode({'method': 'initialized'}) + b'\n'
    if child.stdin.write(outbound) != len(outbound):
        raise OSError('initialized-write-uncertain-no-retry')


def worker(root, nonce):
    rootfd = open_root(root, nonce)
    verify_bundle(rootfd, nonce)
    ledger = Ledger('worker')
    runtime = STARTUP_OBSERVER['RuntimeRoot']()
    target = os.path.realpath('/usr/bin/python3')
    before = runtime.snapshot(target)
    child = subprocess.Popen([target, '-I', '-S', '-B', '-c', FIXTURE, str(runtime.path), target],
        env=runtime.environment(), cwd=runtime.path, start_new_session=True,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
    initialize_fixture(child, str(runtime.path / 'codex-home'))
    write_file(rootfd, 'startup.json', encode({'nonce': nonce, 'main': identity(os.getpid()),
        'leaf': identity(child.pid), 'runtimeRoot': str(runtime.path), 'runtimeIdentity': list(runtime.identity),
        'fixtureExecutable': target, 'beforeNodes': before['nodes'], 'initializeResponseVerified': True,
        'initializedLocallyWritten': True, 'initializedPeerReceiptEstablished': False}), ledger)
    reason, sequence, last, observed = lease_loop(nonce)
    try:
        write_file(rootfd, 'terminal.json', encode({'nonce': nonce, 'pid': os.getpid(), 'reason': reason,
            'lastSequence': sequence, 'ageSeconds': observed - last, 'chargedBeforeTerminal': ledger.used}), ledger)
    finally:
        os._exit(71)


_prepare_observer, _wait_cleanup, _finish_observer = prepare_observer, wait_cleanup, finish_observer
_emit = emit
STARTUP_RESULT = None


def bind_runtime(witness):
    startup = witness.startup
    root = Path(startup['runtimeRoot'])
    target = os.path.realpath('/usr/bin/python3')
    if (root.parent != Path('/tmp') or not re.fullmatch('tiye-startup-observer-[A-Za-z0-9_-]+', root.name)
            or startup['fixtureExecutable'] != target or startup['beforeNodes'] != 4
            or startup['initializeResponseVerified'] is not True or startup['initializedLocallyWritten'] is not True
            or startup['initializedPeerReceiptEstablished'] is not False):
        raise ValueError('startup-observer-binding')
    runtime = STARTUP_OBSERVER['RuntimeRoot'].__new__(STARTUP_OBSERVER['RuntimeRoot'])
    runtime.path = root
    runtime.fd = POLICY['open_directory'](str(root))
    runtime.identity = tuple(startup['runtimeIdentity'])
    witness.startup_runtime = runtime
    if STARTUP_OBSERVER['directory_identity'](runtime.fd)[:2] != runtime.identity:
        raise ValueError('startup-root-identity-mismatch')
    executable = os.open('/proc/' + str(startup['leaf']['pid']) + '/exe', os.O_RDONLY)
    witness.fixture_executable_fd = executable
    observed, expected = os.fstat(executable), os.stat(target, follow_symlinks=False)
    if (observed.st_dev, observed.st_ino) != (expected.st_dev, expected.st_ino):
        raise ValueError('startup-fixture-executable-identity')
    if runtime.snapshot(target)['helperSessions'] != 1:
        raise ValueError('startup-active-helper-inventory')


def prepare_observer(witness):
    global emit
    witness.startup_runtime, witness.fixture_executable_fd = None, None
    publisher = emit

    def publish_after_snapshot(record):
        if record['event'] == 'ready':
            bind_runtime(witness)
            record['startupObservation'] = {'beforeVerified': True, 'activeVerified': True,
                'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}
        publisher(record)

    emit = publish_after_snapshot
    try:
        _prepare_observer(witness)
    finally:
        emit = publisher


def wait_cleanup(witness):
    global STARTUP_RESULT
    started = _wait_cleanup(witness)
    runtime = witness.startup_runtime
    if runtime is None or runtime.snapshot(witness.startup['fixtureExecutable'])['helperSessions'] != 1:
        raise ValueError('startup-post-cleanup-retained-inventory')
    STARTUP_RESULT = {'beforeActiveAfterVerified': True, 'helpersRetained': True,
                     'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}
    return started


def finish_observer(witness):
    try:
        _finish_observer(witness)
    finally:
        with contextlib.ExitStack() as cleanup:
            if getattr(witness, 'startup_runtime', None) is not None:
                cleanup.callback(witness.startup_runtime.close)
            if getattr(witness, 'fixture_executable_fd', None) is not None:
                cleanup.callback(os.close, witness.fixture_executable_fd)


def emit(record):
    if record['event'] == 'result':
        if STARTUP_RESULT is None:
            raise ValueError('startup-observation-incomplete')
        record['startupObservation'] = STARTUP_RESULT
    _emit(record)
