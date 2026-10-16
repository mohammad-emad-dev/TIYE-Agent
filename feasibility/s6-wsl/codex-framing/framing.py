"""Bounded offline JSONL policy; no process, socket, auth or reply transmission."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'codex-replay'))
from replay import ReplayError, ReplaySession, decode_packet


class JsonlStream:
    """Return ordered events, including valid prefixes before a terminal failure."""

    def __init__(self, max_line=65536, max_chunk=262144, max_frames=256):
        if any(type(x) is not int or x <= 0 for x in (max_line, max_chunk, max_frames)):
            raise ValueError('positive-integer-limits-required')
        if max_line > 65536:
            raise ValueError('line-limit-exceeds-frozen-decoder')
        self.max_line, self.max_chunk, self.max_frames = max_line, max_chunk, max_frames
        self.buffer = bytearray()
        self.state = 'open'

    def fail(self, reason):
        self.buffer.clear()
        self.state = 'failed'
        return {'event': 'stream-failed', 'reason': reason}

    def feed(self, chunk):
        if self.state != 'open':
            raise ReplayError('stream-closed')
        if type(chunk) is not bytes:
            raise TypeError('bytes-required')
        if len(chunk) > self.max_chunk:
            return [self.fail('chunk-too-large')]
        events, offset = [], 0
        while offset < len(chunk):
            end = chunk.find(b'\n', offset)
            stop = len(chunk) if end == -1 else end
            if len(self.buffer) + stop - offset > self.max_line:
                events.append(self.fail('line-too-large'))
                return events
            self.buffer.extend(chunk[offset:stop])
            if end == -1:
                break
            if len(events) >= self.max_frames:
                events.append(self.fail('frame-budget-exceeded'))
                return events
            raw = bytes(self.buffer)
            self.buffer.clear()
            if raw.endswith(b'\r'):
                raw = raw[:-1]
            try:
                text = raw.decode('utf-8', errors='strict')
                if not text.strip() or text.startswith('\ufeff'):
                    raise ReplayError('blank-or-bom-record')
                packet = decode_packet(text)
                # Frozen decoder accepts exponent overflow and escaped lone surrogates.
                # This stream policy refuses both before canonical fingerprinting.
                json.dumps(packet, ensure_ascii=False, allow_nan=False).encode('utf-8')
            except (ReplayError, ValueError, UnicodeError, RecursionError):
                events.append(self.fail('invalid-record'))
                return events
            events.append({'event': 'packet', 'packet': packet})
            offset = end + 1
        return events

    def eof(self):
        if self.state != 'open':
            raise ReplayError('stream-closed')
        if self.buffer:
            return self.fail('truncated-record')
        self.state = 'closed'
        return {'event': 'stream-closed'}


class OfflineConnection:
    """Single connection owner. Replies remain local plans, never sent."""

    def __init__(self, archive, **limits):
        self._session = ReplaySession(archive)
        self._stream = JsonlStream(**limits)
        self.open = True

    def snapshot(self):
        return {'transportOpen': self.open, 'protocolStatus': self._session.status,
                'taskSuccess': self._session.task_success}

    def feed(self, chunk):
        if not self.open:
            raise ReplayError('connection-closed')
        results = []
        for event in self._stream.feed(chunk):
            if event['event'] == 'stream-failed':
                self.open = False
                self._session.status = 'needs-attention'
                results.append(event)
                break
            try:
                results.append(self._session.receive(event['packet']))
            except (ReplayError, ValueError, UnicodeError, RecursionError):
                self.open = False
                self._session.status = 'needs-attention'
                results.append(self._stream.fail('invalid-protocol-message'))
                break
        return results

    def disconnect(self):
        if not self.open:
            raise ReplayError('connection-closed')
        event = self._stream.eof()
        self.open = False
        if event['event'] == 'stream-failed' or self._session.status == 'running':
            self._session.status = 'needs-attention'
        return event

    def decide(self, ident, choice, fingerprint):
        if not self.open:
            raise ReplayError('connection-closed')
        return self._session.decide(ident, choice, fingerprint)
