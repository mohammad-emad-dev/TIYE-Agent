"""Replace in-memory raw accumulation; reuse the original bounded protocol controls."""
import sys
import time

import composition
sys.path[:0] = [str(composition.LEGACY), str(composition.WRITER)]
import transport
import writer

OriginalCapture = transport.Capture
ACTIVE = None


class ProtectedCapture(OriginalCapture):
    async def pump(self, name):
        try:
            while True:
                chunk = await getattr(self.proc, name).read(writer.CHUNK)
                if not chunk:
                    self.eof[name] = True
                    ACTIVE.eof(name)
                    if name == 'stdout':
                        try:
                            self.context['eof']()
                        except (ValueError, UnicodeError, RecursionError):
                            self.fail('protocol-eof-fault')
                    return
                self.observed[name] += len(chunk)
                ACTIVE.feed(name, chunk)
                if ACTIVE.stop.is_set():
                    self.result.setdefault('captureFaultObservedMonotonic', time.monotonic())
                    self.fail('capture-' + ACTIVE.fault)
                if name == 'stdout' and not self.failed.is_set():
                    try:
                        self.context['feed'](chunk)
                    except (ValueError, UnicodeError, RecursionError):
                        self.fail('protocol-feed-fault')
        except OSError:
            ACTIVE.reader_failed(name)
            self.fail('capture-reader-error')

    async def work(self):
        await super().work()
        self.result['workStoppedMonotonic'] = time.monotonic()

    async def cleanup(self):
        original = self.context['beforeCleanup']
        async def measured_cleanup():
            self.result['cleanupHookEnteredMonotonic'] = time.monotonic()
            await original()
            self.result['cleanupHookReturnedMonotonic'] = time.monotonic()
        self.context['beforeCleanup'] = measured_cleanup
        await super().cleanup()

    async def finish(self):
        await super().finish()
        if (self.result['fault'] is None and all(self.eof.values())
                and self.result.get('directChildReaped') and not self.result['cleanupErrors']):
            try:
                ACTIVE.finish()
            except (OSError, ValueError):
                self.fail('capture-finalization-failed')
        snapshot = ACTIVE.snapshot()
        self.result['retainedBytes'] = {name: row['retained'] for name, row in snapshot['streams'].items()}
        self.result['discardedBytes'] = {name: row['discarded'] for name, row in snapshot['streams'].items()}
        self.result['uncertainBytes'] = {name: row['uncertain'] for name, row in snapshot['streams'].items()}
        self.result['rawFieldsSuppressed'] = True


def install(capture):
    global ACTIVE
    ACTIVE = capture
    transport.Capture = ProtectedCapture
