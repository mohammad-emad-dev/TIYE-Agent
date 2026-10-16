"""Read one recorded Linux process identity without signaling it."""
import hashlib
import json
import sys
from pathlib import Path

expected = json.load(sys.stdin)
boot = hashlib.sha256(Path('/proc/sys/kernel/random/boot_id').read_bytes()).hexdigest()
base = Path('/proc') / str(expected['pid'])
try:
    fields = (base / 'stat').read_text().rsplit(')', 1)[1].split()
    uid = int(next(line for line in (base / 'status').read_text().splitlines() if line.startswith('Uid:')).split()[1])
    nonce_match = expected['nonce'].encode() in (base / 'cmdline').read_bytes().split(b'\0')[-2:]
    result = {'pid': expected['pid'], 'startTicks': int(fields[19]), 'uid': uid,
              'bootIdSha256': boot, 'state': fields[0], 'nonceMatched': nonce_match,
              'children': (base / 'task' / str(expected['pid']) / 'children').read_text().split()}
    result['status'] = 'verified-live' if result['startTicks'] == expected['startTicks'] and uid == expected['uid'] and nonce_match else 'unverified'
except FileNotFoundError:
    result = {'status': 'gone', 'bootIdSha256': boot}
print(json.dumps(result))
