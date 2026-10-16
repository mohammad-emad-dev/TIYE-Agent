"""Check saved launcher-development evidence without launching any process."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/s4-codex-u0-launcher'


def main():
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    for name, expected in evidence['sourceSha256'].items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
            raise ValueError('source-changed:' + name)
    for name, expected in evidence['artifactSha256'].items():
        if hashlib.sha256((OUT / name).read_bytes()).hexdigest() != expected:
            raise ValueError('artifact-changed:' + name)
    tests = (OUT / 'tests.stderr.bin').read_text(encoding='utf-8')
    if evidence['testExitCode'] != 0 or not re.search(r'Ran 13 tests in .*\n\nOK', tests):
        raise ValueError('saved-tests-incomplete')
    offline = json.loads((OUT / 'offline.stdout.bin').read_bytes())
    if offline['state'] != 'offline-source-check' or offline['nativeLaunched'] is not False:
        raise ValueError('offline-check-incomplete')
    if evidence['nativeRuns'] != 0 or evidence['nativeAdmissionGranted'] is not False:
        raise ValueError('incorrect-native-claim')
    print('Saved launcher evidence verified: 13 tests; no native run; Phase1 HOLD')


if __name__ == '__main__':
    main()
