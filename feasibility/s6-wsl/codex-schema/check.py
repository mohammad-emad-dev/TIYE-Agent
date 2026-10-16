"""Verify saved generation bytes and derive declarations, without executing Codex."""
import argparse
import base64
import hashlib
import json
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/s4-codex-schema'
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def method_map(schema):
    entries = {}
    for variant in schema['oneOf']:
        props = variant.get('properties', {})
        for name in props.get('method', {}).get('enum', []):
            assert name not in entries
            entries[name] = {'requiredEnvelopeFields': variant.get('required', []),
                             'paramsRef': props.get('params', {}).get('$ref')}
    return entries


def derive(schemas, evidence):
    maps = {n: method_map(schemas[n + '.json']) for n in
            ['ClientRequest', 'ClientNotification', 'ServerRequest', 'ServerNotification']}
    wanted = {
        'ClientRequest': ['initialize', 'thread/start', 'thread/resume', 'turn/start', 'turn/interrupt', 'account/login/start', 'model/list'],
        'ClientNotification': ['initialized'],
        'ServerRequest': ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'],
        'ServerNotification': ['turn/completed', 'item/agentMessage/delta', 'serverRequest/resolved']}
    for family, names in wanted.items():
        assert all(name in maps[family] for name in names), (family, names)
    selected = ['v1/InitializeParams.json', 'v2/ThreadStartParams.json', 'v2/TurnStartParams.json',
                'v2/TurnInterruptParams.json', 'v2/TurnCompletedNotification.json',
                'CommandExecutionRequestApprovalParams.json', 'FileChangeRequestApprovalParams.json']
    shapes = {name: {'required': schemas[name].get('required', []),
                     'properties': sorted(schemas[name].get('properties', {}))} for name in selected}
    login = schemas['v2/LoginAccountParams.json']['oneOf']
    variants = {v['properties']['type']['enum'][0]: v for v in login}
    tokens = variants['chatgptAuthTokens']
    assert 'FOR OPENAI INTERNAL USE ONLY - DO NOT USE' in tokens['description']
    decisions = schemas['CommandExecutionRequestApprovalResponse.json']['definitions']['CommandExecutionApprovalDecision']['oneOf']
    decision_labels = [v['enum'][0] if 'enum' in v else next(iter(v['properties'])) for v in decisions]
    assert set(decision_labels) == {'accept', 'acceptForSession', 'decline', 'cancel',
                                    'acceptWithExecpolicyAmendment', 'applyNetworkPolicyAmendment'}
    turn = schemas['v2/TurnCompletedNotification.json']['definitions']
    assert set(turn['TurnStatus']['enum']) == {'completed', 'interrupted', 'failed', 'inProgress'}
    effort = schemas['v2/TurnStartParams.json']['definitions']['ReasoningEffort']
    assert effort['type'] == 'string' and effort['minLength'] == 1 and 'enum' not in effort
    return {
        'schema': 'tiye-codex-declared-capabilities-v1', 'cliVersion': '0.157.1',
        'evidenceLevel': 'generated-schema-only', 'schemaFileCount': len(schemas),
        'archiveSha256': evidence['native']['archiveSha256'],
        'declaredMethods': {family: {n: maps[family][n] for n in names} for family, names in wanted.items()},
        'parameterShapes': shapes,
        'turnCompletion': {'required': schemas['v2/TurnCompletedNotification.json']['required'],
                           'turnRequired': turn['Turn']['required'], 'statusEnum': turn['TurnStatus']['enum'],
                           'proposedCompletionRule': 'Match owned threadId and turn.id; status completed is protocol completion only; task success needs application outcome evidence',
                           'runtimeTested': False},
        'commandApprovalDecisionVariants': decision_labels,
        'fileGrantRootDescription': schemas['FileChangeRequestApprovalParams.json']['properties']['grantRoot']['description'],
        'reasoningEffort': effort,
        'externalTokenLogin': {'variant': 'chatgptAuthTokens', 'description': tokens['description'],
                               'useInTIYEApproved': False, 'scope': 'This exact login variant in this version only'},
        'notEstablished': ['Authentication or model entitlement', 'Runtime ordering or cancellation behavior',
                           'Approval enforcement or containment', 'Commercial integration eligibility',
                           'Terminal adapter replacement or production transport choice'],
        'fullS4Qualified': False, 'fullS6Qualified': False, 'phase1Construction': 'HOLD'
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write-summary', action='store_true')
    args = parser.parse_args()
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    assert evidence['state'] == 'schema-generated' and evidence['exitCode'] == 0 and evidence['sourcesUnchanged']
    assert evidence['attempts'] == 1 and evidence['retries'] == 0
    assert not evidence['fullS4Qualified'] and not evidence['fullS6Qualified'] and evidence['phase1Construction'] == 'HOLD'
    for name, digest in evidence['sourceSha256'].items():
        assert sha((ROOT / name).read_bytes()) == digest, name
    installed_bytes = (ROOT / 'output/s4-codex-candidate/installation.json').read_bytes()
    assert sha(installed_bytes) == evidence['installationSha256']
    for name in ['stdout', 'stderr']:
        raw = (OUT / (name + '.bin')).read_bytes()
        assert len(raw) == evidence[name]['bytes'] and sha(raw) == evidence[name]['sha256']
    assert (OUT / 'stderr.bin').read_bytes() == b''
    native = evidence['native']
    wire = json.loads((OUT / 'stdout.bin').read_bytes())
    packed = base64.b64decode(wire.pop('archiveBase64'), validate=True)
    assert wire == native and packed == (OUT / 'schemas.zip').read_bytes()
    assert sha(packed) == native['archiveSha256']
    assert native['uid'] > 0 and not native['modelRequestRun'] and not native['appServerSessionStarted']
    installed = json.loads(installed_bytes)
    assert native['binarySha256'] == installed['linux']['binarySha256']
    results = native['results']
    assert len(results) == 3 and all(r['exitCode'] == 0 and not r['stderr'] for r in results)
    assert results[0]['args'] == ['--version'] and results[0]['stdout'].strip() == 'codex-cli 0.157.1'
    assert results[1]['args'] == ['app-server', 'generate-json-schema', '--help']
    assert results[2]['args'] == ['app-server', 'generate-json-schema', '--out', native['root'] + '/schemas']
    schemas = {}
    with zipfile.ZipFile(OUT / 'schemas.zip') as archive:
        assert len(archive.namelist()) == len(set(archive.namelist())) == len(native['inventory'])
        for item in native['inventory']:
            name = item['path']
            assert not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
            raw = archive.read(name)
            assert len(raw) == item['bytes'] and sha(raw) == item['sha256']
            schemas[name] = json.loads(raw)
    summary = derive(schemas, evidence)
    dest = OUT / 'capabilities.json'
    if args.write_summary:
        with dest.open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(json.dumps(summary, indent=2) + '\n')
    else:
        assert json.loads(dest.read_text(encoding='utf-8')) == summary
    print('Saved Codex schema bytes and declared capability map verified; runtime and product access remain unqualified')


if __name__ == '__main__':
    main()
