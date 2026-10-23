"""Offline recovery presentation contract; it issues no execution authority."""
from dataclasses import dataclass

DOMAINS={
    'provenance':{'current-bound','historical'},
    'authority':{'original-observer','pinned-inspector','none'},
    'keeper':{'live','ended','unconfirmed'},
    'observer':{'live','ended','unconfirmed'},
    'inspector':{'live','ended','not-enrolled','unconfirmed'},
    'custody':{'verified-held','unconfirmed'},
    'terminal':{'verified-normal','protocol-fault','absent','invalid','unconfirmed'},
    'receipt':{'verified-unknown','invalid','absent','unconfirmed'},
    'copy':{'verified-fixed-fixture','none','unconfirmed'},
}
EXPORT_REQUIREMENTS=(
    'qualified-export-executor','fresh-authenticated-owner','pinned-session-and-mount',
    'worker-stop-evidence','bounded-selected-inventory','explicit-per-export-grant',
    'private-separate-destination','destination-capacity-and-write-accounting',
    'copy-fsync-readback-and-manifest-match','source-custody-retained',
)
MESSAGES={
    'historical-only':('Live custody is unconfirmed',
        'Saved results describe an earlier observation. They cannot authorize recovery now.','reconnect-live-owner'),
    'held-original':('Data is held','The original observer can inspect the held data.','inspect-with-original-observer'),
    'held-inspector':('Data is held','The enrolled inspector can inspect the held data.','inspect-with-pinned-inspector'),
    'holder-ended':('Custody is unconfirmed','The previous holder ended. A saved record cannot restore its live reference.','pause-and-reconcile'),
    'reader-ended':('No authorized live reader',
        'Keep recovery paused. The ended inspector slot cannot be replaced automatically.','keep-held-and-review'),
    'authority-unconfirmed':('Recovery is paused','A live authenticated reader has not been established.','reconcile-live-authority'),
}


@dataclass(frozen=True)
class Observation:
    provenance:str
    authority:str
    keeper:str
    observer:str
    inspector:str
    custody:str
    terminal:str
    receipt:str
    copy:str

    def __post_init__(self):
        for name,allowed in DOMAINS.items():
            entry=getattr(self,name)
            if type(entry) is not str or entry not in allowed:
                raise ValueError('recovery-observation-domain:'+name)
        validate_bindings(self)


def validate_bindings(observation):
    if observation.provenance=='historical' and observation.authority!='none':
        raise ValueError('historical-evidence-has-no-live-authority')
    if observation.keeper!='live' and observation.custody=='verified-held':
        raise ValueError('held-custody-without-live-holder-observation')
    if observation.provenance=='historical':
        return
    if observation.authority=='none' and observation.custody=='verified-held':
        raise ValueError('current-custody-without-authenticated-reader')
    if observation.authority!='none' and (observation.keeper!='live' or observation.custody!='verified-held'):
        raise ValueError('reader-without-current-bound-custody')
    if observation.authority=='original-observer' and observation.observer!='live':
        raise ValueError('original-observer-not-live')
    if observation.authority=='pinned-inspector' and (observation.observer!='ended' or observation.inspector!='live'):
        raise ValueError('inspector-not-authorized-after-observer-loss')


def observation_from_record(record):
    if type(record) is not dict or set(record)!=set(DOMAINS):
        raise ValueError('recovery-observation-schema')
    return Observation(**record)


def decision_code(observation):
    if observation.provenance=='historical':
        return 'historical-only'
    if observation.authority=='original-observer':
        return 'held-original'
    if observation.authority=='pinned-inspector':
        return 'held-inspector'
    if observation.keeper=='ended':
        return 'holder-ended'
    if observation.observer=='ended' and observation.inspector=='ended':
        return 'reader-ended'
    return 'authority-unconfirmed'


def recovery_decision(observation):
    if type(observation) is not Observation:
        raise TypeError('recovery-decision-requires-validated-observation')
    code=decision_code(observation)
    title,description,next_step=MESSAGES[code]
    return {'scope':'offline-recovery-decision-contract','status':code,'title':title,'description':description,
        'suggestedNextStep':next_step,'provenance':observation.provenance,
        'observedEvidence':{'custody':observation.custody,'terminal':observation.terminal,
            'receipt':observation.receipt,'copy':observation.copy},
        'exportPreparation':'blocked-unqualified-exporter','exportRequirements':list(EXPORT_REQUIREMENTS),
        'commands':[],'outcome':'unknown','cleanupVerified':False,'exportExecutionAllowed':False,
        'automaticRetryAllowed':False,'automaticDeletionAllowed':False,'automaticReleaseAllowed':False,
        'inspectorReplacementAllowed':False,'nativeExecutionAllowed':False}
