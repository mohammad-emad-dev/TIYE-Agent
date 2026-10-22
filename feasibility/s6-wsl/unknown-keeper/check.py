"""Verify saved broker evidence offline; --develop executes fixed fixtures."""
import argparse
import json

import build
import run_windows as run

OUT = run.ROOT / 'output/s6-unknown-keeper'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-supervised-broker/evidence.json', 'output/s6-native-contract/contract.json'}


def sha(path):
    return run.hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != run.sources() or evidence['nativeExecutionAllowed'] is not False
            or (run.SOURCE / 'linux_runtime.py').read_bytes() != build.generated()):
        raise ValueError('broker-evidence-source-drift')
    for key, expected, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, run.ROOT)]:
        if set(evidence[key]) != expected:
            raise ValueError('broker-evidence-artifact-set')
        for name, digest in evidence[key].items():
            if sha(base / name) != digest:
                raise ValueError('broker-evidence-artifact-drift')
    run.validate(json.loads((OUT / 'observations.json').read_bytes()))
    print('Saved supervised unknown keeper evidence verified; native execution remains disabled')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        run.develop()
    else:
        verify()
