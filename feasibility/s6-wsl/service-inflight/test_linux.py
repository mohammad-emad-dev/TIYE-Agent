"""Real manager cleanup while a mock protocol child is independently live."""
import io
import json
import os
import select
import signal
import sys
import time
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import witness


class InflightTests(witness.ServiceTests):
    def prepare_protocol(self, stage):
        for name in ('transport.py', 'owned.py', 'protocol_peer.py'):
            (self.folder / name).write_bytes((SOURCE / name).read_bytes())
        (self.folder / 'mode.txt').write_text(stage)
        owned, cgroup = self.prepare()
        fd, child = witness.hold(self.folder / 'protocol-live.json', self.nonce)
        self.fds.append(fd)
        owned.append((fd, child))
        registered = witness.read_record(self.folder / 'registered.json')
        self.assertEqual(child['stage'], stage)
        self.assertIs(child['initializeReceived'], True)
        self.assertIs(child['initializedReceived'], stage == 'initialized')
        self.assertEqual(child['uid'], 1000)
        self.assertEqual(child['ppid'], owned[0][1]['pid'])
        self.assertNotEqual(child['sid'], owned[0][1]['sid'])
        self.assertEqual(child['cgroup'], '0::' + self.descriptor['controlGroup'])
        for key in ('pid', 'startTicks', 'uid'):
            self.assertEqual(registered['identity'][key], child[key])
        self.assertEqual(registered['cgroup'], child['cgroup'])
        self.assertFalse((self.folder / 'protocol.json').exists())
        return owned, cgroup, registered

    def exercise(self, stage, action):
        launched = time.monotonic()
        owned, cgroup, registered = self.prepare_protocol(stage)
        observer = {'pid': os.getpid(), 'uid': os.getuid(),
            'cgroup': Path('/proc/self/cgroup').read_text().strip()}
        unit_group = '0::' + self.descriptor['controlGroup']
        for outside in (observer, self.sentinel_id):
            self.assertNotEqual(outside['cgroup'], unit_group)
            self.assertFalse(outside['cgroup'].startswith(unit_group + '/'))
        before_action = witness.service.query(self.descriptor['unit'])
        self.assertEqual(before_action['returnCode'], 0)
        self.assertFalse(before_action.get('timedOut', False))
        self.assertEqual(before_action['properties']['ActiveState'], 'active')
        for key in ('Id', 'InvocationID', 'ControlGroup', 'MainPID'):
            self.assertEqual(before_action['properties'][key], self.descriptor['properties'][key])
        # Revalidate all held instances immediately before the destructive action.
        for fd, identity in owned:
            proc = Path('/proc') / str(identity['pid'])
            ticks = int((proc / 'stat').read_text().rsplit(')', 1)[1].split()[19])
            self.assertEqual(ticks, identity['startTicks'])
            self.assertEqual((proc / 'cgroup').read_text().strip(), identity['cgroup'])
            self.assertFalse(select.select([fd], [], [], 0)[0])
        self.assertIn('populated 1', (cgroup / 'cgroup.events').read_text())
        self.assertFalse((self.folder / 'protocol.json').exists())
        pre_action_seconds = time.monotonic() - launched
        self.assertLess(pre_action_seconds, 1)
        started = time.monotonic()
        if action == 'crash':
            signal.pidfd_send_signal(owned[0][0], signal.SIGKILL)
        else:
            self.stop_receipt = witness.service.stop_owned(self.descriptor)
            after_stop = self.stop_receipt['postStopQuery']['properties']
            self.assertEqual(after_stop['Result'], 'timeout')
            self.assertEqual(after_stop['ExecMainStatus'], '9')
        self.finish('main-crash' if action == 'crash' else 'live-stop', owned, cgroup, started)
        self.assertFalse((self.folder / 'protocol.json').exists())
        launch_to_cleanup = time.monotonic() - launched
        self.assertLess(launch_to_cleanup, 3)
        record = witness.OBSERVATIONS[-1]
        record.update(case=stage + '-' + action, stage=stage, action=action,
            preActionSeconds=pre_action_seconds, launchToCleanupSeconds=launch_to_cleanup,
            beforeActionQuery=before_action,
            observerIdentity=observer,
            registeredChild=registered, originalInstancesLiveBeforeAction=True,
            protocolResultPresentBefore=False, protocolResultPresentAfter=False,
            protocolCompletion='interrupted-unobserved')

    def test_pending_initialize_worker_crash_cleans_live_protocol_child(self):
        self.exercise('pending', 'crash')

    def test_initialized_worker_crash_cleans_live_protocol_child(self):
        self.exercise('initialized', 'crash')

    def test_pending_initialize_stop_cleans_live_protocol_child(self):
        self.exercise('pending', 'stop')

    def test_initialized_stop_cleans_live_protocol_child(self):
        self.exercise('initialized', 'stop')


if __name__ == '__main__':
    if os.getuid() != 1000:
        raise ValueError('expected-non-root-uid1000')
    log = io.StringIO()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(InflightTests))
    print(json.dumps({'testCount': tests.testsRun, 'passed': tests.wasSuccessful(),
        'systemdVersion': witness.service.command(['/usr/bin/systemd-run', '--version'])['stdout'],
        'log': log.getvalue(), 'observations': witness.OBSERVATIONS}))
    raise SystemExit(0 if tests.wasSuccessful() else 1)
