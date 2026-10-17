"""Conservative single-owner attempt journal (schema 1).

Exclusive-create + fsync for reserve; same-directory os.replace for the
reserved -> attempted flip. Mock-grade: single owner, no multiprocess
durability guarantees, no hostile-symlink hardening.
"""
import json
import os
import tempfile

SCHEMA = 1
STATE_RESERVED = "reserved"
STATE_ATTEMPTED = "attempted"
DELIVERY_UNKNOWN = "unknown"

class JournalError(Exception):
    """Base error for journal operations."""

class AttemptRefused(JournalError):
    """Existing or mismatched record; the operation must not proceed."""

class JournalCorrupt(JournalError):
    """Record exists but is unreadable or off-schema."""

def _dump(record):
    return json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"

def load_record(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            record = json.load(handle)
    except FileNotFoundError as exc:
        raise JournalError(f"no journal record at {path}") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise JournalCorrupt(f"record at {path} is not JSON") from exc
    except OSError as exc:
        raise JournalCorrupt(f"record at {path} unreadable: {exc}") from exc
    if not isinstance(record, dict) or record.get("schema") != SCHEMA:
        raise JournalCorrupt(f"record at {path} is not schema {SCHEMA}")
    return record

def reserve(path, nonce, source_sha):
    """Exclusively create a reserved record; refuse if anything exists at path."""
    record = {"schema": SCHEMA, "nonce": nonce, "sourceSha256": source_sha,
              "state": STATE_RESERVED, "delivery": DELIVERY_UNKNOWN}
    try:
        handle = open(path, "xb")
    except FileExistsError as exc:
        raise AttemptRefused(f"attempt already recorded at {path}") from exc
    with handle:
        handle.write(_dump(record).encode('utf-8'))
        handle.flush()
        os.fsync(handle.fileno())

def mark_attempted(path, nonce):
    """Atomically flip reserved -> attempted; makes no delivery claim."""
    record = load_record(path)
    if record.get("nonce") != nonce:
        raise AttemptRefused(f"nonce mismatch at {path}")
    if record.get("state") != STATE_RESERVED:
        raise AttemptRefused(f"state {record.get('state')!r} is not reserved")
    record["state"] = STATE_ATTEMPTED
    replace_record(path, record)

def replace_record(path, record):
    directory = os.path.dirname(os.path.abspath(path))
    fd, temp_path = tempfile.mkstemp(dir=directory, prefix=".journal-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(_dump(record))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    except OSError as original:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
        except OSError as cleanup_error:
            original.add_note('journal temporary cleanup: ' + repr(cleanup_error))
        raise


def mark_pressure_attempt(path, nonce, byte_count):
    record = load_record(path)
    if record.get('nonce') != nonce or record.get('state') != STATE_ATTEMPTED or 'pressureWrite' in record:
        raise AttemptRefused('pressure-attempt-not-new')
    record['pressureWrite'] = {'sequence': 3, 'bytes': byte_count,
        'state': STATE_ATTEMPTED, 'delivery': DELIVERY_UNKNOWN}
    replace_record(path, record)
