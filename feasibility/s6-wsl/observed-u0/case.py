"""Startup observation gates readiness and final cleanup of the same owned fixture."""
from bindings import adapter, runtime


READY_OBSERVATION = {'beforeVerified': True, 'activeVerified': True,
                     'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}
FINAL_OBSERVATION = {'beforeActiveAfterVerified': True, 'helpersRetained': True,
                     'initializeResponseVerified': True, 'initializedPeerReceiptEstablished': False}


def validate_startup(record, expected):
    if type(record) is not dict or set(record) != set(expected) or any(
            record[key] is not verdict for key, verdict in expected.items()):
        raise ValueError('startup-observer-verdict-incomplete')


class ObservedCase(adapter.LiveCase):
    def __init__(self, mode):
        super().__init__(mode)
        self.startup_verified = False

    def ready(self):
        super().ready()
        validate_startup(self.linux_ready['startupObservation'], READY_OBSERVATION)

    def validate_linux(self, report):
        super().validate_linux({key: value for key, value in report.items() if key != 'startupObservation'})
        validate_startup(report['startupObservation'], FINAL_OBSERVATION)
        self.startup_verified = True


class ObservedRun(runtime.ScheduledRun):
    def prepare(self):
        self.case = ObservedCase(self.mode)
        self.case.prepare_linux()

    def summary(self):
        selected = super().summary()
        return selected | {'startupObserverVerified': self.case.startup_verified if self.case else False,
                           'initializeResponseVerified': self.case.startup_verified if self.case else False,
                           'initializedPeerReceiptEstablished': False,
                           'candidateExecuted': False, 'nativeAdmissionGranted': False}
