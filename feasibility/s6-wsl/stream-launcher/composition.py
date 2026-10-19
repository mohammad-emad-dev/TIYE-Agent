"""Source references for the new mock stream/launcher composition."""
import hashlib
import json
import re
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
LEGACY = SOURCE.parent / 'consolidated-launcher'
WRITER = SOURCE.parent / 'stream-writer'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py')) + list(LEGACY.glob('*.py'))
    paths += [WRITER / 'writer.py']
    paths += [SOURCE.parent / 'private-capture-store' / name for name in ('store.py', 'winacl.py')]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def fingerprint(mapping):
    return hashlib.sha256(json.dumps(mapping, sort_keys=True).encode('ascii')).hexdigest()


def validate(config):
    fields = {'linuxRoot', 'windowsRoot', 'nonce', 'mode', 'scenario',
              'sourceSha256', 'composition', 'captureParent'}
    if set(config) != fields or not re.fullmatch('[0-9a-f]{32}', config['nonce']):
        raise ValueError('config-or-attempt-shape')
    actual = sources()
    if config['sourceSha256'] != actual or config['composition'] != fingerprint(actual):
        raise ValueError('composition-source-drift')
    modes = {'valid': 'valid', 'stop-pending': 'stop-pending', 'owner-loss': 'owner-loss',
             'stderr-overflow': 'transport-loss'}
    if config['scenario'] not in modes or config['mode'] != modes[config['scenario']]:
        raise ValueError('mock-scenario-only')


def config_digest(config):
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode('utf-8')).hexdigest()


def validate_result(record, expected):
    if any(type(record.get(key)) is not type(value) or record.get(key) != value
           for key, value in expected.items()):
        raise ValueError('stale-or-unbound-result')
