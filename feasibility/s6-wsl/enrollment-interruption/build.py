"""Extend sealed prebound recovery with read-only status and fixed fault probes."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import zlib

SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('interruption_sealed_build', SOURCE.parent / 'prebound-recovery/build.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)


def generated():
    template = frozen.generated().decode('utf-8')
    assignment, = [node for node in ast.parse(template).body if isinstance(node, ast.Assign)
                   and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)
                   and node.targets[0].id == 'parts']
    packed = ast.literal_eval(assignment.value.args[0].args[0])
    parts = frozen.frozen.frozen.frozen.decode_sources(base64.b64decode(packed, validate=True))
    unused_drivers = {'unknown_observe', 'observer_line', 'supervised_case', 'run_cases'}
    lines = parts['extension'].splitlines(keepends=True)
    definitions = [node for node in ast.parse(parts['extension']).body
                   if isinstance(node, ast.FunctionDef) and node.name in unused_drivers]
    if {node.name for node in definitions} != unused_drivers or len(definitions) != len(unused_drivers):
        raise ValueError('sealed-unused-driver-set-drift')
    for node in sorted(definitions, key=lambda node: node.lineno, reverse=True):
        del lines[node.lineno - 1:node.end_lineno]
    parts['extension'] = ''.join(lines)
    finalizer = '    finally:\n        peer.close()\n        if view is not None:'
    if parts['extension'].count(finalizer) != 1:
        raise ValueError('sealed-keeper-finalizer-hook-drift')
    parts['extension'] = parts['extension'].replace(finalizer,
        '    except (ValueError, OSError, TimeoutError) as fault:\n'
        '        persist_keeper_fault(receiptfd, nonce, fault)\n'
        '        raise\n' + finalizer)
    sealed = (SOURCE.parent / 'prebound-recovery/observer.py').read_text(encoding='utf-8')
    handler, = [ast.get_source_segment(sealed, node) for node in ast.parse(sealed).body
                if isinstance(node, ast.FunctionDef) and node.name == 'recovery_request']
    needle = "    require(request.get('nonce') == bound.nonce, 'recovery-request-nonce')"
    if handler.count(needle) != 1:
        raise ValueError('sealed-request-hook-drift')
    handler = handler.replace(needle, needle + '''
    if request.get('event') == 'inspect-recovery':
        send_packet(peer, reconciliation(SimpleNamespace(peer=peer, request=request), view, bound, state))
        return False
    if request.get('event') == 'enroll-fixed-partial-record':
        release_authority(peer, bound)
        require(state.fixture and set(request) == {'event', 'nonce', 'identity'}, 'partial-fault-not-fixed-fixture')
        global PARTIAL_WRITE_FIXTURE
        PARTIAL_WRITE_FIXTURE = True
        try:
            enroll_successor(request, view, bound, state)
        finally:
            PARTIAL_WRITE_FIXTURE = False
        raise ValueError('partial-write-fault-did-not-fire')''')
    parts['extension'] += '\n' + (SOURCE / 'reconcile.py').read_text(encoding='utf-8')
    parts['extension'] += '\n' + handler + '\n' + (SOURCE / 'fault_probe.py').read_text(encoding='utf-8')
    document = json.dumps(parts, sort_keys=True).encode()
    if len(document) > 131072:
        raise ValueError('decompressed-composition-cap')
    replacement = base64.b64encode(zlib.compress(document, 9)).decode()
    if template.count(repr(packed)) != 1:
        raise ValueError('sealed-payload-hook-drift')
    template = template.replace("'observe','unknown_observe','recover_unknown'", "'observe','recover_unknown'")
    return template.replace(repr(packed), repr(replacement)).encode('utf-8')


if __name__ == '__main__':
    (SOURCE / 'linux_runtime.py').write_bytes(generated())
