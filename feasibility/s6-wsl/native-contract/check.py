"""Check the frozen acceptance plan offline. Never launches or grants admission."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = 'output/s6-native-contract'
GATES = {'L1': 'PARTIAL', 'L2': 'PARTIAL', 'P1': 'OPEN', 'P2': 'OPEN', 'A1': 'BLOCKED'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'duplicate-json-key')
        result[key] = value
    return result


def invalid_constant(_value):
    raise ValueError('nonfinite-json-number')


def load(path):
    require(path.stat().st_size <= 1024 * 1024, 'oversized-plan-document')
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object,
                     parse_constant=invalid_constant)


def bound_path(root, name):
    require(isinstance(name, str) and '\\' not in name and ':' not in name, 'invalid-bound-path')
    relative = PurePosixPath(name)
    require(not relative.is_absolute() and bool(relative.parts)
            and all(part not in ('.', '..') for part in relative.parts)
            and relative.as_posix() == name, 'invalid-bound-path')
    path = root
    for part in relative.parts:
        path = path / part
        require(not path.is_symlink(), 'symlink-bound-path')
    require(path.is_file() and path.resolve().is_relative_to(root.resolve()), 'missing-or-escaped-bound-path')
    return path


def validate_plan(plan):
    require(plan['schema'] == 'tiye-native-contract-v1', 'wrong-contract-schema')
    require(plan['purpose'] == 'offline-acceptance-plan-not-launcher-or-admission', 'wrong-purpose')
    require(plan['nativeExecutionAllowed'] is False and plan['nativeAdmissionGranted'] is False
            and plan['phase1'] == 'HOLD' and plan['states'] == GATES, 'admission-promotion')
    provider = plan['provider']
    require(provider['productRouteEligible'] is False
            and provider['u0RequiresProductRouteEligibility'] is False
            and provider['authenticatedCasesRequireProductRouteEligibility'] is True,
            'route-scope-promotion-or-conflation')
    candidate = plan['candidate']
    require(candidate['version'] == '0.157.1' and candidate['binarySha256'] ==
            '3e2584f3f3829a43a0495011a1cecb2facbe64a2403e2b682351fd9c2983f970'
            and candidate['argvTail'] == ['app-server', '--listen', 'stdio://']
            and candidate['currentIdentityRechecked'] is False
            and candidate['helperIdentityReviewed'] is False
            and candidate['finalLauncherCompositionFrozen'] is False
            and candidate['modelRequestedInU0'] is False, 'candidate-promotion-or-drift')
    u0 = plan['u0']
    require(type(u0['attempts']) is int and u0['attempts'] == 1
            and type(u0['retries']) is int and u0['retries'] == 0, 'attempt-policy')
    packets = [
        {'id': 1, 'method': 'initialize', 'params': {
            'clientInfo': {'name': 'tiye_feasibility', 'title': 'TIYE feasibility', 'version': '0.0.1'},
            'capabilities': {'experimentalApi': False}}},
        {'method': 'initialized'},
    ]
    require(json.dumps(u0['packets'], sort_keys=True) == json.dumps(packets, sort_keys=True), 'u0-wire-drift')
    env = plan['environment']
    require(env['linuxKeys'] == ['PATH', 'LC_ALL', 'HOME', 'CODEX_HOME', 'TMPDIR']
            and env['inheritEnvironment'] is False and env['importWslenv'] is False
            and env['copyCachedCredentialsOrConfig'] is False, 'credential-environment-drift')
    budget = plan['deadlines']
    expected = {'overallSeconds': 90, 'workCutoffSeconds': 60, 'cleanupReserveSeconds': 15,
                'observationReserveSeconds': 15, 'hostToWslSeconds': 30,
                'childStartupSeconds': 15, 'initializeSeconds': 15}
    require(all(type(budget[key]) is int and budget[key] == value for key, value in expected.items())
            and budget['cleanupPhasesSeconds'] == [5, 5, 5], 'deadline-drift')
    capture = plan['capture']
    limits = {'inputRecordIncludingLfBytes': 16384, 'outboundTotalIncludingLfBytes': 32768,
              'outputRecordExcludingLfBytes': 262144,
              'retainedStdoutBytes': 4194304, 'retainedStderrBytes': 1048576,
              'metadataBytes': 1048576, 'windowsCaptureTotalBytes': 6291456,
              'readChunkBytes': 16384, 'plannedRawBufferBytes': 524288}
    require(all(type(capture[key]) is int and capture[key] == value for key, value in limits.items())
            and capture['writerStatus'] == 'unimplemented-for-native-stream-budgets', 'capture-promotion-or-drift')
    require(plan['laterT0']['status'] == 'not-admitted-no-wire-contract'
            and plan['laterT0']['expectedUtf8'] == 'TIYE_NATIVE_PROBE_V1\n'
            and type(plan['laterT0']['attempts']) is int and plan['laterT0']['attempts'] == 1
            and type(plan['laterT0']['retries']) is int and plan['laterT0']['retries'] == 0,
            't0-promotion-or-effect-drift')


def check(root=ROOT):
    index = load(bound_path(root, OUTPUT + '/index.json'))
    require(set(index) == {'schema', 'bindings'} and index['schema'] == 'tiye-native-contract-index-v1',
            'wrong-index-schema')
    bindings = index['bindings']
    require(isinstance(bindings, dict) and len(bindings) >= 10, 'incomplete-index')
    required = {OUTPUT + '/' + name for name in ('contract.json', 'README.md', 'review.json', 'verification.json')}
    required |= {'feasibility/s6-wsl/native-contract/check.py', 'feasibility/s6-wsl/native-contract/test_contract.py',
                 'output/s4-codex-native-protocol/README.md', 'output/s6-admission-reconciliation/status.json'}
    require(required <= set(bindings), 'missing-required-binding')
    for name, expected in bindings.items():
        require(isinstance(expected, str) and len(expected) == 64
                and all(char in '0123456789abcdef' for char in expected), 'invalid-digest')
        actual = hashlib.sha256(bound_path(root, name).read_bytes()).hexdigest()
        require(actual == expected, 'changed-bound-file:' + name)
    plan = load(bound_path(root, OUTPUT + '/contract.json'))
    validate_plan(plan)
    return {'contractVerified': True, 'nativeExecutionAllowed': False,
            'nativeAdmissionGranted': False, 'phase1': 'HOLD', 'states': dict(GATES)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    print(json.dumps(check(), sort_keys=True))


if __name__ == '__main__':
    main()
