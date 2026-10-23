"""Publish offline decision examples or verify their source and artifact binding."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
import uuid

from policy import EXPORT_REQUIREMENTS,observation_from_record,recovery_decision
from saved import saved_decisions,verified_saved_record

SOURCE=Path(__file__).resolve().parent
ROOT=SOURCE.parents[2]
OUT=ROOT/'output/s6-recovery-decision'
REFERENCES={'output/s6-inspector-interruption/evidence.json','output/s6-native-contract/contract.json',
    'architecture/TIYE-Agent-Architecture.md','architecture/TIYE-Agent-Product-Specification.md'}
ARTIFACTS={'README.md','DECISION-CONTRACT.md','examples.json','review.json'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    return {path.relative_to(ROOT).as_posix():digest(path) for path in sorted(SOURCE.glob('*.py'))}


def save(path,record):
    path.write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')


def validate_examples(record):
    if type(record) is not dict or set(record)!={'scope','tests','scenarios','savedEvidence','exportRequirements','nativeExecutionAllowed'}:
        raise ValueError('recovery-examples-schema')
    if (record['scope']!='offline-recovery-decision-contract' or type(record['tests']) is not int
            or record['tests']!=5 or record['nativeExecutionAllowed'] is not False
            or record['exportRequirements']!=list(EXPORT_REQUIREMENTS)):
        raise ValueError('recovery-examples-scope')
    import test_policy
    if type(record['scenarios']) is not list or len(record['scenarios'])!=len(test_policy.CASES):
        raise ValueError('recovery-examples-scenarios')
    for row,(name,changes,expected) in zip(record['scenarios'],test_policy.CASES):
        observation=test_policy.BASE|changes
        exact={'case':name,'observation':observation,'decision':recovery_decision(observation_from_record(observation))}
        if json.dumps(row,sort_keys=True)!=json.dumps(exact,sort_keys=True):
            raise ValueError('recovery-examples-promotion')
    if json.dumps(record['savedEvidence'],sort_keys=True)!=json.dumps(saved_decisions(verified_saved_record()),sort_keys=True):
        raise ValueError('recovery-saved-evidence-drift')


def develop():
    import test_policy
    bound=sources()
    log=io.StringIO()
    report=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(test_policy))
    if not report.wasSuccessful():
        print(log.getvalue())
        raise RuntimeError('recovery-decision-tests-failed')
    examples={'scope':'offline-recovery-decision-contract','tests':report.testsRun,
        'scenarios':[{'case':name,'observation':test_policy.BASE|changes,
            'decision':recovery_decision(observation_from_record(test_policy.BASE|changes))}
            for name,changes,expected in test_policy.CASES],
        'savedEvidence':saved_decisions(verified_saved_record()),'exportRequirements':list(EXPORT_REQUIREMENTS),
        'nativeExecutionAllowed':False}
    validate_examples(examples)
    if sources()!=bound:
        raise ValueError('recovery-source-drift-during-tests')
    OUT.mkdir(exist_ok=True)
    save(OUT/'examples.json',examples)
    destination=ROOT/'.git/tiye-recovery-decision'/uuid.uuid4().hex
    destination.mkdir(parents=True)
    save(destination/'report.json',{'sources':bound,'tests':report.testsRun,'optimization':sys.flags.optimize,
        'examplesSha256':digest(OUT/'examples.json'),'successful':True})
    print('Five recovery decision tests passed; 360 evidence combinations checked: '+str(destination/'report.json'))


def verify():
    evidence=json.loads((OUT/'evidence.json').read_bytes())
    if (set(evidence)!={'sources','artifacts','references','nativeExecutionAllowed'} or evidence['sources']!=sources()
            or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('recovery-source-or-scope-drift')
    for key,names,base in (('artifacts',ARTIFACTS,OUT),('references',REFERENCES,ROOT)):
        if set(evidence[key])!=names or any(digest(base/name)!=sha for name,sha in evidence[key].items()):
            raise ValueError('recovery-evidence-drift')
    validate_examples(json.loads((OUT/'examples.json').read_bytes()))
    print('Saved recovery decision contract verified; export execution disabled')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop',action='store_true')
    args=parser.parse_args()
    develop() if args.develop else verify()
