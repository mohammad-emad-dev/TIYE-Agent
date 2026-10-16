"""Read only synthetic selected values and stdin briefing; no provider or file writes."""
import hashlib
import json
import os
import subprocess
import sys

ALLOWED = ['TIYE_SENTINEL', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE',
           'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE']
DESCENDANT = '''import hashlib,json,os,sys
payload=json.load(sys.stdin)
raw=payload['briefing'].encode('utf-8')
print(json.dumps({'selected':{k:os.environ[k] for k in payload['allowedKeys'] if k in os.environ},
 'decoyPresent':'TIYE_NOT_FOR_CHILD' in os.environ,
 'briefing':{'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'lines':len(payload['briefing'].splitlines()),'taskId':payload['taskId']}}))
'''


def main():
    payload = json.load(sys.stdin)
    if payload['allowedKeys'] != ALLOWED:
        raise ValueError('Allowlist mismatch')
    raw = payload['briefing'].encode('utf-8')
    selected = {key: os.environ[key] for key in ALLOWED if key in os.environ}
    environment = {key: os.environ[key] for key in ['PATH', 'LC_ALL', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL']}
    environment.update(selected)
    child = subprocess.run(['/usr/bin/python3', '-c', DESCENDANT], input=json.dumps(payload).encode('utf-8'),
                           capture_output=True, timeout=5, env=environment, cwd='/tmp', check=True)
    if child.stderr:
        raise RuntimeError('Descendant stderr')
    result = {'selected': selected, 'decoyPresent': 'TIYE_NOT_FOR_CHILD' in os.environ,
              'uidNonzero': os.getuid() != 0,
              'briefing': {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
                           'lines': len(payload['briefing'].splitlines()), 'taskId': payload['taskId']},
              'descendant': json.loads(child.stdout), 'descendantExitCode': child.returncode,
              'gitIdents': {}}
    if 'GIT_AUTHOR_NAME' in selected:
        for name in ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']:
            completed = subprocess.run(['/usr/bin/git', 'var', name], capture_output=True,
                                       timeout=5, env=environment, cwd='/tmp', check=True)
            if completed.stderr:
                raise RuntimeError('Git identity stderr')
            result['gitIdents'][name] = completed.stdout.decode('utf-8').rstrip('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
