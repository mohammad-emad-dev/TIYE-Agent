"""Validate the explicit owner's approval against the frozen proposal."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def main():
    approval = json.loads((OUTPUT / 'approval.json').read_text(encoding='utf-8'))
    assert approval['response'] == 'Approve the internal Phase 2A amendment'
    assert approval['proposalCommit'] == '8f2d0a2'
    assert approval['developmentAuthorized'] is True
    assert approval['executionRequiresParentSourceReview'] is True
    assert approval['nativeProviderExecutionAllowed'] is False and approval['releaseAllowed'] is False
    for name, expected in approval['proposalArtifacts'].items():
        data = subprocess.run(['git', 'show', '8f2d0a2:' + name], cwd=ROOT,
                              capture_output=True, check=True).stdout
        assert hashlib.sha256(data).hexdigest() == expected, name
        assert (ROOT / name).read_bytes() == data, 'frozen proposal changed: ' + name
    print('Explicit Phase 2A approval matches frozen proposal; source review still required before execution')

if __name__ == '__main__':
    main()
