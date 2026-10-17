"""Fixed identity-bound Stop request on the separate service control channel."""
import json
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import service

folder, nonce, mode = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
if folder != SOURCE or mode != 'stop-pending':
    raise ValueError('fixed-stop-only')
descriptor = json.loads((folder / 'descriptor.json').read_text())
if descriptor['unit'] != 'tiye-service-' + nonce + '.service':
    raise ValueError('stop-nonce-mismatch')
print(json.dumps({'nonce': nonce, 'stop': service.stop_owned(descriptor)}), flush=True)
