"""Process-local synthetic grants burn atomically; validated plans cannot execute."""
from dataclasses import dataclass,field
import hashlib
import hmac
import math
import secrets
import threading
import time

from request import Binding,HEX32,HEX64,parse_request,require


@dataclass(frozen=True)
class Ticket:
    identity:str
    secret:str=field(repr=False)

    def __reduce_ex__(self,protocol):
        raise TypeError('synthetic-export-ticket-is-not-persistent')


@dataclass(frozen=True)
class PendingGrant:
    secret_digest:bytes
    request_digest:str
    binding:Binding
    issued_at:float
    deadline:float


def clock_value(clock):
    observed=clock()
    require(type(observed) in (int,float) and math.isfinite(observed),'export-clock-value')
    return float(observed)


class GrantRegistry:
    def __init__(self,clock=time.monotonic):
        self._clock=clock
        self._lock=threading.Lock()
        self._pending={}
        self._seen_nonces=set()

    def __getstate__(self):
        raise TypeError('synthetic-export-registry-is-not-persistent')

    def issue_reviewed(self,payload,binding,reviewed_digest):
        request=parse_request(payload)
        require(type(binding) is Binding and request.binding==binding,'export-mint-binding-drift')
        require(type(reviewed_digest) is str and HEX64.fullmatch(reviewed_digest) is not None
            and hmac.compare_digest(request.sha256,reviewed_digest),'export-review-digest-drift')
        with self._lock:
            require(request.nonce not in self._seen_nonces,'export-request-already-issued')
            require(len(self._seen_nonces)<64,'export-registry-lifetime-bound')
            issued_at=clock_value(self._clock)
            ticket=Ticket(secrets.token_hex(16),secrets.token_hex(32))
            require(ticket.identity not in self._pending,'export-random-identifier-collision')
            self._pending[ticket.identity]=PendingGrant(hashlib.sha256(ticket.secret.encode()).digest(),
                request.sha256,binding,issued_at,issued_at+request.valid_for)
            self._seen_nonces.add(request.nonce)
            return ticket

    def _claim(self,ticket):
        require(type(ticket) is Ticket and type(ticket.identity) is str and type(ticket.secret) is str
            and HEX32.fullmatch(ticket.identity) is not None and HEX64.fullmatch(ticket.secret) is not None,
            'export-ticket-schema')
        secret_digest=hashlib.sha256(ticket.secret.encode()).digest()
        with self._lock:
            pending=self._pending.get(ticket.identity)
            require(pending is not None and hmac.compare_digest(pending.secret_digest,secret_digest),'export-ticket-unrecognized')
            del self._pending[ticket.identity]
            return pending

    def consume(self,ticket,payload,current_binding):
        pending=self._claim(ticket)
        # The recognized grant is already gone before any fallible caller-input validation.
        request=parse_request(payload)
        now=clock_value(self._clock)
        require(pending.issued_at<=now<pending.deadline,'export-ticket-expired-or-clock-regressed')
        require(type(current_binding) is Binding and current_binding==pending.binding==request.binding,'export-current-binding-drift')
        require(hmac.compare_digest(request.sha256,pending.request_digest),'export-request-changed-after-review')
        return {'scope':'validated-synthetic-export-plan','requestSha256':request.sha256,'grantConsumed':True,
            'fileCount':len(request.files),'totalBytes':request.total_bytes,'commands':[],
            'exportExecutionAllowed':False,'cleanupVerified':False,'automaticRetryAllowed':False,
            'automaticDeletionAllowed':False,'automaticReleaseAllowed':False,'nativeExecutionAllowed':False,
            'outcome':'unknown'}
