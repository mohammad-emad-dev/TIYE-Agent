"""Source-bound mock host wrapper; never accepts a native command."""
import asyncio
import json
import os
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import composition
import adapter
import journal
import writer


def save(path, record):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(record, stream)
        stream.flush()
        os.fsync(stream.fileno())


async def run(config):
    composition.validate(config)
    root = Path(config['windowsRoot'])
    if (root / 'attempt.json').exists():
        raise journal.AttemptRefused('previous-attempt')
    # Import the frozen host under a distinct name; its own attempt hash is retained.
    import importlib.util
    spec = importlib.util.spec_from_file_location('frozen_host', composition.LEGACY / 'host.py')
    original = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    os.environ['LOCALAPPDATA'] = config['captureParent']
    capture = writer.StreamCapture()
    try:
        save(root / 'writer-intent.json', {'nonce': config['nonce'], 'composition': config['composition'],
            'configSha256': composition.config_digest(config),
            'path': str(capture.path), 'beforeSpawn': capture.verify_allocated(),
            'sourceSha256': config['sourceSha256']})
        adapter.install(capture)
        code = await original.run(config)
    finally:
        capture.close()
    state = capture.snapshot()
    save(root / 'writer-result.json', {'nonce': config['nonce'], 'composition': config['composition'],
                                     'configSha256': composition.config_digest(config), 'state': state})
    if config['scenario'] == 'stderr-overflow':
        result = json.loads((root / 'protocol-result.json').read_text(encoding='utf-8'))
        report = result['report']
        if (code == 1 and report['fault'] == 'capture-stream-overflow'
                and report['directChildReaped'] is True and all(report['readerEof'].values())
                and report['returnCode'] == 71 and report['signals'] == [] and report['spawnUncertain'] is False
                and not report['cleanupErrors'] and not result['heartbeatErrors']
                and result['leaseExitCode'] == 0 and state['fault'] == 'stream-overflow'
                and state['completed'] is False):
            return 0
    return code


if __name__ == '__main__':
    try:
        status = asyncio.run(run(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))))
    except journal.AttemptRefused:
        sys.stderr.buffer.write(b'attempt-already-recorded\n')
        status = 23
    raise SystemExit(status)
