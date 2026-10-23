"""Add read-only enrollment reconciliation while preserving the one-shot pin."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import zlib

SOURCE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('interrupted_inspector_sealed_build',SOURCE.parent/'custody-recovery/build.py')
frozen=importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)


def generated():
    template=frozen.generated().decode()
    assignment,=[node for node in ast.parse(template).body if isinstance(node,ast.Assign)
        and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='parts']
    packed=ast.literal_eval(assignment.value.args[0].args[0])
    parts=json.loads(zlib.decompress(base64.b64decode(packed,validate=True)))
    extension=parts['extension']
    lines=extension.splitlines(keepends=True)
    unused={'enroll_observed_inspector','verify_retained','wait_explicit_fixture_disposal','dispose_observed_fixture'}
    definitions=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name in unused]
    if {node.name for node in definitions}!=unused:
        raise ValueError('interrupted-inspector-unused-driver-drift')
    obsolete=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name=='recovery_request']
    if len(obsolete)!=2 or any(isinstance(node,ast.Assign) and isinstance(node.value,ast.Name)
            and node.value.id=='recovery_request' for node in ast.parse(extension).body):
        raise ValueError('interrupted-inspector-shadowed-handler-drift')
    definitions+=obsolete[:-1]
    shadowed=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name=='namespace_worker']
    if len(shadowed)!=2 or any(isinstance(node,ast.Assign) and isinstance(node.value,ast.Name)
            and node.value.id=='namespace_worker' for node in ast.parse(extension).body):
        raise ValueError('interrupted-inspector-shadowed-worker-drift')
    definitions+=shadowed[:-1]
    for node in sorted(definitions,key=lambda node:node.lineno,reverse=True):
        del lines[node.lineno-1:node.end_lineno]
    extension=''.join(lines)
    handlers=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name=='recovery_request']
    handler=ast.get_source_segment(extension,handlers[-1])
    needle="    require(request.get('nonce') == bound.nonce, 'recovery-request-nonce')"
    if handler.count(needle)!=1:
        raise ValueError('interrupted-inspector-status-hook-drift')
    patched=handler.replace(needle,needle+"\n    if request.get('event') == 'inspect-custody-enrollment':\n        send_packet(peer, inspector_enrollment_status(SimpleNamespace(peer=peer, request=request), view, bound, state))\n        return False")
    extension=extension.replace(handler,patched,1)
    needle='    enroll_observed_inspector(witness)'
    if extension.count(needle)!=1:
        raise ValueError('interrupted-inspector-manifest-hook-drift')
    extension=extension.replace(needle,'    witness.interruption_manifest=digest\n'+needle)
    needle="    require(cgroup_empty(witness.cgroup),'evidence-fault-before-worker-exit')"
    if extension.count(needle)!=1:
        raise ValueError('interrupted-inspector-cgroup-wait-hook-drift')
    extension=extension.replace(needle,"    deadline=time.monotonic()+3\n    while not cgroup_empty(witness.cgroup):\n        require(time.monotonic()<deadline,'evidence-fault-before-worker-exit')\n        time.sleep(0.01)")
    for name in ('status.py','probe.py'):
        extension+='\n'+(SOURCE/name).read_text(encoding='utf-8')
    parts['extension']=extension
    document=json.dumps(parts,sort_keys=True).encode()
    if len(document)>131072 or template.count(repr(packed))!=1:
        raise ValueError('interrupted-inspector-composition-cap-or-drift')
    return template.replace(repr(packed),repr(base64.b64encode(zlib.compress(document,9)).decode())).encode()


if __name__=='__main__':
    (SOURCE/'linux_runtime.py').write_bytes(generated())
