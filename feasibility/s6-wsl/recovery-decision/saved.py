"""Import only the sealed interruption verdicts, always as historical evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from policy import Observation,recovery_decision

ROOT=Path(__file__).resolve().parents[3]
COHORT=ROOT/'output/s6-inspector-interruption'


def verified_saved_record():
    subprocess.run([sys.executable,'-B',str(ROOT/'feasibility/s6-wsl/inspector-interruption/check.py')],
        cwd=ROOT,check=True,capture_output=True,timeout=30)
    manifest=json.loads((COHORT/'evidence.json').read_bytes())
    if manifest['nativeExecutionAllowed'] is not False:
        raise ValueError('saved-native-admission')
    payload=(COHORT/'observations.json').read_bytes()
    if hashlib.sha256(payload).hexdigest()!=manifest['artifacts']['observations.json']:
        raise ValueError('saved-observation-drift')
    return json.loads(payload)


def historical_observation(snapshot):
    if snapshot['outcome']!='unknown' or snapshot['nativeExecutionAllowed'] is not False:
        raise ValueError('saved-verdict-promotion')
    disposed=snapshot['fixtureDisposalVerified']
    return Observation(provenance='historical',authority='none',keeper='ended' if disposed else 'live',
        observer='ended' if snapshot['observerLossVerified'] else 'unconfirmed',
        inspector=snapshot['inspectorState'] if snapshot['inspectorState'] in ('live','ended') else 'unconfirmed',
        custody='unconfirmed' if disposed else 'verified-held',terminal=snapshot['terminalEvidence'],
        receipt='verified-unknown' if snapshot['retentionReceiptVerified'] else 'invalid',copy='none')


def saved_decisions(record):
    return [{'case':case['observed']['interruption'],'stage':stage,
        'decision':recovery_decision(historical_observation(case[stage]))}
        for case in record['cases'] for stage in ('beforeObserverLoss','observed','afterExplicitFixtureDisposal')]
