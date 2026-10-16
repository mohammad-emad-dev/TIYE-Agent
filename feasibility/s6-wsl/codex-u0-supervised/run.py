"""Offline by default; the integrated launcher accepts synthetic Windows peers only."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
U0 = SOURCE.parent / 'codex-u0'
WATCHDOG = SOURCE.parent / 'codex-u0-watchdog-v2'
MODES = ('valid', 'foreign', 'invalid-raw', 'blocked', 'root-exits')


def verify_dependencies():
    for report in ['s4-codex-u0-launcher', 's4-codex-u0-watchdog-v2']:
        evidence = json.loads((ROOT / 'output' / report / 'evidence.json').read_text(encoding='utf-8'))
        for relative, expected in evidence['sourceSha256'].items():
            if hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() != expected:
                raise ValueError('frozen-dependency-changed:' + relative)
    for name in ['host.py', 'worker.py']:
        if not (SOURCE / name).is_file():
            raise ValueError('integration-source-missing:' + name)


def source_hashes():
    paths = sorted(set(SOURCE.glob('*.py')) | set(U0.glob('*.py')) | set(WATCHDOG.glob('*.py')))
    return {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in paths}


def synthetic_config(args):
    if os.name != 'nt':
        raise ValueError('synthetic-windows-host-required')
    if not math.isfinite(args.seconds) or not 0 < args.seconds <= 10:
        raise ValueError('synthetic-deadline-must-be-within-10-seconds')
    folder = args.directory.resolve(strict=True)
    if not folder.is_dir() or len(args.nonce) != 32 or any(c not in '0123456789abcdef' for c in args.nonce):
        raise ValueError('invalid-synthetic-folder-or-nonce')
    config = {'argv': [sys.executable, '-I', '-S', '-B', '-u', str(SOURCE / 'host.py'),
                       args.synthetic, str(folder), args.nonce],
              'cwd': str(folder), 'nonce': args.nonce, 'seconds': args.seconds,
              'ready': str(folder / 'watchdog-ready.json'),
              'report': str(folder / 'watchdog-report.json')}
    with (folder / 'input.json').open('x', encoding='utf-8') as stream:
        json.dump({'sourceSha256': source_hashes(), 'config': config,
                   'scope': 'synthetic-windows-integration', 'nativeAdmissionGranted': False}, stream, indent=2)
    return config


def supervise_synthetic(args):
    verify_dependencies()
    config = synthetic_config(args)
    # Use the frozen corrected component rather than a modified historical capture.
    spec = importlib.util.spec_from_file_location('tiye_frozen_watchdog', WATCHDOG / 'watchdog.py')
    watchdog = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(watchdog)
    return watchdog.supervise(config)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--synthetic', choices=MODES)
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--nonce')
    parser.add_argument('--seconds', type=float, default=6)
    parser.add_argument('--capture', action='store_true', help='Native execution is disabled')
    args = parser.parse_args()
    if args.capture:
        parser.error('native-capture-disabled: Linux ownership and privacy reviews remain open')
    if args.synthetic:
        if args.directory is None or args.nonce is None:
            parser.error('--synthetic requires --directory and --nonce')
        return supervise_synthetic(args)
    if args.directory is not None or args.nonce is not None:
        parser.error('--directory and --nonce require --synthetic')
    verify_dependencies()
    for folder in (SOURCE, U0, WATCHDOG):
        for path in folder.glob('*.py'):
            compile(path.read_text(encoding='utf-8'), str(path), 'exec')
    print(json.dumps({'state': 'offline-source-check', 'nativeLaunched': False,
                      'sourceSha256': source_hashes(), 'nativeAdmissionGranted': False}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
