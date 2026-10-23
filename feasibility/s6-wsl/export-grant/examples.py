"""Deterministic synthetic plan evidence; no ticket identifiers or secrets escape."""
import json

from grants import GrantRegistry
from request import Binding,review_request

MANIFEST={'version':1,'scope':'synthetic-export-plan-v1','session':'a'*32,'generation':1,'ownerEpoch':'b'*32,
    'source':{'device':101,'inode':1},'destination':{'device':7,'inode':42},'nonce':'c'*32,
    'validForSeconds':30,'byteBudget':1024,'files':[{'path':'notes/result.txt','bytes':12,'sha256':'d'*64}]}
BINDING=Binding('a'*32,1,'b'*32,(101,1),(7,42))


def refusal(operation):
    try:
        operation()
    except ValueError:
        return True
    raise ValueError('synthetic-grant-unexpectedly-accepted')


def example_evidence():
    payload=json.dumps(MANIFEST).encode()
    review=review_request(payload)
    registry=GrantRegistry()
    ticket=registry.issue_reviewed(payload,BINDING,review['requestSha256'])
    plan=registry.consume(ticket,payload,BINDING)
    replay=refusal(lambda:registry.consume(ticket,payload,BINDING))
    other=GrantRegistry()
    other_ticket=other.issue_reviewed(payload,BINDING,review['requestSha256'])
    drift=Binding('a'*32,2,'b'*32,(101,1),(7,42))
    rejected_drift=refusal(lambda:other.consume(other_ticket,payload,drift))
    burned_drift=refusal(lambda:other.consume(other_ticket,payload,BINDING))
    return {'scope':'offline-synthetic-export-grant','tests':11,'manifest':json.loads(payload),'review':review,'validatedPlan':plan,
        'duplicateConsumeRefused':replay,'bindingDriftRefused':rejected_drift,'driftedGrantRemainsBurned':burned_drift,
        'nativeExecutionAllowed':False}
