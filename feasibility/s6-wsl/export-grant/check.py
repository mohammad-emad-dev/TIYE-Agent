"""Run the offline grant contract or verify saved deterministic examples and hashes."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
import uuid

from examples import example_evidence

SOURCE=Path(__file__).resolve().parent
ROOT=SOURCE.parents[2]
OUT=ROOT/'output/s6-export-grant'
ARTIFACTS={'README.md','REQUEST-CONTRACT.md','examples.json','review.json'}
REFERENCES={'output/s6-recovery-decision/evidence.json','output/s6-recovery-decision/DECISION-CONTRACT.md',
    'output/s6-native-contract/contract.json'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    return {path.relative_to(ROOT).as_posix():digest(path) for path in sorted(SOURCE.glob('*.py'))}


def save(path,record):
    path.write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')


def validate_examples(record):
    if json.dumps(record,sort_keys=True)!=json.dumps(example_evidence(),sort_keys=True):
        raise ValueError('synthetic-export-example-drift-or-promotion')


def develop():
    import test_grants
    bound=sources()
    log=io.StringIO()
    report=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(test_grants))
    if not report.wasSuccessful() or report.testsRun!=11:
        print(log.getvalue())
        raise RuntimeError('synthetic-export-grant-tests-failed')
    examples=example_evidence()
    validate_examples(examples)
    if sources()!=bound:
        raise ValueError('synthetic-export-grant-source-drift')
    OUT.mkdir(exist_ok=True)
    save(OUT/'examples.json',examples)
    destination=ROOT/'.git/tiye-export-grant'/uuid.uuid4().hex
    destination.mkdir(parents=True)
    save(destination/'report.json',{'sources':bound,'tests':report.testsRun,'successful':True,
        'optimization':sys.flags.optimize,'examplesSha256':digest(OUT/'examples.json')})
    print('Eleven synthetic export-grant tests passed: '+str(destination/'report.json'))


def verify():
    evidence=json.loads((OUT/'evidence.json').read_bytes())
    if (set(evidence)!={'sources','artifacts','references','nativeExecutionAllowed'} or evidence['sources']!=sources()
            or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('synthetic-export-grant-source-or-scope-drift')
    for key,names,base in (('artifacts',ARTIFACTS,OUT),('references',REFERENCES,ROOT)):
        if set(evidence[key])!=names or any(digest(base/name)!=sha for name,sha in evidence[key].items()):
            raise ValueError('synthetic-export-grant-artifact-drift')
    validate_examples(json.loads((OUT/'examples.json').read_bytes()))
    print('Saved synthetic export-grant evidence verified; export execution disabled')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop',action='store_true')
    args=parser.parse_args()
    develop() if args.develop else verify()
